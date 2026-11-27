import { describe, it, expect } from 'vitest';
import { generate, countSolutions, canPair, shapeOf, solvesByLogic, SIZES, TENT } from '../public/js/puzzles/tents/logic.js';
import tents from '../public/js/puzzles/tents/index.js';

describe('テントのロジック', () => {
    it('テントを置けるのは、木ではなく、となりに木があるマスだけ', () => {
        // 木は真ん中（3×3）
        const { candidate } = shapeOf({ width: 3, height: 3, trees: [4], rows: [1, 0, 0], cols: [0, 1, 0] });
        expect(candidate.map(Number)).toEqual([0, 1, 0, 1, 0, 1, 0, 1, 0]);
    });

    it('木とテントを1つずつ組にできるか', () => {
        const puzzle = { width: 3, height: 1, trees: [0, 2], rows: [1], cols: [0, 1, 0] };
        // テント1つに木2本は組にできない
        expect(canPair(puzzle, cell => cell === 1)).toBe(false);
        const two = { width: 2, height: 2, trees: [0, 3], rows: [1, 1], cols: [1, 1] };
        expect(canPair(two, cell => cell === 1 || cell === 2)).toBe(true);
    });

    it('答えを数える：行と列の数で、置き方が決まる', () => {
        // T . / . . ：右に置くか下に置くか。列の数で右に決まる
        expect(countSolutions({ width: 2, height: 2, trees: [0], rows: [1, 0], cols: [0, 1] }).count).toBe(1);
        // 行と列の数が合わなければ解なし
        expect(countSolutions({ width: 2, height: 2, trees: [0], rows: [0, 0], cols: [0, 1] }).count).toBe(0);
    });

    it('難しさごとの大きさで問題を作り、答えは1つ。やさしいは理屈だけで解ける', () => {
        for (const [difficulty, size] of Object.entries(SIZES)) {
            const puzzle = generate(5, difficulty);
            expect(puzzle.width).toBe(size);
            expect(puzzle.height).toBe(size);
            expect(puzzle.rows.reduce((a, b) => a + b, 0)).toBe(puzzle.trees.length);
            expect(countSolutions(puzzle).count).toBe(1);
        }
        expect(solvesByLogic(generate(5, 'easy'), 'basic')).toBe(true);
    });

    it('テントを置くと解け、となり合うテントはまちがい', () => {
        const puzzle = { width: 2, height: 2, trees: [0], rows: [1, 0], cols: [0, 1] };
        const solved = tents.applyInput(puzzle, tents.initialState(puzzle), { cells: [1], value: TENT });
        expect(tents.check(puzzle, solved).solved).toBe(true);
        const pair = { width: 3, height: 2, trees: [0, 2], rows: [0, 2], cols: [1, 0, 1] };
        const touching = tents.applyInput(pair, tents.initialState(pair), { cells: [3, 4], value: TENT });
        expect(tents.check(pair, touching).solved).toBe(false);
    });
});
