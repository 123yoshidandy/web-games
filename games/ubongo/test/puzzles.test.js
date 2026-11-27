import { describe, it, expect } from 'vitest';
import { CARDS } from '../public/js/puzzles.js';
import { solve } from '../public/js/solver.js';
import { PIECE_IDS, pieceSize } from '../public/js/pieces.js';

describe('問題のカード', () => {
    for (const k of [3, 4]) {
        it(`${k}ピースのカードが36枚あり、どの組も解ける`, () => {
            expect(CARDS[k]).toHaveLength(36);
            const ids = new Set();
            for (const card of CARDS[k]) {
                ids.add(card.id);
                expect(card.sets).toHaveLength(6);
                const area = card.shape.join('').split('').filter(ch => ch === '#').length;
                for (const set of card.sets) {
                    expect(set).toHaveLength(k);
                    set.forEach(id => expect(PIECE_IDS).toContain(id));
                    expect(set.reduce((sum, id) => sum + pieceSize(id), 0)).toBe(area);
                    expect(solve(card.shape, set).length, `${card.id} ${set.join(',')}`).toBe(1);
                }
                expect(new Set(card.sets.map(s => s.join())).size).toBe(6);
                // スマホの縦の画面に収まる大きさ
                expect(card.shape[0].length).toBeLessThanOrEqual(6);
                expect(card.shape.length).toBeLessThanOrEqual(5);
            }
            expect(ids.size).toBe(36);
        });
    }
});
