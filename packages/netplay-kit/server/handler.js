/**
 * API Gateway（WebSocket）から呼ばれる Lambda の入口を作る
 * $connect は受け付けるだけ、$disconnect で切断を片付け、それ以外のメッセージは部屋の処理に渡す
 *
 * 使い方（各ゲームの server/src/handler.js）:
 *   import { createHandler } from '../netplay/handler.js';
 *   import game from './game-definition.js';
 *   export const handler = createHandler(game);
 * web-games の1つのスタックにまとめるときは、ゲームの名前を keyPrefix に渡す（部屋のキーがゲームどうしでぶつからない。router.js）
 *   export const handler = createHandler(game, { keyPrefix: 'azul' });
 * 環境変数 STATS_TABLE_NAME（利用者ごとの記録のテーブル）があり、keyPrefix（ゲームの名前）を渡したときは、
 * 対戦が終わるたびに、人の席の結果を記録する（stats.js。ゲームの定義の result があればそれを使う）
 */

import { ApiGatewayManagementApiClient, PostToConnectionCommand } from '@aws-sdk/client-apigatewaymanagementapi';
import { RoomService, RateLimiter } from './room-service.js';
import { DynamoStore } from './dynamo-store.js';
import { DynamoStatsStore } from './dynamo-stats-store.js';
import { createMatchRecorder } from './stats.js';

const SEND_RETRY_DELAYS_MS = [100, 300, 900]; // 送信が 429 で断られたときに、送り直すまで待つ時間

export function createHandler(game, {
    tableName = process.env.TABLE_NAME, keyPrefix = '',
    statsTableName = process.env.STATS_TABLE_NAME, statsStore = null
} = {}) {
    // 以下は Lambda の呼び出しをまたいで使い回す
    const store = new DynamoStore(tableName, undefined, { keyPrefix });
    const stats = statsStore ?? (statsTableName && keyPrefix ? new DynamoStatsStore(statsTableName) : null);
    const onMatchEnd = stats && keyPrefix ? createMatchRecorder({ gameName: keyPrefix, definition: game, store: stats }) : null;
    const clients = new Map();          // 送信用のクライアント
    const connectionCache = new Map();  // 接続→部屋番号
    const limiter = new RateLimiter({ perSecond: game.messagesPerSecond ?? 10, burst: game.messagesBurst ?? 20 });

    const createService = ({ domainName, stage }) => {
        const endpoint = `https://${domainName}/${stage}`;
        if (!clients.has(endpoint)) {
            clients.set(endpoint, new ApiGatewayManagementApiClient({ endpoint }));
        }
        const client = clients.get(endpoint);
        // API Gateway に多すぎると断られたら（429）、間を空けて送り直す
        // 送れなかったら、CloudWatch のログに1行残す（切れた接続の GoneException も、古い接続に送っていないかの手がかりになる）
        const send = async (connectionId, message) => {
            for (let attempt = 0; ; attempt++) {
                try {
                    await client.send(new PostToConnectionCommand({
                        ConnectionId: connectionId,
                        Data: JSON.stringify(message)
                    }));
                    return;
                } catch (error) {
                    const throttled = error.name === 'TooManyRequestsException' || error.$metadata?.httpStatusCode === 429;
                    if (throttled && attempt < SEND_RETRY_DELAYS_MS.length) {
                        await new Promise(resolve => setTimeout(resolve, SEND_RETRY_DELAYS_MS[attempt]));
                        continue;
                    }
                    console.log(JSON.stringify({
                        event: 'send_failed', connectionId, type: message.type, version: message.version,
                        error: error.name, status: error.$metadata?.httpStatusCode, attempts: attempt + 1
                    }));
                    throw error;
                }
            }
        };
        return new RoomService({ game, store, send, connectionCache, limiter, onMatchEnd });
    };

    return async (event) => {
        const { routeKey, connectionId } = event.requestContext;
        const service = createService(event.requestContext);

        if (routeKey === '$connect') {
            return { statusCode: 200 };
        }
        if (routeKey === '$disconnect') {
            await service.disconnect(connectionId);
            return { statusCode: 200 };
        }
        await service.handleRaw(connectionId, event.body ?? '');
        return { statusCode: 200 };
    };
}
