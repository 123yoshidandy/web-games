/**
 * 利用者ごとの記録の DynamoDB の保存先（形は stats.js の MemoryStatsStore と同じ）
 * 1つのテーブル（pk だけ）に、次の2つを入れる
 *   USER#<名前のキー>   利用者ごとの数（stats.js の「保存の形」）。消えない
 *   RESULT#<記録の id>  数えた記録の印。同じ記録を2回数えないため（端末の送り直し・オンラインの保存のやり直し）。expiresAt で消える
 * 印を置くことと数を足すことを1つのトランザクションにする（印がもうあれば、何も足さない）
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { groupByUser, nameKey, normalizeName, statsFromItem } from './stats.js';

const RESULT_TTL_SECONDS = 90 * 24 * 60 * 60; // 印を残す長さ（端末の未送信の記録が、これより長く残ることはない）

export class DynamoStatsStore {
    constructor(tableName, client = DynamoDBDocumentClient.from(new DynamoDBClient({}))) {
        this.tableName = tableName;
        this.client = client;
    }

    // 同じ id の記録は2回目から数えない。数えたら true
    async record(record) {
        const users = groupByUser(record);
        if (users.length === 0) return false;
        const at = record.at ?? Date.now();
        const items = [
            {
                Put: {
                    TableName: this.tableName,
                    Item: { pk: `RESULT#${record.id}`, game: record.game, at, expiresAt: Math.floor(at / 1000) + RESULT_TTL_SECONDS },
                    ConditionExpression: 'attribute_not_exists(pk)'
                }
            },
            ...users.map(({ key, name, counters }) => {
                const names = { '#name': 'name', '#updatedAt': 'updatedAt' };
                const values = { ':name': name, ':at': at };
                const adds = Object.entries(counters).map(([counter, count], index) => {
                    names[`#c${index}`] = counter;
                    values[`:c${index}`] = count;
                    return `#c${index} :c${index}`;
                });
                return {
                    Update: {
                        TableName: this.tableName,
                        Key: { pk: `USER#${key}` },
                        UpdateExpression: `SET #name = :name, #updatedAt = :at ADD ${adds.join(', ')}`,
                        ExpressionAttributeNames: names,
                        ExpressionAttributeValues: values
                    }
                };
            })
        ];
        try {
            await this.client.send(new TransactWriteCommand({ TransactItems: items }));
            return true;
        } catch (error) {
            // 印がもうある（数え済み）なら、トランザクションの1つめが条件で断られる
            const reasons = error.CancellationReasons ?? [];
            if (error.name === 'TransactionCanceledException' && reasons[0]?.Code === 'ConditionalCheckFailed') return false;
            throw error;
        }
    }

    async get(name) {
        const key = nameKey(name);
        if (!key) return statsFromItem(null, normalizeName(name));
        const { Item } = await this.client.send(new GetCommand({ TableName: this.tableName, Key: { pk: `USER#${key}` } }));
        return statsFromItem(Item, normalizeName(name));
    }
}
