import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';
import { CARDS } from '../public/js/deck.js';

testOnline({ definition, suggest });

const gameOf = async (server, client) => definition.restore(structuredClone((await server.store.getRoom(client.last('joined').roomCode)).game));

describe('オンライン対戦（ドブル）', () => {
    it('ビューに山の並びとシードは入らず、ロビーで決めた CPU の強さで始まる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('setSettings', { settings: { level: 'hard' } });
        expect(b.last('lobby').settings).toEqual({ level: 'hard' });
        await a.send('start');
        const room = await server.store.getRoom(a.last('joined').roomCode);
        expect(room.game.options.level).toBe('hard');
        const view = b.last('state').view;
        expect(view.viewer).toBe(1);
        expect(view.pileCount).toBe(53);
        expect(JSON.stringify(view)).not.toMatch(/"pile"|"seed"/);
    });

    it('同じ真ん中のカードを2人が取りにいくと、先に届いた方が取り、後の人は待ちも付かずに断られる', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const game = await gameOf(server, a);
        const mine = suggest(game, 0);
        const theirs = suggest(game, 1);
        server.clock.now += 1200;
        await a.send('command', { command: mine });
        server.clock.now += 50;
        await b.send('command', { command: theirs });
        expect(b.last('error').message).toBe('先に取られました');
        const view = b.last('state').view;
        expect(view.players[0].score).toBe(1);
        expect(view.players[1]).toMatchObject({ score: 0, wrong: 0, lockUntil: 0 });
        const room = await server.store.getRoom(a.last('joined').roomCode);
        // 時刻はサーバーの時計で付く
        expect(room.game.commands).toEqual([{ seat: 0, ...mine, t: 1200 }]);
    });

    it('違うマークは2秒取れない。待ちはサーバーの時刻で確かめ、端末の時刻は使わない', async () => {
        const server = createTestServer(definition);
        const [a] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const game = await gameOf(server, a);
        const wrong = CARDS[game.center].find(symbol => !CARDS[game.players[0].top].includes(symbol));
        server.clock.now += 100;
        await a.send('command', { command: { type: 'claim', symbol: wrong, center: game.center, t: 999999 } });
        expect(a.last('state').view.players[0]).toMatchObject({ score: 0, wrong: 1, lockUntil: 2100 });
        server.clock.now += 1000;
        await a.send('command', { command: { ...suggest(game, 0), t: 999999 } });
        expect(a.last('error').message).toBe('少し待ってから取れます');
        server.clock.now += 1100;
        await a.send('command', { command: suggest(game, 0) });
        expect(a.last('state').view.players[0].score).toBe(1);
    });

    it('ヒントは本人のビューにだけ入り、1点減る', async () => {
        const server = createTestServer(definition);
        const [a, b] = await server.createRoom(['あお', 'みどり']);
        await a.send('start');
        const game = await gameOf(server, a);
        await a.send('command', { command: suggest(game, 0) });
        const after = await gameOf(server, a);
        await a.send('command', { command: { type: 'hint' } });
        expect(a.last('state').view.hintSymbol).toBe(suggest(after, 0).symbol);
        expect(a.last('state').view.players[0].score).toBe(0);
        expect(b.last('state').view.hintSymbol).toBe(null);
    });

    it('CPU は真ん中が変わってから決まった時刻に取り、その時刻より後に届いた人のタップは CPU のあとに扱われる', async () => {
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
        // 期限を過ぎてから届いた人のタップ：CPU が先に取る（記録の時刻は CPU の取る時刻）
        server.clock.now = due + 500;
        await a.send('command', { command: suggest(game, 0) });
        expect(a.last('error').message).toBe('先に取られました');
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
