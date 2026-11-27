import { describe, it, expect } from 'vitest';
import { testOnline } from 'test-kit/online.js';
import { createTestServer } from 'netplay-kit/server/testing.js';
import definition, { COUNTDOWN_MS, PICK_MS } from '../server/src/game-definition.js';
import { suggest } from '../public/js/cpu-player.js';
import { puzzleOf } from '../public/js/game.js';

testOnline({ definition, suggest });

const startRace = async (names = ['あお', 'みどり'], settings = null) => {
    const server = createTestServer(definition);
    const clients = await server.createRoom(names);
    if (settings) await clients[0].send('setSettings', { settings });
    await clients[0].send('start');
    const room = () => server.store.getRoom(clients[0].last('joined').roomCode);
    return { server, clients, room };
};

describe('オンライン対戦（ウボンゴ）', () => {
    it('ロビーで決めたピースの数・制限時間・強さで始まり、ビューに自分の問題が届く', async () => {
        const { clients, room } = await startRace(['あお', 'みどり'], { difficulty: 4, time: 60000, level: 'hard' });
        const game = (await room()).game;
        expect(game.difficulty).toBe(4);
        expect(game.timeLimit).toBe(60000);
        const view = clients[1].last('state').view;
        expect(view.you).toBe(1);
        expect(view.puzzle).toEqual(puzzleOf(game, 1));
        expect(view.startAt).toBe(game.startAt);
        const text = JSON.stringify(view);
        ['"seed"', '"rng"', '"deck"', '"cpuTimes"'].forEach(key => expect(text).not.toContain(key));
    });

    it('解答の時刻は、端末の値ではなくサーバーの時計で測る', async () => {
        const { server, clients, room } = await startRace();
        const game = (await room()).game;
        server.clock.now = game.startAt + 12345;
        await clients[0].send('command', { command: { ...suggest(game, 0), t: 1 } });
        expect((await room()).game.results[0]).toEqual({ solved: true, t: 12345, time: 12345 });
    });

    it('間違った解答と、ヒント・時刻の操作は断る', async () => {
        const { clients, room } = await startRace();
        const game = (await room()).game;
        const move = suggest(game, 0);
        await clients[0].send('command', { command: { ...move, placements: move.placements.slice(1) } });
        expect(clients[0].last('error')).toBeTruthy();
        for (const type of ['hint', 'tick', 'timeUp']) {
            const errors = clients[0].all('error').length;
            await clients[0].send('command', { command: { type, t: 99999 } });
            expect(clients[0].all('error').length).toBe(errors + 1);
        }
        expect((await room()).game.results[0]).toBeNull();
    });

    it('時間切れは期限で締まり、宝石の番を過ぎた人はおすすめの列を取ったことになる', async () => {
        const { server, clients, room } = await startRace();
        let game = (await room()).game;
        server.clock.now = game.startAt + 5000;
        await clients[0].send('command', { command: suggest(game, 0) });
        server.clock.now = game.startAt + game.timeLimit + 1;
        await clients[1].send('ping', { clientTime: 0 });
        game = (await room()).game;
        expect(game.phase).toBe('collect');
        expect(game.results[1]).toEqual({ solved: false, reason: 'timeUp' });
        expect(game.pickAt).toBe(server.clock.now);
        server.clock.now += PICK_MS + 1;
        await clients[1].send('ping', { clientTime: 0 });
        game = (await room()).game;
        expect(game.round).toBe(2);
        expect(game.history[0].picks).toHaveLength(1);
        expect(game.startAt).toBe(server.clock.now + COUNTDOWN_MS);
    });

    it('CPU は予定の時刻に解き、そのことが届く', async () => {
        const { server, clients, room } = await startRace(['あお']);
        // 1人と CPU で始める
        expect(clients[0].last('lobby').players.length).toBeGreaterThanOrEqual(1);
        let game = (await room()).game;
        if (game === null || game === undefined) {
            await clients[0].send('addCpu');
            await clients[0].send('start');
            game = (await room()).game;
        }
        const next = clients[0].last('state').view.nextEventIn;
        expect(next).toBeGreaterThan(0);
        server.clock.now = game.startAt + next;
        await clients[0].send('ping', { clientTime: 0 });
        game = (await room()).game;
        const solved = game.results.filter(r => r?.solved);
        if (next < game.timeLimit) expect(solved.length).toBe(1);
    });
});
