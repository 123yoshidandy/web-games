import { describe, it, expect } from 'vitest';
import Game, { JACK, DETECTIVE } from '../public/js/game.js';
import { runCpuStep, chooseCommand, nextCpuSeat, cpuRandom } from '../public/js/cpu-player.js';
import { createGameView } from '../public/js/game-view.js';
import { snapshot } from './helpers.js';

const cpuPlayers = (jack = 'normal', detective = 'normal') => [
    { name: 'J', isCPU: true, cpuLevel: jack },
    { name: 'D', isCPU: true, cpuLevel: detective }
];

function playOut(seed, jack, detective) {
    const game = new Game(cpuPlayers(jack, detective), { seed });
    let steps = 0;
    while (!game.isOver() && steps++ < 100) runCpuStep(game);
    return game;
}

describe('記録からの再現', () => {
    it('操作の記録から、最後の状態まで同じに作り直せる（JSON を通しても）', () => {
        for (const seed of [1, 2, 3, 4, 5]) {
            const game = playOut(seed, 'normal', 'easy');
            expect(game.isOver()).toBe(true);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('途中までの記録からも作り直せ、そこから同じ手で同じ結果になる', () => {
        const game = playOut(7, 'normal', 'normal');
        const saved = game.persist();
        const half = Math.floor(saved.commands.length / 2);
        const partial = Game.replay(saved.players, saved.options, saved.commands.slice(0, half));
        saved.commands.slice(half).forEach(({ playerId, command }) => expect(partial.applyCommand(playerId, command)).toBe(true));
        expect(snapshot(partial)).toBe(snapshot(game));
    });

    it('再現できない記録はエラーにする', () => {
        const saved = playOut(3, 'easy', 'easy').persist();
        saved.commands[0] = { ...saved.commands[0], playerId: JACK };
        expect(() => Game.replay(saved.players, saved.options, saved.commands)).toThrow();
    });

    it('CPU の判断は、ゲームの乱数を使わない', () => {
        const a = new Game(cpuPlayers(), { seed: 11 });
        const b = new Game(cpuPlayers(), { seed: 11 });
        for (let i = 0; i < 100 && !a.isOver(); i++) {
            const seat = nextCpuSeat(a);
            for (let k = 0; k < 2; k++) chooseCommand(createGameView(a, seat), 'normal', cpuRandom(a, seat));
            const command = runCpuStep(a);
            expect(b.applyCommand(seat, command)).toBe(true);
        }
        expect(snapshot(a)).toBe(snapshot(b));
    });

    it('ランダムな操作を浴びせても、断った操作で状態が変わらず、記録から再現できる', () => {
        const types = ['move', 'joker', 'rotate', 'exchange', 'alibi', 'bogus'];
        const who = ['holmes', 'watson', 'toby', 'gull'];
        let r = 98765;
        const rand = (k) => { r = (Math.imul(r, 1103515245) + 12345) >>> 0; return r % k; };
        for (const seed of [1, 2, 3]) {
            const game = new Game(cpuPlayers('easy', 'easy'), { seed });
            for (let i = 0; i < 1500 && !game.isOver(); i++) {
                const command = { type: types[rand(types.length)], who: who[rand(4)], steps: rand(4) - 1, tile: rand(11) - 1, rot: rand(5) - 1, a: rand(10), b: rand(10) };
                const before = snapshot(game);
                if (!game.applyCommand(rand(2), command)) expect(snapshot(game)).toBe(before);
                if (rand(4) === 0) runCpuStep(game, nextCpuSeat(game), 'easy');
            }
            const saved = game.persist();
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });
});

describe('CPU どうしの試合', () => {
    it('強さとシードを変えても、止まらずに8ラウンド以内に終わる', () => {
        for (const [jack, detective] of [['easy', 'easy'], ['normal', 'easy'], ['easy', 'normal'], ['normal', 'normal']]) {
            for (let seed = 1; seed <= 15; seed++) {
                const game = playOut(seed, jack, detective);
                expect(game.isOver(), `${jack}/${detective} シード${seed}`).toBe(true);
                expect(game.round).toBeLessThanOrEqual(8);
                expect([JACK, DETECTIVE]).toContain(game.winner);
                expect(game.commands.length).toBeLessThanOrEqual(32);
            }
        }
    });
});
