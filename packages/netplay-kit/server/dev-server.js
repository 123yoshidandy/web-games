/**
 * 手元でオンライン対戦を試すための WebSocket サーバー（AWS と同じ部屋の処理を、保存先をメモリにして動かす）
 *
 * 使い方（各ゲームの server/dev-server.js）:
 *   import { startDevServer } from './netplay/dev-server.js';
 *   import game from './src/game-definition.js';
 *   startDevServer(game);
 * npm run dev:server で起動し、画面は別に python3 -m http.server などで配信する
 *
 * 複数のゲームを1つのサーバーで動かすとき（web-games の npm run dev:online）:
 *   startMultiDevServer({ load: (name) => そのゲームの定義（なければ null） });
 *   画面は ws://localhost:8787?game=<ゲームの名前> につなぐ。AWS の router.js と同じく、ゲームは接続の URL で選ぶ
 *   同じポートの HTTP で、利用者ごとの記録の API（stats-handler.js の GET /stats・POST /results）と、
 *   全ゲームの待っている部屋の一覧（GET /rooms）も受け持つ（保存先はメモリ）
 *   対戦が終わると、AWS と同じく人の席の結果を記録する（stats.js）
 */

import http from 'node:http';
import { WebSocketServer } from 'ws';
import { RoomService } from './room-service.js';
import { MemoryStore } from './memory-store.js';
import { isGameName, unwrapModule } from './game-name.js';
import { MemoryStatsStore, createMatchRecorder } from './stats.js';
import { createStatsHandler } from './stats-handler.js';

// HTTP の要求を、API Gateway の HTTP API（ペイロード 2.0）と同じ形の event にして、記録の API に渡す
function serveStats(statsHandler) {
    return (request, response) => {
        const url = new URL(request.url ?? '/', 'http://localhost');
        let body = '';
        request.on('data', (chunk) => { body += chunk; });
        request.on('end', async () => {
            const result = await statsHandler({
                rawPath: url.pathname,
                queryStringParameters: Object.fromEntries(url.searchParams),
                requestContext: { http: { method: request.method } },
                body,
                isBase64Encoded: false
            });
            response.writeHead(result.statusCode, result.headers).end(result.body);
        });
    };
}

export function startDevServer(game, { port = Number(process.env.PORT ?? 8787), log = console.log } = {}) {
    const sockets = new Map();
    let connectionCount = 0;

    const service = new RoomService({
        game,
        store: new MemoryStore(),
        send: async (connectionId, message) => {
            const socket = sockets.get(connectionId);
            if (!socket || socket.readyState !== socket.OPEN) throw new Error('接続が切れています');
            socket.send(JSON.stringify(message));
        }
    });

    const server = new WebSocketServer({ port });
    server.on('connection', (socket) => {
        const connectionId = `local-${++connectionCount}`;
        sockets.set(connectionId, socket);

        socket.on('message', (data) => {
            service.handleRaw(connectionId, String(data)).catch(error => console.error(error));
        });
        socket.on('close', () => {
            sockets.delete(connectionId);
            service.disconnect(connectionId).catch(error => console.error(error));
        });
    });

    log(`オンライン対戦のテスト用サーバー: ws://localhost:${port}`);
    // 止めるときは、残っている接続も切る
    const close = () => new Promise(resolve => {
        server.clients.forEach(socket => socket.terminate());
        server.close(resolve);
    });
    return { server, service, close };
}

// 複数のゲームを受け持つ（?game= で選ぶ）。ゲームの部屋の処理は、最初につながったときに作る
// 保存先は1つの場所を共有し、ゲームごとに keyPrefix を付ける（AWS で1つのテーブルにまとめた形と同じ）
export function startMultiDevServer({ load, port = Number(process.env.PORT ?? 8787), log = console.log, stats = new MemoryStatsStore() } = {}) {
    const sockets = new Map();
    const shared = new MemoryStore();
    const services = new Map(); // ゲームの名前 → RoomService（なければ null）の Promise
    let connectionCount = 0;
    const recorderOf = (name, game) => createMatchRecorder({ gameName: name, definition: game, store: stats, log: (entry) => log(JSON.stringify(entry)) });

    const send = async (connectionId, message) => {
        const socket = sockets.get(connectionId);
        if (!socket || socket.readyState !== socket.OPEN) throw new Error('接続が切れています');
        socket.send(JSON.stringify(message));
    };
    const serviceOf = (name) => {
        if (!isGameName(name)) return Promise.resolve(null);
        if (!services.has(name)) {
            services.set(name, Promise.resolve()
                .then(() => load(name))
                .then(unwrapModule)
                .then(game => (game ? new RoomService({
                    game, store: new MemoryStore({ keyPrefix: name, from: shared }), send, onMatchEnd: recorderOf(name, game)
                }) : null))
                .catch(error => {
                    log(`ゲーム ${name} を読み込めません: ${error.message}`);
                    return null;
                }));
        }
        return services.get(name);
    };

    // GET /rooms は、全ゲームが共有する部屋の保存場所から読む（AWS では索引 OpenRooms を引く）
    const web = http.createServer(serveStats(createStatsHandler({ store: stats, rooms: shared, log: (entry) => log(JSON.stringify(entry)) })));
    const server = new WebSocketServer({ server: web });
    web.listen(port);
    server.on('connection', (socket, request) => {
        const name = new URL(request.url ?? '/', 'http://localhost').searchParams.get('game');
        const connectionId = `local-${++connectionCount}`;
        const ready = serviceOf(name);
        sockets.set(connectionId, socket);

        // 部屋の処理を作り終える前に届いたメッセージも、作り終えてから順に渡す
        socket.on('message', (data) => {
            ready.then(service => service?.handleRaw(connectionId, String(data))).catch(error => console.error(error));
        });
        socket.on('close', () => {
            sockets.delete(connectionId);
            ready.then(service => service?.disconnect(connectionId)).catch(error => console.error(error));
        });
        ready.then(service => {
            if (service) return;
            sockets.delete(connectionId);
            socket.close(4004, 'unknown game');
        });
    });

    log(`オンライン対戦のテスト用サーバー（全ゲーム）: ws://localhost:${port}?game=<ゲームの名前>`);
    log(`利用者ごとの記録の API: http://localhost:${port}/stats?name=<名前>（保存先はメモリ）`);
    const close = () => new Promise(resolve => {
        server.clients.forEach(socket => socket.terminate());
        server.close(() => web.close(() => resolve()));
        web.closeAllConnections?.();
    });
    return { server, web, services, store: shared, stats, close };
}
