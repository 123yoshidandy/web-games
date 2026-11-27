import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';
import { fiveFruits } from '../public/js/game.js';

// 共通の検査は時計を進めずに打つので、CPU の番（抜けた人の席を含む）は、人の「めくる」で進める（定義が受け付ける）
const pick = (game, seat) => {
    const move = suggest(game, seat);
    if (move) return move;
    const player = game.players[seat];
    if (!game.isOver && player && !player.out && !player.isCPU && game.players[game.turn].isCPU) return { type: 'flip' };
    return null;
};

testOnline({ definition, pick });

const roomOf = async (server, client) => definition.restore(structuredClone((await server.store.getRoom(client.last('joined').roomCode)).game));

describe('オンライン対戦（ハリガリ）', () => {
    it('ビューに山札の並びとシードは入らず、表の一番上と枚数だけ。ロビーで決めた設定で始まる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { level: 'hard', speed: 'fast', timeLimit: 'short' } });
        expect(b.last('lobby').settings).toEqual({ level: 'hard', speed: 'fast', timeLimit: 'short' });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.options).toMatchObject({ level: 'hard', speed: 'fast', timeLimit: 'short' });
        const view = b.last('state').view;
        expect(view.viewer).toBe(1);
        expect(view.players.map(p => p.deckCount)).toEqual([28, 28]);
        expect(view.players.every(p => p.auto)).toBe(true);
        expect(JSON.stringify(view)).not.toMatch(/"deck"|"pile"|"seed"|"pot"/);
    });

    it('同じ5つに2人が鳴らすと、先に届いた方がもらい、後の人は払わずに断られる。時刻はサーバーの時計', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        // 5つになるまでめくる（めくるのは手番の人。時計は進めない）
        let game = await roomOf(server, a);
        let guard = 0;
        while (fiveFruits(game.tops()).length === 0 && guard++ < 200) {
            await [a, b][game.turn].send('command', { command: { type: 'flip' } });
            game = await roomOf(server, a);
        }
        const version = game.tableVersion;
        server.clock.now += 700;
        await b.send('command', { command: { type: 'ring', version } });
        server.clock.now += 40;
        await a.send('command', { command: { type: 'ring', version, t: 0 } });
        expect(a.last('error').message).toBe('間に合いませんでした');
        const view = a.last('state').view;
        expect(view.players[1].bells).toBe(1);
        expect(view.players[0]).toMatchObject({ bells: 0, misses: 0 });
        const after = await roomOf(server, a);
        expect(after.commands.at(-1)).toEqual({ seat: 1, type: 'ring', version, t: 700 });
    });

    it('自動でめくる時刻と CPU のベルは期限で起き、記録の時刻は起きる時刻そのもの', async () => {
        const server = createTestServer(definition);
        const [a] = await server.createRoom(['あお']);
        await a.send('addCpu');
        await a.send('start');
        const game = await roomOf(server, a);
        const due = definition.deadline(game);
        expect(due).toBe(game.startedAt + game.interval);
        server.clock.now = due - 1;
        await a.send('ping', { clientTime: 0 });
        expect((await roomOf(server, a)).commands).toHaveLength(0);
        server.clock.now = due + 300;
        await a.send('ping', { clientTime: 0 });
        const commands = (await roomOf(server, a)).commands;
        expect(commands[0]).toEqual({ seat: 0, type: 'flip', t: due - game.startedAt });
    });

    it('自分の番でない人のめくりは断る。CPU の番は人のめくりでも進む', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('addCpu');
        await a.send('start');
        await b.send('command', { command: { type: 'flip' } });
        expect(b.last('error').message).toBe('あなたの番ではありません');
        await a.send('command', { command: { type: 'flip' } });
        await b.send('command', { command: { type: 'flip' } });
        expect((await roomOf(server, a)).turn).toBe(2);
        await a.send('command', { command: { type: 'flip' } });
        const game = await roomOf(server, a);
        expect(game.commands.at(-1)).toMatchObject({ seat: 2, type: 'flip' });
        expect(game.turn).toBe(0);
    });

    it('抜けた人の席は CPU になり、保存と再現のあとも CPU のまま', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        await b.send('leave');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.players[1].isCPU).toBe(true);
        const game = definition.restore(structuredClone(room.game));
        expect(game.players[1].isCPU).toBe(true);
        expect(definition.deadline(game)).toBeGreaterThan(0);
    });
});
