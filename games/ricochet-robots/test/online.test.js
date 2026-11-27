import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（リコシェロボット）', () => {
    it('ビューに目標をめくる順は入らず、ロビーの設定で始まる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('setSettings', { settings: { level: 'hard', targets: '5', silver: 'on' } });
        expect(b.last('lobby').settings).toEqual({ level: 'hard', targets: '5', silver: 'on' });
        await a.send('start');
        const view = b.last('state').view;
        expect(view.viewer).toBe(1);
        expect(view.robots).toHaveLength(5);
        expect(view.targetTotal).toBe(5);
        const text = JSON.stringify(view);
        expect(text).not.toContain('"deck"');
        expect(text).not.toContain('"seed"');
    });

    it('宣言の時刻はサーバーが付け、端末から時間切れやヒントは送れない', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('start');
        await a.send('command', { command: { type: 'timeout' } });
        expect(a.last('error')).toBeTruthy();
        await b.send('command', { command: { type: 'hint', kind: 'first' } });
        expect(b.last('error')).toBeTruthy();
        await a.send('command', { command: { type: 'declare', count: 9, at: 0 } });
        const round = b.last('state').view.round;
        expect(round.phase).toBe('countdown');
        expect(round.bids[0]).toMatchObject({ seat: 0, count: 9 });
        expect(round.bids[0].at).toBe(round.revealAt); // 見せる前の時刻は、見せた時刻とみなす
        expect(round.deadline).toBe(round.revealAt + 60000);
    });

    it('砂時計が切れると、届いたメッセージ（tick）で実演に進み、失敗すれば次の人へ', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('start');
        server.clock.now += 4000;
        await a.send('command', { command: { type: 'declare', count: 1 } });
        await b.send('command', { command: { type: 'declare', count: 20 } });
        server.clock.now += 61000;
        await b.send('tick');
        let round = a.last('state').view.round;
        expect(round.phase).toBe('demo');
        expect(round.demo.seat).toBe(0);
        // 1手では着かない手順（動かない手）を出すと失敗し、20手と宣言した人の番になる
        await a.send('command', { command: { type: 'demo', moves: [[0, 0]] } });
        round = b.last('state').view.round;
        expect(round.attempts[0]).toMatchObject({ seat: 0, success: false });
        expect(round.demo.seat).toBe(1);
    });

    it('抜けた席は CPU になり、読み込み直しても CPU のまま', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あか', 'あお']);
        await a.send('start');
        await b.send('leave');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.players[1].isCPU).toBe(true);
        expect(definition.restore(structuredClone(room.game), room).players[1].isCPU).toBe(true);
    });
});
