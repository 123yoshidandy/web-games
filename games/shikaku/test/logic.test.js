import { describe, it, expect } from 'vitest';
import { generate, countSolutions, areaOf, cellsOf, containsCell, SIZES } from '../public/js/puzzles/shikaku/logic.js';
import shikaku from '../public/js/puzzles/shikaku/index.js';

describe('四角に切れのロジック', () => {
    it('長方形の面積・マス・含むかどうか', () => {
        expect(areaOf([0, 1, 1, 3])).toBe(6);
        expect(cellsOf([0, 1, 1, 2], 4)).toEqual([1, 2, 5, 6]);
        expect(containsCell([1, 1, 2, 2], 4, 5)).toBe(true);
        expect(containsCell([1, 1, 2, 2], 4, 4)).toBe(false);
    });

    it('2×2 に「2」が2つ：たてに分ける解が1つ', () => {
        const puzzle = { width: 2, height: 2, clues: [[0, 2], [1, 2]] };
        const { count, solutions } = countSolutions(puzzle, 2);
        expect(count).toBe(1);
        expect(solutions[0].map(rect => areaOf(rect))).toEqual([2, 2]);
    });

    it('描いた長方形に重なる長方形は消え、押したマスの長方形は消える', () => {
        const puzzle = { width: 2, height: 2, clues: [[0, 2], [1, 2]] };
        let state = shikaku.applyInput(puzzle, shikaku.initialState(puzzle), { type: 'rect', top: 0, left: 0, bottom: 0, right: 1 });
        state = shikaku.applyInput(puzzle, state, { type: 'rect', top: 0, left: 0, bottom: 1, right: 0 });
        expect(state.rects).toEqual([[0, 0, 1, 0]]);
        state = shikaku.applyInput(puzzle, state, { type: 'rect', top: 0, left: 1, bottom: 1, right: 1 });
        expect(shikaku.check(puzzle, state).solved).toBe(true);
        expect(shikaku.applyInput(puzzle, state, { type: 'erase', cell: 3 }).rects).toEqual([[0, 0, 1, 0]]);
    });

    it('難しさごとの大きさで、数字の合計がマスの数になる問題を作る', () => {
        for (const [difficulty, size] of Object.entries(SIZES)) {
            const puzzle = generate(5, difficulty);
            expect(puzzle.width).toBe(size);
            expect(puzzle.clues.reduce((sum, [, n]) => sum + n, 0)).toBe(size * size);
            expect(countSolutions(puzzle, 2).count).toBe(1);
        }
    });
});
