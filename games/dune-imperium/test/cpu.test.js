import { describe, it, expect } from 'vitest';
import { runMatches, playMatch } from '../scripts/cpu-match.mjs';

describe('CPU', () => {
    it.each([['easy', 'normal'], ['normal', 'normal', 'easy'], ['normal', 'easy', 'normal', 'easy']])('CPU だけの試合が最後まで進む（%s ほか）', (...levels) => {
        const r = runMatches({ games: 12, levels });
        expect(r.stuck).toBe(0);
        expect(r.finished).toBe(12);
    });

    it('ふつうはやさしいより勝つ', () => {
        const r = runMatches({ games: 60, levels: ['easy', 'normal'] });
        expect(r.wins[1]).toBeGreaterThan(r.wins[0] * 1.5);
    });

    it('同じシードなら CPU の試合も同じ展開になる', () => {
        const a = playMatch({ levels: ['normal', 'easy', 'normal'], seed: 9 });
        const b = playMatch({ levels: ['normal', 'easy', 'normal'], seed: 9 });
        expect(JSON.stringify(a.commands)).toBe(JSON.stringify(b.commands));
    });
});
