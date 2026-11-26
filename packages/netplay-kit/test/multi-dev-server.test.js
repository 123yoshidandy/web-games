import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { once } from 'node:events';
import NetplayClient from '../client/netplay-client.mjs';
import { startMultiDevServer } from '../server/dev-server.js';
import turnGame from '../examples/turn-game.js';
import relayGame from '../examples/relay-game.js';

async function waitFor(check, timeout = 2000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
        if (check()) return;
        await new Promise(resolve => setTimeout(resolve, 10));
    }
    throw new Error('待ちきれませんでした');
}

describe('startMultiDevServer（1つのポートで複数のゲーム）', () => {
    let dev;
    let base;
    const loaded = [];

    beforeAll(async () => {
        const games = { turn: turnGame, relay: { default: relayGame } }; // 定義そのものも、モジュールの形も受け付ける
        dev = startMultiDevServer({ port: 0, log: () => {}, load: (name) => { loaded.push(name); return games[name] ?? null; } });
        await once(dev.server, 'listening');
        base = `ws://localhost:${dev.server.address().port}`;
    });
    afterAll(() => dev.close());

    it('?game= のゲームの部屋ができ、同じ部屋番号でもほかのゲームからは入れない', async () => {
        const a = new NetplayClient({ serverUrl: `${base}?game=turn`, storageKey: 'multi.a' });
        const b = new NetplayClient({ serverUrl: `${base}?game=relay`, storageKey: 'multi.b' });
        const c = new NetplayClient({ serverUrl: `${base}?game=turn`, storageKey: 'multi.c' });
        await a.createRoom('あお');
        await waitFor(() => a.lobby?.status === 'lobby');
        const code = a.lobby.roomCode;

        await expect(b.enterRoom(code, 'みどり')).rejects.toMatchObject({ code: 'room_not_found' });
        await c.enterRoom(code, 'き');
        await waitFor(() => a.lobby.players.length === 2);
        expect(a.lobby.players.map(p => p.name)).toEqual(['あお', 'き']);
        expect([...dev.store.rooms.keys()]).toEqual([`turn#${code}`]);
        [a, b, c].forEach(client => client.close());
    });

    it('知らないゲームの接続は閉じる（読み込みはゲームごとに1回）', async () => {
        const socket = new WebSocket(`${base}?game=nope`);
        const closed = await new Promise(resolve => socket.addEventListener('close', resolve));
        expect(closed.code).toBe(4004);
        const bad = new WebSocket(`${base}?game=../turn`);
        expect((await new Promise(resolve => bad.addEventListener('close', resolve))).code).toBe(4004);
        expect(loaded.filter(name => name === 'turn')).toHaveLength(1);
        expect(loaded).not.toContain('../turn');
    });
});
