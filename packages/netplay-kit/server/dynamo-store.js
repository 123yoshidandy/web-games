/**
 * DynamoDB の保存先
 * 1つのテーブルに、部屋（pk = ROOM#部屋番号）と接続（pk = CONN#接続ID）を入れる
 * 接続には部屋番号だけを持ち、席番号は持たない（席は部屋の players から connectionId で求める）
 * どちらも expiresAt（UNIX秒）を過ぎると DynamoDB の TTL で自動的に消える
 * 公開の部屋の一覧は、テーブルを Scan して絞る（索引を足さずに済むように。部屋が数百までなら十分に軽い）
 * keyPrefix（ゲームの名前）を渡すと、部屋を ROOM#ゲーム#部屋番号 にする（1つのテーブルに複数のゲームを入れるため。router.js）
 * 接続（CONN#）は接続 ID が API の中で一意なので、頭を付けない
 */

const MAX_SCAN_PAGES = 10; // 公開の部屋の一覧で読むページ（1ページ最大1MB）の上限
// ゲームをまたいだ部屋の一覧の索引（GSI）。鍵は openList（'OPEN'）と openAt（作った時刻）で、載せる部屋にだけ付く（room-service.js の markOpenListing）
// 索引に写す項目は code・expiresAt・lobbyEntry だけでよい（web-games の server/template.yaml）
export const OPEN_ROOMS_INDEX = 'OpenRooms';

import { DynamoDBClient, ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, ScanCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ConflictError, OPEN_LIST, openRoomOf } from './room-service.js';

export class DynamoStore {
    constructor(tableName, client = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
        marshallOptions: { removeUndefinedValues: true }
    }), { keyPrefix = '' } = {}) {
        this.tableName = tableName;
        this.client = client;
        this.roomPrefix = keyPrefix ? `ROOM#${keyPrefix}#` : 'ROOM#';
    }

    // 強い整合性で読む（既定の結果整合性では、保存した直後に1つ前の部屋が返ることがあり、古い部屋で操作を判定してしまう）
    async getItem(pk) {
        const { Item } = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk }, ConsistentRead: true }));
        if (!Item) return null;
        const { pk: _pk, ...data } = Item;
        return data;
    }

    async getRoom(code) {
        return this.getItem(`${this.roomPrefix}${code}`);
    }

    // 読み込んだときの版のままなら保存する
    // 新しい部屋は、同じ番号の部屋がないか、あっても期限（nowSeconds）を過ぎているときだけ作る
    async putRoom(room, previousVersion, nowSeconds = Math.floor(Date.now() / 1000)) {
        const condition = previousVersion === 0
            ? {
                ConditionExpression: 'attribute_not_exists(pk) OR expiresAt <= :now',
                ExpressionAttributeValues: { ':now': nowSeconds }
            }
            : { ConditionExpression: 'version = :previous', ExpressionAttributeValues: { ':previous': previousVersion } };
        try {
            await this.client.send(new PutCommand({
                TableName: this.tableName,
                Item: { pk: `${this.roomPrefix}${room.code}`, ...room },
                ...condition
            }));
        } catch (error) {
            if (error instanceof ConditionalCheckFailedException || error.name === 'ConditionalCheckFailedException') {
                throw new ConflictError();
            }
            throw error;
        }
    }

    // 公開の部屋で、status（ロビーで待っている 'lobby' か、観戦できる 'playing'）で、期限を過ぎていないもの（一覧に要る項目だけを読む）
    async listPublicRooms(nowSeconds = Math.floor(Date.now() / 1000), { status = 'lobby' } = {}) {
        const rooms = [];
        let startKey;
        for (let page = 0; page < MAX_SCAN_PAGES; page++) {
            const { Items = [], LastEvaluatedKey } = await this.client.send(new ScanCommand({
                TableName: this.tableName,
                FilterExpression: 'begins_with(pk, :room) AND #isPublic = :true AND #status = :status AND #expiresAt > :now',
                ProjectionExpression: '#code, #isPublic, #status, #expiresAt, #createdAt, #players, #settings, #spectators',
                ExpressionAttributeNames: {
                    '#code': 'code', '#isPublic': 'isPublic', '#status': 'status', '#expiresAt': 'expiresAt',
                    '#createdAt': 'createdAt', '#players': 'players', '#settings': 'settings', '#spectators': 'spectators'
                },
                ExpressionAttributeValues: { ':room': this.roomPrefix, ':true': true, ':status': status, ':now': nowSeconds },
                ExclusiveStartKey: startKey
            }));
            rooms.push(...Items);
            if (!LastEvaluatedKey) break;
            startKey = LastEvaluatedKey;
        }
        return rooms;
    }

    // 全ゲームの、ロビーで人を待っている部屋（新しい順）。索引 OpenRooms を1回 Query するだけで、テーブルを Scan しない
    // TTL で消える前の期限切れは除く。索引は結果整合性なので、直前の変更が少し遅れて映ることがある
    async listOpenRooms(nowSeconds = Math.floor(Date.now() / 1000), { limit = 50 } = {}) {
        const { Items = [] } = await this.client.send(new QueryCommand({
            TableName: this.tableName,
            IndexName: OPEN_ROOMS_INDEX,
            KeyConditionExpression: '#openList = :open',
            FilterExpression: '#expiresAt > :now',
            ExpressionAttributeNames: { '#openList': 'openList', '#expiresAt': 'expiresAt' },
            ExpressionAttributeValues: { ':open': OPEN_LIST, ':now': nowSeconds },
            ScanIndexForward: false,
            Limit: limit
        }));
        return Items.map(openRoomOf).filter(Boolean);
    }

    async getConnection(connectionId) {
        return this.getItem(`CONN#${connectionId}`);
    }

    async putConnection(connection) {
        await this.client.send(new PutCommand({
            TableName: this.tableName,
            Item: { pk: `CONN#${connection.connectionId}`, ...connection }
        }));
    }

    async deleteConnection(connectionId) {
        await this.client.send(new DeleteCommand({ TableName: this.tableName, Key: { pk: `CONN#${connectionId}` } }));
    }

    // ===== 接続ごとのゲーム（router 用。部屋を出ても接続は残るので、CONN# とは別の項目にする） =====

    async getConnectionGame(connectionId) {
        return this.getItem(`GAME#${connectionId}`);
    }

    async putConnectionGame(connectionId, game, expiresAt) {
        await this.client.send(new PutCommand({
            TableName: this.tableName,
            Item: { pk: `GAME#${connectionId}`, game, expiresAt }
        }));
    }

    async deleteConnectionGame(connectionId) {
        await this.client.send(new DeleteCommand({ TableName: this.tableName, Key: { pk: `GAME#${connectionId}` } }));
    }
}
