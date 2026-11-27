import { describe, it, expect } from 'vitest';
import { generate, countSolutions, geometry, isSolution, SIZES } from '../public/js/puzzles/slitherlink/logic.js';

describe('スリザーリンクのロジック', () => {
    it('盤面の形：辺の数と、マスのまわりの4辺', () => {
        const geo = geometry(2, 1);
        // 横の辺 2×2 本と、縦の辺 1×3 本
        expect(geo.edgeCount).toBe(7);
        expect(geo.cellEdges[0]).toEqual([0, 5, 2, 4]);
        expect(geo.vertexEdges[1].sort((a, b) => a - b)).toEqual([0, 1, 5]);
    });

    it('1つの輪で数字が合えば解、2つの輪や枝分かれは解でない', () => {
        const puzzle = { width: 2, height: 1, clues: [3, 3] };
        // 外まわり（横の辺 0・1・2・3 と、縦の辺 4・6）
        const outer = [1, 1, 1, 1, 1, 0, 1];
        expect(isSolution(puzzle, outer)).toBe(true);
        // 2つの正方形（真ん中の縦の辺も引く）は、点の線が3本になる
        expect(isSolution({ width: 2, height: 1, clues: [null, null] }, [1, 1, 1, 1, 1, 1, 1])).toBe(false);
        expect(isSolution({ width: 2, height: 1, clues: [2, 3] }, outer)).toBe(false);
    });

    it('難しさごとの大きさで、解が1つの問題を作る', () => {
        for (const [difficulty, size] of Object.entries(SIZES)) {
            const puzzle = generate(5, difficulty);
            expect(puzzle.width).toBe(size);
            expect(puzzle.clues).toHaveLength(size * size);
            expect(countSolutions(puzzle, 2).count).toBe(1);
        }
    });
});
