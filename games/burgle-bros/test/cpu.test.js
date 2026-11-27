import { describe, it, expect } from 'vitest';
import { playMatch } from '../scripts/cpu-match.mjs';
import { makeGame } from './helpers.js';
import { runCpuStep, isCpuTurn } from '../public/js/cpu-player.js';

describe('CPU', () => {
    it.each([1, 2, 3, 4])('%i人の CPU だけの試合が、階数とシードを変えても止まらずに終わる', (count) => {
        for (const floors of [1, 2, 3]) {
            for (let seed = 1; seed <= 3; seed++) {
                const game = playMatch({ count, floors, seed });
                expect(game.isOver(), `${floors}階 ${seed}`).toBe(true);
            }
        }
    });

    it('同じ状態なら同じ手を打つ（ゲームの乱数を使わない）', () => {
        const a = makeGame(3, { seed: 21, floors: 2 });
        const b = makeGame(3, { seed: 21, floors: 2 });
        a.players.forEach(p => { p.isCPU = true; });
        b.players.forEach(p => { p.isCPU = true; });
        for (let i = 0; i < 80; i++) {
            runCpuStep(a);
            runCpuStep(b);
        }
        expect(JSON.stringify(a.commands)).toBe(JSON.stringify(b.commands));
    });

    it('人の席だけなら、CPU は動かない', () => {
        const game = makeGame(2, { seed: 3 });
        expect(isCpuTurn(game)).toBe(false);
        expect(runCpuStep(game)).toBe(false);
    });

    it('1階建てなら、CPU だけでもよく勝つ', () => {
        let wins = 0;
        for (let seed = 1; seed <= 20; seed++) if (playMatch({ count: 2, floors: 1, seed }).result.won) wins++;
        expect(wins).toBeGreaterThanOrEqual(12);
    });
});
