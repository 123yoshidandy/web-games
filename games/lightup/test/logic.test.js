import { describe, it, expect } from 'vitest';
import { generate, countSolutions, litCells, shapeOf, solvesByLogic, SIZES, WHITE, BLOCK, LIGHT } from '../public/js/puzzles/lightup/logic.js';
import lightup from '../public/js/puzzles/lightup/index.js';

const W = WHITE;

describe('ライトアップのロジック', () => {
    it('明かりは、黒マスか盤面の端まで、たて・よこを照らす', () => {
        // . . # / . . . （# は数字のない黒マス）
        const puzzle = { width: 3, height: 2, grid: [W, W, BLOCK, W, W, W] };
        const lit = litCells(puzzle, cell => cell === 0);
        expect([...lit]).toEqual([1, 1, 0, 1, 0, 0]);
    });

    it('黒マスのとなりの白マスを数える', () => {
        const puzzle = { width: 3, height: 3, grid: [W, W, W, W, 2, W, W, W, W] };
        expect(shapeOf(puzzle).around[4].sort()).toEqual([1, 3, 5, 7]);
        expect(shapeOf(puzzle).numbered).toEqual([4]);
    });

    it('答えを数える：数字の 0 のまわりには置けない', () => {
        // . 0 . ：0 のとなりに置けないので、両端の白マスを照らせない
        expect(countSolutions({ width: 3, height: 1, grid: [W, 0, W] }).count).toBe(0);
        // . 1 . ：片方に置くと、もう片方は黒マスにさえぎられて照らせない
        expect(countSolutions({ width: 3, height: 1, grid: [W, 1, W] }).count).toBe(0);
        // . . ：どちらに置いても両方を照らすので、答えは2つ
        expect(countSolutions({ width: 2, height: 1, grid: [W, W] }).count).toBe(2);
        // . 2 . ：両方に置く1つだけ
        expect(countSolutions({ width: 3, height: 1, grid: [W, 2, W] }).count).toBe(1);
    });

    it('難しさごとの大きさで問題を作り、答えは1つ。やさしいは理屈だけで解ける', () => {
        for (const [difficulty, size] of Object.entries(SIZES)) {
            const puzzle = generate(5, difficulty);
            expect(puzzle.width).toBe(size);
            expect(puzzle.height).toBe(size);
            expect(countSolutions(puzzle).count).toBe(1);
        }
        expect(solvesByLogic(generate(5, 'easy'), 'basic')).toBe(true);
    });

    it('明かりを置くと解け、照らし合う明かりはまちがい', () => {
        const puzzle = { width: 3, height: 1, grid: [W, 2, W] };
        const solved = lightup.applyInput(puzzle, lightup.initialState(puzzle), { cells: [0, 2], value: LIGHT });
        expect(lightup.check(puzzle, solved).solved).toBe(true);
        const line = { width: 2, height: 1, grid: [W, W] };
        const both = lightup.applyInput(line, lightup.initialState(line), { cells: [0, 1], value: LIGHT });
        expect(lightup.check(line, both).solved).toBe(false);
    });
});
