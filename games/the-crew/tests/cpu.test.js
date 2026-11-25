import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { runCpuStep, chooseCommunication, determinize, taskScore } from '../public/js/cpu.js';
import { createRandom } from '../public/js/random.js';

describe('CPU', () => {
    it.each([2, 3, 4, 5])('%i人：CPU だけで全ミッションが止まらずに終わる', players => {
        for (let mission = 1; mission <= 50; mission++) {
            const game = new Game(Array.from({ length: players }, (_, i) => ({ name: `C${i}`, isCPU: true })), { seed: mission * 17 + players, mission });
            let steps = 0;
            while (!game.isOver && steps++ < 1000) expect(runCpuStep(game, 'easy')).toBe(true);
            expect(game.isOver).toBe(true);
            expect(() => Game.replay(game.players.filter(p => !p.jarvis), { seed: game.seed, mission }, game.commands)).not.toThrow();
        }
    });

    it('ふつうの CPU でも止まらない', () => {
        for (const mission of [1, 13, 23, 40, 50]) {
            const game = new Game(Array.from({ length: 4 }, (_, i) => ({ name: `C${i}`, isCPU: true })), { seed: mission, mission });
            while (!game.isOver) expect(runCpuStep(game, 'normal')).toBe(true);
        }
    });
});

describe('CPU の考え', () => {
    it('ほかの人の課題のカードを持っていたら、それを通信する', () => {
        const game = new Game([{ name: 'A' }, { name: 'B', isCPU: true }, { name: 'C', isCPU: true }], { seed: 3, mission: 1 });
        game.hands = [['blue3', 'pink1'], ['blue5', 'pink9'], ['blue1', 'pink2']];
        game.tasks = [{ card: 'pink9', owner: 0, token: null, done: false, order: null }];
        game.steps = [];
        game.step = null;
        game.phase = 'play';
        game.trick = { leader: 0, plays: [] };
        expect(chooseCommunication(game, 1)).toBe('pink9');
        expect(chooseCommunication(game, 2)).toBe(null);
    });

    it('見えないカードを想像するとき、通信と、色を出せなかったことに合わせる', () => {
        const game = new Game([{ name: 'A' }, { name: 'B', isCPU: true }, { name: 'C', isCPU: true }, { name: 'D', isCPU: true }], { seed: 5, mission: 1 });
        while (game.phase === 'prep') game.applyCommand(game.current, { type: 'pickTask', index: 0 });
        const seat = (game.commander + 1) % 4;
        const hand = game.hands[seat];
        const card = hand.find(c => !c.startsWith('rocket') && hand.filter(x => x.slice(0, -1) === c.slice(0, -1)).length === 1);
        if (!card) return;
        game.applyCommand(seat, { type: 'communicate', card });
        const me = (seat + 1) % 4;
        const random = createRandom(1);
        for (let i = 0; i < 20; i++) {
            const sim = determinize(game, me, random);
            expect(sim.hands[me]).toEqual(game.hands[me]);
            expect(sim.hands[seat]).toContain(card);
            // 唯一と伝えた色は、ほかにない
            expect(sim.hands[seat].filter(c => c.slice(0, -1) === card.slice(0, -1))).toEqual([card]);
            expect(sim.hands.map(h => h.length)).toEqual(game.hands.map(h => h.length));
        }
    });

    it('課題の取りやすさ：同じ色の大きいカードがあると高い', () => {
        expect(taskScore(['blue9', 'pink1'], 'blue3')).toBeGreaterThan(taskScore(['blue1', 'pink1'], 'blue3'));
        expect(taskScore(['blue9', 'pink1'], 'blue9')).toBeGreaterThan(taskScore(['blue2', 'pink1'], 'blue2'));
    });
});
