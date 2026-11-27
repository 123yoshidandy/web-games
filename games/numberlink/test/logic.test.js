import { describe, it, expect } from 'vitest';
import { generate, countSolutions, endGrid, isAdjacent, neighborsOf, SIZES } from '../public/js/puzzles/numberlink/logic.js';
import numberlink from '../public/js/puzzles/numberlink/index.js';

describe('ナンバーリンクのロジック', () => {
    it('となりのマス：行の端をまたがない', () => {
        expect(isAdjacent(3, 0, 1)).toBe(true);
        expect(isAdjacent(3, 0, 3)).toBe(true);
        expect(isAdjacent(3, 2, 3)).toBe(false);
        expect(isAdjacent(3, 0, 4)).toBe(false);
        expect(neighborsOf(3, 2)[0].sort()).toEqual([1, 3]);
    });

    it('数字のマスに、数字の組の番号が入る', () => {
        const grid = endGrid({ width: 2, height: 2, ends: [[0, 3]] });
        expect([...grid]).toEqual([0, -1, -1, 0]);
    });

    it('答えを数える：すべてのマスを通る解だけを数える', () => {
        // 1 1 / 2 2：答えは1つ
        expect(countSolutions({ width: 2, height: 2, ends: [[0, 1], [2, 3]] }).count).toBe(1);
        // 2×2 の対角の数字は、すべてのマスを通れない
        expect(countSolutions({ width: 2, height: 2, ends: [[0, 3], [1, 2]] }).count).toBe(0);
    });

    it('難しさごとの大きさで問題を作り、答えは1つ', () => {
        for (const [difficulty, size] of Object.entries(SIZES)) {
            const puzzle = generate(5, difficulty);
            expect(puzzle.width).toBe(size);
            expect(puzzle.height).toBe(size);
            expect(countSolutions(puzzle).count).toBe(1);
        }
    });

    it('線を引き直すと、重なったほかの線はその手前で切れる', () => {
        const puzzle = { width: 3, height: 1, ends: [[0, 2]] };
        const state = numberlink.applyInput(puzzle, numberlink.initialState(puzzle), { type: 'path', pair: 0, cells: [0, 1, 2] });
        expect(state.paths[0]).toEqual([0, 1, 2]);
        expect(numberlink.check(puzzle, state).solved).toBe(true);
        expect(numberlink.applyInput(puzzle, state, { type: 'clear', pair: 0 }).paths[0]).toEqual([]);
    });
});
