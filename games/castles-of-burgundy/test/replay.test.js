import { describe, it, expect } from 'vitest';
import Game, { COMMAND_FIELDS } from '../public/js/game.js';
import { runCpuStep, chooseCommand, nextCpuSeat } from '../public/js/cpu-player.js';
import { players, snapshot } from './helpers.js';

function playOut(n, seed, levels = ['normal', 'easy']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 4000) runCpuStep(game);
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても）', () => {
        for (const n of [2, 3, 4]) {
            for (const seed of [1, 7]) {
                const game = playOut(n, seed);
                expect(game.isOver()).toBe(true);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            }
        }
    });

    it('途中までの記録からも作り直せ、そこから同じ手で同じ結果になる', () => {
        const game = playOut(3, 5);
        const half = Math.floor(game.commands.length / 2);
        const saved = game.persist();
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('再現できない記録はエラーにする', () => {
        const game = playOut(2, 3);
        const saved = game.persist();
        saved.commands[0] = { playerId: (saved.commands[0].playerId + 1) % 2, command: saved.commands[0].command };
        expect(() => Game.replay(saved.players, saved.options, saved.commands)).toThrow();
    });

    it('記録するのは決まった項目だけ', () => {
        const game = new Game(players(2), { seed: 2, start: 0 });
        game.applyCommand(0, { type: 'workers', die: 0, extra: 'x'.repeat(100) });
        expect(Object.keys(game.commands[0].command)).toEqual(['type', 'die']);
    });

    it('CPU の判断は、ゲームの乱数を使わない', () => {
        const a = new Game(players(3, true), { seed: 11 });
        const b = new Game(players(3, true), { seed: 11 });
        for (let i = 0; i < 400 && !a.isOver(); i++) {
            const seat = nextCpuSeat(a);
            for (let k = 0; k < 3; k++) chooseCommand(a, seat);
            const command = runCpuStep(a);
            expect(b.applyCommand(seat, command)).toBe(true);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、記録から再現できる', () => {
        const types = Object.keys(COMMAND_FIELDS).concat(['bogus']);
        let r = 12345;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % k; };
        for (const n of [2, 4]) {
            const game = new Game(players(n, true), { seed: n * 31 });
            for (let i = 0; i < 4000 && !game.isOver(); i++) {
                const seat = rand(5) === 0 ? rand(n) : game.actors()[0];
                const p = game.players[seat];
                const command = {
                    type: types[rand(types.length)], die: [0, 1, 'bonus', 2][rand(4)], depot: rand(8) - 1, slot: rand(5),
                    discard: rand(3) ? undefined : rand(4), tile: p.storage[rand(p.storage.length + 1)] ?? rand(170), cell: rand(40),
                    goods: rand(8), depots: rand(2) ? [rand(6)] : [rand(6), rand(6)]
                };
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
                if (rand(2) === 0) runCpuStep(game);
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
