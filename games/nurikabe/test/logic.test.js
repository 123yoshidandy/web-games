import { describe, it, expect } from 'vitest';
import { generate, logicSolve, isSolution, countSolutions, decode, encode, transform, deduce, startGrid, SPECS } from '../public/js/puzzles/nurikabe/logic.js';
import { POOL } from '../public/js/puzzles/nurikabe/pool.js';
import nurikabe from '../public/js/puzzles/nurikabe/index.js';

// 4×4 の小さな問題（答えの1つ：2・W1 / WWWW / ・W3W / 2W・・。3 の島の形が2通りあるので、決まりの判定とまちがいの表示だけに使う）
const SMALL = decode('2..1/..../..3./2...');

describe('ぬりかべのロジック', () => {
    it('難しさごとの大きさで問題を作り、組のある難しさは組から選ぶ', () => {
        for (const [difficulty, spec] of Object.entries(SPECS)) {
            const puzzle = generate(3, difficulty);
            expect(puzzle.width).toBe(spec.size);
            expect(puzzle.height).toBe(spec.size);
            if (spec.pool) expect(POOL[difficulty].length).toBeGreaterThanOrEqual(100);
        }
    });

    it('やさしいの問題は、仮置きなしの理屈だけで解け、答えは1つ', () => {
        for (const seed of [1, 2, 3, 4, 5]) {
            const puzzle = generate(seed, 'easy');
            const result = logicSolve(puzzle);
            expect(result.solved).toBe(true);
            expect(isSolution(puzzle, result.grid)).toBe(true);
        }
        expect(countSolutions(SMALL, 3).count).toBe(2);
    });

    it('決まり：2×2 の壁・つながらない壁・数字のない島は答えにならない', () => {
        const answer = [0, 0, 1, 0, 1, 1, 1, 1, 0, 1, 0, 1, 0, 1, 0, 0];
        expect(isSolution(SMALL, answer)).toBe(true);
        const square = answer.slice();
        square[10] = 1; // 3 の島を削ると 2×2 の壁ができ、島も小さくなる
        expect(isSolution(SMALL, square)).toBe(false);
        const split = answer.slice();
        split[5] = 0; // 壁を1つ島にすると、壁が切れて数字のない島ができる
        expect(isSolution(SMALL, split)).toBe(false);
    });

    it('大きさどおりの島のまわりは壁と決まる', () => {
        const grid = startGrid(SMALL);
        const step = deduce(SMALL, grid);
        expect(step.value).toBe(1);
        expect(step.cells.length).toBeGreaterThan(0);
    });

    it('文字にした問題は元に戻り、回しても裏返しても理屈で解ける', () => {
        const puzzle = decode(POOL.hard[7]);
        expect(decode(encode(puzzle))).toEqual(puzzle);
        for (let k = 0; k < 8; k++) expect(logicSolve(transform(puzzle, k), { trial: true }).solved).toBe(true);
        expect(transform(transform(puzzle, 1), 3)).toEqual(puzzle);
    });

    it('組の問題は、ふつうは仮置きなし、むずかしいは仮置きありの理屈で解ける', () => {
        for (const text of POOL.normal) expect(logicSolve(decode(text)).solved).toBe(true);
        for (const text of POOL.hard.slice(0, 20)) {
            const result = logicSolve(decode(text), { trial: true });
            expect(result.solved).toBe(true);
            expect(result.trials).toBeGreaterThan(0);
        }
    });

    it('まちがい：2×2 の壁と、数字が2つの島を示す', () => {
        let state = nurikabe.initialState(SMALL);
        state = nurikabe.applyInput(SMALL, state, { cells: [4, 5, 8, 9], value: 1 });
        expect(nurikabe.check(SMALL, state).errors).toEqual([4, 5, 8, 9]);
        expect(nurikabe.applyInput(SMALL, state, { cells: [0], value: 1 })).toBe(state);
        const joined = nurikabe.applyInput(SMALL, nurikabe.initialState(SMALL), { cells: [1, 2], value: 2 });
        expect(nurikabe.check(SMALL, joined).errors).toEqual([0, 1, 2, 3]);
    });
});
