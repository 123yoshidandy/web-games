import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { players } from './helpers.js';
import { runCpuStep, suggest, cpuSeatsToAct } from '../public/js/cpu-player.js';
import { runMatches } from '../scripts/cpu-match.mjs';

describe('CPU の精霊', () => {
    it.each([1, 2, 3, 4])('%i人の CPU だけで、止まらずに最後まで進む', (n) => {
        const r = runMatches({ games: 3, count: n, level: 'normal', seedBase: 20 });
        expect(r.stuck).toBe(0);
    });

    it('同じ局面からは同じ手を選ぶ（ゲームの乱数を使わない）', () => {
        const a = new Game(players(2, true), { seed: 4 });
        const b = new Game(players(2, true), { seed: 4 });
        for (let i = 0; i < 30; i++) {
            runCpuStep(a);
            runCpuStep(b);
        }
        expect(JSON.stringify(a.commands)).toBe(JSON.stringify(b.commands));
        const seat = a.actors()[0];
        expect(suggest(a, seat)).toEqual(suggest(b, seat));
    });

    it('人の席は CPU が打たない', () => {
        const game = new Game([{ name: 'あなた' }, { name: 'CPU', isCPU: true }], { seed: 3 });
        expect(cpuSeatsToAct(game)).toEqual([1]);
        runCpuStep(game);
        expect(game.commands.every(c => c.seat === 1)).toBe(true);
    });

    it('やさしいでは、CPU だけでも勝てることがある', () => {
        const r = runMatches({ games: 8, count: 2, level: 'easy', seedBase: 1 });
        expect(r.wins).toBeGreaterThan(0);
    });
});
