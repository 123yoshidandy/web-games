import { describe, it, expect } from 'vitest';
import { generate, countSolutions, edgesOf, edgeBetween, SIZES } from '../public/js/puzzles/hashi/logic.js';
import hashi from '../public/js/puzzles/hashi/index.js';

describe('橋をかけろのロジック', () => {
    it('2つの島の間の所と、その解（2本）', () => {
        const puzzle = { width: 3, height: 1, islands: [[0, 2], [2, 2]] };
        expect(edgesOf(puzzle).edges).toHaveLength(1);
        expect(edgeBetween(puzzle, 1, 0)).toBe(0);
        const { count, solution } = countSolutions(puzzle, 2);
        expect(count).toBe(1);
        expect([...solution]).toEqual([2]);
    });

    it('十字に交わる所は、片方に橋があると、もう片方にかけられない', () => {
        // 上・左・右・下の4つの島（マスの順）。上下の所と左右の所が真ん中で交わる
        const puzzle = { width: 3, height: 3, islands: [[1, 1], [3, 1], [5, 1], [7, 1]] };
        const vertical = edgeBetween(puzzle, 0, 3);
        const horizontal = edgeBetween(puzzle, 1, 2);
        expect(edgesOf(puzzle).edges[vertical].crosses).toContain(horizontal);
        const state = hashi.applyInput(puzzle, hashi.initialState(puzzle), { type: 'bridge', a: 0, b: 3, count: 1 });
        expect(state.bridges[vertical]).toBe(1);
        expect(hashi.applyInput(puzzle, state, { type: 'bridge', a: 1, b: 2, count: 1 })).toBe(state);
    });

    it('難しさごとの大きさで、解が1つの問題を作る', () => {
        for (const [difficulty, size] of Object.entries(SIZES)) {
            const puzzle = generate(5, difficulty);
            expect(puzzle.width).toBe(size);
            expect(puzzle.height).toBe(size);
            expect(countSolutions(puzzle, 2).count).toBe(1);
        }
    });
});
