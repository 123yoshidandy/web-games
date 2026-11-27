import { describe, it, expect } from 'vitest';
import { solveLine, runsOf, generate, SIZES } from '../public/js/puzzles/nonogram/logic.js';

describe('お絵かきロジックのロジック', () => {
    it('1行の解き方：数字から、どの並べ方でも同じになるマスが決まる', () => {
        expect(solveLine([3], [-1, -1, -1, -1])).toEqual([-1, 1, 1, -1]);
        expect(solveLine([1, 1], [-1, -1, -1])).toEqual([1, 0, 1]);
        expect(solveLine([], [-1, -1])).toEqual([0, 0]);
        expect(solveLine([2], [1, 0, -1])).toBeNull();
    });

    it('塗ったマスの塊の長さ', () => {
        expect(runsOf([1, 1, 0, 1, 0, 0, 1, 1, 1])).toEqual([2, 1, 3]);
        expect(runsOf([0, 0])).toEqual([]);
    });

    it('難しさごとの大きさで問題を作る', () => {
        for (const [difficulty, size] of Object.entries(SIZES)) {
            const puzzle = generate(3, difficulty);
            expect(puzzle.width).toBe(size);
            expect(puzzle.rows).toHaveLength(size);
            expect(puzzle.cols).toHaveLength(size);
        }
    });
});
