import { describe, it, expect } from 'vitest';
import { runMatches } from '../scripts/cpu-match.mjs';

describe('CPU', () => {
    it('CPU どうしの試合が、人数・強さ・シードを変えても止まらない', () => {
        for (const levels of [['easy', 'easy'], ['normal', 'easy'], ['easy', 'normal', 'easy'], ['easy', 'easy', 'easy', 'normal']]) {
            const r = runMatches({ games: 4, levels, seedBase: 20 });
            expect(r.stuck, levels.join()).toBe(0);
            expect(r.finished).toBe(4);
        }
    });

    it('ふつうは、やさしいに大きく勝ち越す', () => {
        const r = runMatches({ games: 10, levels: ['normal', 'easy'], seedBase: 300 });
        expect(r.wins[0]).toBeGreaterThanOrEqual(8);
    });

    it('基本の得点法でも最後まで進む', () => {
        const r = runMatches({ games: 3, levels: ['easy', 'easy', 'easy'], seedBase: 5, scoring: 'basic' });
        expect(r.finished).toBe(3);
    });
});
