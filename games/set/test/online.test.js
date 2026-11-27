import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';

testOnline({ definition, suggest });

describe('オンライン対戦（SET）', () => {
    it('ビューに山札の並びとシードは入らず、ロビーで決めた CPU の強さで始まる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { level: 'hard' } });
        expect(b.last('lobby').settings).toEqual({ level: 'hard' });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.options.level).toBe('hard');
        const view = b.last('state').view;
        expect(view.viewer).toBe(1);
        expect(view.deckCount).toBe(69);
        expect(JSON.stringify(view)).not.toMatch(/"deck"|"seed"/);
    });

    it('同じセットを2人が送ると、先に届いた方が取り、後の人は点も待ちも変わらずに断られる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const cards = suggest(definition.restore(structuredClone((await server.store.getRoom(a.last('joined').roomCode)).game)), 0).cards;
        server.clock.now += 1200;
        await a.send('command', { command: { type: 'claim', cards } });
        server.clock.now += 50;
        await b.send('command', { command: { type: 'claim', cards } });
        expect(b.last('error').message).toBe('先に取られました');
        const view = b.last('state').view;
        expect(view.players[0].score).toBe(1);
        expect(view.players[1]).toMatchObject({ score: 0, wrong: 0, lockUntil: 0 });
        const room = await server.store.getRoom(a.last('joined').roomCode);
        // 時刻はサーバーの時計で付く
        expect(room.game.commands).toEqual([{ seat: 0, type: 'claim', cards, t: 1200 }]);
    });

    it('セットでない3枚は1点減って3秒取れない。待ちはサーバーの時刻で確かめ、端末の時刻は使わない', async () => {
        const server = createTestServer(definition);
        const [a] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const game = definition.restore(structuredClone((await server.store.getRoom(a.last('joined').roomCode)).game));
        const good = suggest(game, 0).cards;
        const bad = findNonSet(game.board);
        await a.send('command', { command: { type: 'claim', cards: good } });
        server.clock.now += 100;
        const after = definition.restore(structuredClone((await server.store.getRoom(a.last('joined').roomCode)).game));
        await a.send('command', { command: { type: 'claim', cards: findNonSet(after.board), t: 999999 } });
        expect(a.last('state').view.players[0]).toMatchObject({ score: 0, wrong: 1, lockUntil: 3100 });
        server.clock.now += 1000;
        const next = suggest(definition.restore(structuredClone((await server.store.getRoom(a.last('joined').roomCode)).game)), 0).cards;
        await a.send('command', { command: { type: 'claim', cards: next, t: 999999 } });
        expect(a.last('error').message).toBe('少し待ってから取れます');
        server.clock.now += 2100;
        await a.send('command', { command: { type: 'claim', cards: next } });
        expect(a.last('state').view.players[0].score).toBe(1);
        expect(bad.length).toBe(3);
    });

    it('CPU は場が変わってから決まった時刻に取り、その時刻より後に届いた人の組は CPU のあとに扱われる', async () => {
        const server = createTestServer(definition);
        const [a] = await server.createRoom(['あお']);
        await a.send('addCpu');
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        const game = definition.restore(structuredClone(room.game));
        const due = definition.deadline(game);
        expect(due).toBeGreaterThan(server.clock.now);
        // 期限の前の ping では何も起きない
        server.clock.now = due - 1;
        await a.send('ping', { clientTime: 0 });
        expect((await server.store.getRoom(a.last('joined').roomCode)).game.commands).toHaveLength(0);
        // 期限を過ぎてから届いた人の組：CPU が先に取る（記録の時刻は CPU の取る時刻）
        server.clock.now = due + 500;
        const cards = suggest(game, 0).cards;
        await a.send('command', { command: { type: 'claim', cards } });
        const commands = (await server.store.getRoom(a.last('joined').roomCode)).game.commands;
        expect(commands[0]).toMatchObject({ seat: 1, t: due - room.game.startedAt });
        expect(a.last('state').view.players[1].score).toBe(1);
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

function findNonSet(board) {
    for (let i = 0; i < board.length; i++) {
        for (let j = i + 1; j < board.length; j++) {
            for (let k = j + 1; k < board.length; k++) {
                const trio = [board[i], board[j], board[k]];
                const x = trio.map(c => [c % 3, Math.floor(c / 3) % 3, Math.floor(c / 9) % 3, Math.floor(c / 27) % 3]);
                if (![0, 1, 2, 3].every(a => (x[0][a] + x[1][a] + x[2][a]) % 3 === 0)) return trio;
            }
        }
    }
    return [];
}
