/**
 * 1つの WebSocket の API・Lambda・テーブルで、複数のゲームのオンライン対戦を受け持つ入口（docs/server-merge.md）
 * ゲームは、つなぐときの URL で選ぶ：wss://<API>/prod?game=azul
 *   $connect で game を確かめ（知らない名前なら 400 で断る）、接続ごとに GAME#接続ID に記録する
 *   それ以降のメッセージと $disconnect は、記録したゲームの handler（createHandler(定義, { keyPrefix: ゲーム名 })）に渡す
 *
 * 使い方（web-games の server/src/handler.js）:
 *   import { createRouter } from 'netplay-kit/server/router.js';
 *   export const handler = createRouter({ load: (name) => import(`../../games/${name}/server/src/handler.js`) });
 * load(name) は、そのゲームの handler（か、handler を export するモジュール）を返す。なければ null を返すか、例外を投げる
 * 使うゲームだけを読み込むので、ゲームが増えてもコールドスタートは重くならない
 */

import { DynamoStore } from './dynamo-store.js';
import { isGameName } from './game-name.js';

const DEFAULT_TTL_SECONDS = 2 * 24 * 60 * 60; // 接続の記録を残す長さ（API Gateway の接続は2時間で必ず切れるので、十分に長い）

const toHandler = (loaded) => {
    if (typeof loaded === 'function') return loaded;
    if (typeof loaded?.handler === 'function') return loaded.handler;
    if (typeof loaded?.default === 'function') return loaded.default;
    return null;
};

export function createRouter({
    load,
    tableName = process.env.TABLE_NAME,
    store = null,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    now = () => Date.now(),
    log = (entry) => console.log(JSON.stringify(entry))
}) {
    // 以下は Lambda の呼び出しをまたいで使い回す
    const handlers = new Map();     // ゲームの名前 → handler（読み込めなければ null）の Promise
    const connections = new Map();  // 接続ID → ゲームの名前
    const storeOf = () => (store ??= new DynamoStore(tableName));

    const handlerOf = (name) => {
        if (!isGameName(name)) return Promise.resolve(null);
        if (!handlers.has(name)) {
            handlers.set(name, Promise.resolve()
                .then(() => load(name))
                .then(toHandler)
                .catch(() => null));
        }
        return handlers.get(name);
    };

    const gameOf = async (connectionId) => {
        if (connections.has(connectionId)) return connections.get(connectionId);
        const record = await storeOf().getConnectionGame(connectionId);
        if (record?.game) connections.set(connectionId, record.game);
        return record?.game ?? null;
    };

    return async (event) => {
        const { routeKey, connectionId } = event.requestContext;

        if (routeKey === '$connect') {
            const name = event.queryStringParameters?.game;
            const handler = await handlerOf(name);
            if (!handler) {
                log({ event: 'unknown_game', game: String(name ?? '').slice(0, 64), connectionId });
                return { statusCode: 400 };
            }
            await storeOf().putConnectionGame(connectionId, name, Math.floor(now() / 1000) + ttlSeconds);
            connections.set(connectionId, name);
            return handler(event);
        }

        const name = await gameOf(connectionId);
        const handler = name ? await handlerOf(name) : null;
        if (routeKey === '$disconnect') {
            const result = handler ? await handler(event) : { statusCode: 200 };
            connections.delete(connectionId);
            await storeOf().deleteConnectionGame(connectionId);
            return result;
        }
        if (!handler) {
            log({ event: 'no_game_for_connection', connectionId });
            return { statusCode: 400 };
        }
        return handler(event);
    };
}
