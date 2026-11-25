import { describe, it, expect } from 'vitest';
import Game, { ACTIONS } from '../public/js/game.js';
import { runCpuStep, chooseCommand, nextCpuSeat } from '../public/js/cpu-player.js';
import { players, snapshot, totalCards } from './helpers.js';

// CPU だけで最後まで進めたゲーム
function playOut(n, seed, levels = ['normal', 'easy']) {
    const game = new Game(players(n, true).map((p, i) => ({ ...p, cpuLevel: levels[i % levels.length] })), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 3000) runCpuStep(game);
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても）', () => {
        for (const n of [2, 3, 4, 6]) {
            for (const seed of [1, 7, 99]) {
                const game = playOut(n, seed);
                expect(game.isOver()).toBe(true);
                expect(totalCards(game)).toBe(15);
                const saved = JSON.parse(JSON.stringify(game.persist()));
                const copy = Game.replay(saved.players, saved.options, saved.commands);
                expect(snapshot(copy)).toBe(snapshot(game));
            }
        }
    });

    it('途中までの記録からも作り直せ、そこから同じ手で同じ結果になる', () => {
        const game = playOut(4, 5);
        const half = Math.floor(game.commands.length / 2);
        const saved = game.persist();
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('再現できない記録はエラーにする', () => {
        const game = playOut(3, 3);
        const saved = game.persist();
        saved.commands[0] = { playerId: (saved.commands[0].playerId + 1) % 3, command: { type: 'action', action: 'income' } };
        expect(() => Game.replay(saved.players, saved.options, saved.commands)).toThrow();
    });

    it('CPU の判断は、ゲームの乱数を使わない', () => {
        const a = new Game(players(4, true), { seed: 11 });
        const b = new Game(players(4, true), { seed: 11 });
        for (let i = 0; i < 400 && !a.isOver(); i++) {
            const seat = nextCpuSeat(a);
            for (let k = 0; k < 3; k++) chooseCommand(a, seat); // 何度考えても
            const command = runCpuStep(a);
            expect(b.applyCommand(seat, command)).toBe(true);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、札の数が保たれ、記録から再現できる', () => {
        const types = ['action', 'allow', 'challenge', 'block', 'lose', 'exchange', 'bogus'];
        const actions = [...Object.keys(ACTIONS), 'x'];
        const roles = ['duke', 'assassin', 'ambassador', 'captain', 'contessa', 'x'];
        let r = 12345;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % k; };
        for (const n of [2, 3, 5, 6]) {
            const game = new Game(players(n, true), { seed: n * 31 });
            for (let i = 0; i < 4000 && !game.isOver(); i++) {
                const command = { type: types[rand(types.length)], action: actions[rand(actions.length)], target: rand(n + 1) - 1,
                    role: roles[rand(roles.length)], keep: [roles[rand(6)], roles[rand(6)]].slice(0, 1 + rand(2)) };
                const seat = rand(n);
                const before = snapshot(game);
                if (!game.applyCommand(seat, command)) expect(snapshot(game)).toBe(before);
                expect(totalCards(game)).toBe(15);
                if (rand(3) === 0) runCpuStep(game);
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});
