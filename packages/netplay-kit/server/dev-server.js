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
 */

import { WebSocketServer } from 'ws';
import { RoomService } from './room-service.js';
import { MemoryStore } from './memory-store.js';
import { isGameName, unwrapModule } from './game-name.js';

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
export function startMultiDevServer({ load, port = Number(process.env.PORT ?? 8787), log = console.log } = {}) {
    const sockets = new Map();
    const shared = new MemoryStore();
    const services = new Map(); // ゲームの名前 → RoomService（なければ null）の Promise
    let connectionCount = 0;

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
                .then(game => (game ? new RoomService({ game, store: new MemoryStore({ keyPrefix: name, from: shared }), send }) : null))
                .catch(error => {
                    log(`ゲーム ${name} を読み込めません: ${error.message}`);
                    return null;
                }));
        }
        return services.get(name);
    };

    const server = new WebSocketServer({ port });
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
    const close = () => new Promise(resolve => {
        server.clients.forEach(socket => socket.terminate());
        server.close(resolve);
    });
    return { server, services, store: shared, close };
}
