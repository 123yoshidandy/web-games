import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { desiredSignals, hasCpuWork, runCpuStep, LEVELS } from '../public/js/cpu.js';
import { runMatches } from '../scripts/cpu-match.mjs';

describe('CPU', () => {
    it('どの強さ・人数でも、CPU だけで最後まで進む（止まらない）', () => {
        for (const level of LEVELS) {
            for (const count of [1, 2, 3, 5]) {
                const r = runMatches({ games: 6, count, level, seedBase: 100 });
                expect(r.stuck).toBe(0);
                expect(r.finished).toBe(6);
            }
        }
    });

    it('強いほど残りが少ない（3人、40試合の平均）', () => {
        const avg = level => {
            const r = runMatches({ games: 40, count: 3, level, seedBase: 300 });
            return r.remaining.reduce((s, v) => s + v, 0) / r.finished;
        };
        const [easy, normal, strong] = LEVELS.map(avg);
        expect(normal).toBeLessThan(easy);
        expect(strong).toBeLessThan(normal);
        expect(normal).toBeLessThanOrEqual(15);
    });

    it('合図は近いカードがある山だけに、2つまで置く。やさしい CPU は合図を出さない', () => {
        const game = new Game([{ name: 'a' }, { name: 'b', isCPU: true, level: 'normal' }], { seed: 1 });
        game.hands[1] = [3, 50, 51, 52, 97, 98, 60];
        expect(desiredSignals(game, 1)).toEqual(['stop', 'stop', null, null]);
        game.hands[1] = [30, 40, 50, 60, 70, 80, 90];
        expect(desiredSignals(game, 1)).toEqual([null, null, null, null]);
        game.players[1].level = 'easy';
        game.hands[1] = [2, 3, 99, 98, 50, 51, 52];
        expect(desiredSignals(game, 1)).toEqual([null, null, null, null]);
    });

    it('人の番でも、CPU の仲間は合図を置き直す', () => {
        const game = new Game([{ name: 'a' }, { name: 'b', isCPU: true, level: 'strong' }], { seed: 2 });
        game.hands[1] = [2, 50, 51, 52, 53, 54, 55];
        expect(hasCpuWork(game)).toBe(true);
        expect(runCpuStep(game)).toBe(true);
        expect(game.commands.at(-1)).toMatchObject({ seat: 1, command: { type: 'signal' } });
    });
});
