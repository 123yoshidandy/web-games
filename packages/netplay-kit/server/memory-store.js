/**
 * 手元で使う保存先（テストと手元のテスト用サーバー用）
 * DynamoDB の保存先と同じ形で、部屋の版が違えば ConflictError を投げる
 *
 * keyPrefix（ゲームの名前）を渡すと、部屋のキーを DynamoStore と同じく「ゲーム#部屋番号」にする
 * from に別の MemoryStore を渡すと、その保存場所を共有する（1つのテーブルに複数のゲームを入れる形をまねる）
 */

import { ConflictError, OPEN_LIST, openRoomOf } from './room-service.js';

const clone = (value) => (value === undefined ? undefined : structuredClone(value));

export class MemoryStore {
    constructor({ keyPrefix = '', from = null } = {}) {
        this.keyPrefix = keyPrefix ? `${keyPrefix}#` : '';
        this.rooms = from?.rooms ?? new Map();
        this.connections = from?.connections ?? new Map();
        this.games = from?.games ?? new Map(); // 接続 → ゲームの名前（router が使う）
        this.reads = 0;  // 読み込みの回数（テストで、中継のたびの読み込みを確かめるため）
        this.writes = 0;
    }

    roomKey(code) {
        return `${this.keyPrefix}${code}`;
    }

    async getRoom(code) {
        this.reads++;
        return clone(this.rooms.get(this.roomKey(code))) ?? null;
    }

    // 新しい部屋（previousVersion が 0）は、同じ番号の部屋がないか、あっても期限を過ぎているときだけ作る
    async putRoom(room, previousVersion, nowSeconds = Math.floor(Date.now() / 1000)) {
        const current = this.rooms.get(this.roomKey(room.code));
        const expired = current?.expiresAt !== undefined && current.expiresAt <= nowSeconds;
        const currentVersion = !current || (previousVersion === 0 && expired) ? 0 : current.version;
        if (currentVersion !== previousVersion) {
            throw new ConflictError();
        }
        this.writes++;
        this.rooms.set(this.roomKey(room.code), clone(room));
    }

    // 公開の部屋で、status（ロビーで待っている 'lobby' か、観戦できる 'playing'）で、期限を過ぎていないもの（このゲームの部屋だけ）
    async listPublicRooms(nowSeconds = Math.floor(Date.now() / 1000), { status = 'lobby' } = {}) {
        this.reads++;
        return [...this.rooms.entries()]
            .filter(([key, room]) => key === this.roomKey(room.code)
                && room.isPublic && room.status === status && room.expiresAt > nowSeconds)
            .map(([, room]) => clone(room));
    }

    // 全ゲームの、ロビーで人を待っている部屋（新しい順。DynamoStore の listOpenRooms と同じ形）
    // 共有の保存場所のキーは「ゲーム#部屋番号」なので、そこからゲームの名前を取る（頭のない部屋は載せない）
    async listOpenRooms(nowSeconds = Math.floor(Date.now() / 1000), { limit = 50 } = {}) {
        this.reads++;
        return [...this.rooms.entries()]
            .filter(([, room]) => room.openList === OPEN_LIST && room.expiresAt > nowSeconds)
            .map(([key, room]) => openRoomOf({ ...room, pk: `ROOM#${key}` }))
            .filter(Boolean)
            .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))
            .slice(0, limit);
    }

    async getConnection(connectionId) {
        this.reads++;
        return clone(this.connections.get(connectionId)) ?? null;
    }

    async putConnection(connection) {
        this.writes++;
        this.connections.set(connection.connectionId, clone(connection));
    }

    async deleteConnection(connectionId) {
        this.connections.delete(connectionId);
    }

    // ===== 接続ごとのゲーム（router 用） =====

    async getConnectionGame(connectionId) {
        return clone(this.games.get(connectionId)) ?? null;
    }

    async putConnectionGame(connectionId, game, expiresAt) {
        this.games.set(connectionId, { game, expiresAt });
    }

    async deleteConnectionGame(connectionId) {
        this.games.delete(connectionId);
    }
}
