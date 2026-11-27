/**
 * 利用者ごとの記録の HTTP の入口（API Gateway の HTTP API、ペイロードの形 2.0）
 *   GET  /stats?name=<名前>   その名前の記録を返す（stats.js の statsFromItem の形）
 *   POST /results            ローカル対戦（CPU・ひとり）の結果を1つ受け取る
 *                            本文 { id, name, game, outcome }。outcome は win / loss / draw / null（回数だけ）
 *                            同じ id は2回目から数えない（端末は届いたか分からなければ送り直す）
 *   GET  /rooms              全ゲームの、ロビーで人を待っている部屋（入口のページの「いま立っている部屋」）
 *                            rooms（listOpenRooms を持つ保存先。DynamoStore・MemoryStore）を渡したときだけ
 *                            { rooms: [{ game, roomCode, hostName, players, maxPlayers, createdAt }] }（新しい順）
 * 本文が読めない・形が違うものは 400 で断る（端末は送り直さずに捨てる）
 *
 * 使い方（web-games の server/src/stats-handler.js）:
 *   import { createStatsHandler } from 'netplay-kit/server/stats-handler.js';
 *   import { DynamoStatsStore } from 'netplay-kit/server/dynamo-stats-store.js';
 *   export const handler = createStatsHandler({ store: new DynamoStatsStore(process.env.STATS_TABLE_NAME) });
 * 手元のテスト用サーバー（dev-server.js の startMultiDevServer）も、同じ処理を MemoryStatsStore で使う
 */

import { isGameName } from './game-name.js';
import { nameKey, normalizeName, OUTCOMES } from './stats.js';

const MAX_BODY_LENGTH = 2048;
const ID_PATTERN = /^[A-Za-z0-9:_.-]{6,100}$/;
const HEADERS = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
};

const reply = (statusCode, body) => ({ statusCode, headers: HEADERS, body: body === undefined ? '' : JSON.stringify(body) });

// 本文を読む（API Gateway は base64 で渡すことがある）。読めなければ null
function readBody(event) {
    let text = event.body ?? '';
    if (event.isBase64Encoded) text = Buffer.from(text, 'base64').toString('utf8');
    if (text.length > MAX_BODY_LENGTH) return null;
    try {
        const body = JSON.parse(text || 'null');
        return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
    } catch {
        return null;
    }
}

// ローカル対戦の結果を、記録の形（stats.js の matchRecord と同じ）にする。形が違えば理由の文字
export function localRecord(body, now = Date.now()) {
    if (!body) return '本文が読めません';
    const name = normalizeName(body.name);
    if (!nameKey(name)) return '名前がありません';
    if (!isGameName(body.game)) return 'ゲームの名前が違います';
    if (typeof body.id !== 'string' || !ID_PATTERN.test(body.id)) return 'id の形が違います';
    const outcome = body.outcome ?? null;
    if (outcome !== null && !OUTCOMES.includes(outcome)) return '結果の形が違います';
    // id は端末が付ける。人ごと・ゲームごとに分けて、ほかの人の記録とぶつからないようにする
    return { id: `local:${body.game}:${nameKey(name)}:${body.id}`, game: body.game, at: now, entries: [{ name, outcome, online: false, vs: [] }] };
}

const OPEN_ROOMS_LIMIT = 30; // 入口のページに出す部屋の数

export function createStatsHandler({ store, rooms = null, now = () => Date.now(), log = (entry) => console.log(JSON.stringify(entry)) }) {
    return async (event) => {
        const method = event.requestContext?.http?.method ?? event.httpMethod ?? 'GET';
        const path = (event.rawPath ?? event.path ?? '/').replace(/\/+$/, '') || '/';
        try {
            if (method === 'OPTIONS') return reply(204);
            if (method === 'GET' && path.endsWith('/rooms') && rooms) {
                const open = await rooms.listOpenRooms(Math.floor(now() / 1000), { limit: OPEN_ROOMS_LIMIT });
                return reply(200, { rooms: open.slice(0, OPEN_ROOMS_LIMIT) });
            }
            if (method === 'GET' && path.endsWith('/stats')) {
                const name = event.queryStringParameters?.name ?? '';
                if (!nameKey(name)) return reply(400, { error: '名前がありません' });
                return reply(200, await store.get(name));
            }
            if (method === 'POST' && path.endsWith('/results')) {
                const record = localRecord(readBody(event), now());
                if (typeof record === 'string') return reply(400, { error: record });
                const counted = await store.record(record);
                return reply(200, { ok: true, duplicate: !counted });
            }
            return reply(404, { error: 'ありません' });
        } catch (error) {
            log({ event: 'stats_api_failed', method, path, error: error.name, message: error.message });
            return reply(500, { error: '記録を扱えませんでした' });
        }
    };
}
