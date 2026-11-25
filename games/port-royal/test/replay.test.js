import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommand } from '../public/js/cpu-player.js';
import { players, snapshot } from './helpers.js';

function playOut(n, seed, levels = ['normal', 'easy']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 5000) runCpuStep(game);
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても）', () => {
        for (const n of [2, 3, 5]) {
            for (const seed of [1, 7]) {
                const game = playOut(n, seed);
                expect(game.isOver()).toBe(true);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
            }
        }
    });

    it('途中までの記録からも作り直せ、そこから同じ手で同じ結果になる', () => {
        const game = playOut(4, 5);
        const saved = game.persist();
        const half = Math.floor(saved.commands.length / 2);
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('同じシードなら同じ山', () => {
        expect(snapshot(new Game(players(3), { seed: 4 }))).toBe(snapshot(new Game(players(3), { seed: 4 })));
        expect(new Game(players(3), { seed: 5 }).deck).not.toEqual(new Game(players(3), { seed: 4 }).deck);
    });

    it('再現できない記録はエラーにする', () => {
        const game = playOut(2, 3);
        const saved = game.persist();
        saved.commands.unshift({ playerId: 0, command: { type: 'stop' } });
        expect(() => Game.replay(saved.players, saved.options, saved.commands)).toThrow();
    });

    it('CPU の判断は、ゲームの乱数を使わない', () => {
        const make = () => new Game(players(3, true).map(p => ({ ...p, cpuLevel: 'easy' })), { seed: 11 });
        const a = make();
        const b = make();
        for (let i = 0; i < 300 && !a.isOver(); i++) {
            const seat = a.actors()[0];
            for (let k = 0; k < 3; k++) chooseCommand(a, seat);
            const command = runCpuStep(a);
            expect(b.applyCommand(seat, command)).toBe(true);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、記録から再現できる', () => {
        const kinds = ['draw', 'stop', 'repel', 'keep', 'claim', 'take', 'pass', 'bogus'];
        let r = 12345;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % k; };
        for (const n of [2, 4, 5]) {
            const game = new Game(players(n, true).map(p => ({ ...p, cpuLevel: 'easy' })), { seed: n * 13 });
            for (let i = 0; i < 4000 && !game.isOver(); i++) {
                const command = { type: kinds[rand(kinds.length)], card: rand(125) - 2 };
                const before = snapshot(game);
                if (!game.applyCommand(rand(n), command)) expect(snapshot(game)).toBe(before);
                if (rand(3) === 0) runCpuStep(game);
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
