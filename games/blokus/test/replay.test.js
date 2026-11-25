import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand } from '../public/js/cpu-player.js';
import { players, snapshot } from './helpers.js';

function playOut(n, seed, levels = ['easy', 'normal']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 200) runCpuStep(game);
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても）', () => {
        for (const n of [2, 3, 4]) {
            const game = playOut(n, n * 7);
            expect(game.isOver()).toBe(true);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('途中までの記録からも作り直せ、そこから同じ手で同じ結果になる', () => {
        const game = playOut(3, 5, ['easy']);
        const saved = game.persist();
        const half = Math.floor(saved.commands.length / 2);
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('再現できない記録はエラーにする', () => {
        const game = playOut(2, 3, ['easy']);
        const saved = game.persist();
        saved.commands[1] = saved.commands[0];
        expect(() => Game.replay(saved.players, saved.options, saved.commands)).toThrow();
    });

    it('CPU の判断は、ゲームの乱数を使わず、何度考えても同じ', () => {
        const a = new Game(players(4, true).map(p => ({ ...p, cpuLevel: 'easy' })), { seed: 11 });
        for (let i = 0; i < 20; i++) {
            const seat = a.actors()[0];
            const first = chooseCommand(a, seat);
            expect(chooseCommand(a, seat)).toEqual(first);
            expect(a.applyCommand(seat, first)).toBe(true);
        }
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、記録から再現できる', () => {
        let r = 12345;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % k; };
        const pieces = ['I1', 'I2', 'V3', 'X5', 'F5', 'Q', null];
        const game = new Game(players(4, true).map(p => ({ ...p, cpuLevel: 'easy' })), { seed: 9 });
        for (let i = 0; i < 3000 && !game.isOver(); i++) {
            const command = { type: rand(6) ? 'place' : 'bogus', piece: pieces[rand(pieces.length)], orient: rand(10) - 1, x: rand(22) - 1, y: rand(22) - 1 };
            const before = snapshot(game);
            if (!game.applyCommand(rand(4), command)) expect(snapshot(game)).toBe(before);
            if (rand(20) === 0) runCpuStep(game);
        }
        const saved = game.persist();
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });
});
