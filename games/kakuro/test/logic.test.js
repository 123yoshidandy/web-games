import { describe, it, expect } from 'vitest';
import { generate, combosOf, digitsOf, layout, encode, decode, transpose, countSolutions, solvableByLogic, SPECS } from '../public/js/puzzles/kakuro/logic.js';
import { POOL } from '../public/js/puzzles/kakuro/pool.js';
import kakuro from '../public/js/puzzles/kakuro/index.js';

describe('カックロのロジック', () => {
    it('和の組み合わせ：2マスで 3 は 1・2 だけ、3マスで 24 は 7・8・9 だけ', () => {
        expect(combosOf(2, 3).map(digitsOf)).toEqual([[1, 2]]);
        expect(combosOf(3, 24).map(digitsOf)).toEqual([[7, 8, 9]]);
        expect(combosOf(2, 10)).toHaveLength(4);
        expect(combosOf(2, 1)).toEqual([]);
    });

    it('難しさごとの大きさで、組から問題を選ぶ', () => {
        for (const [difficulty, spec] of Object.entries(SPECS)) {
            const puzzle = generate(3, difficulty);
            expect(puzzle.width).toBe(spec.size);
            expect(puzzle.height).toBe(spec.size);
            expect(POOL[difficulty].length).toBeGreaterThanOrEqual(100);
        }
    });

    it('文字にした問題は元に戻り、たてとよこを入れかえても解は1つのまま', () => {
        const puzzle = decode(POOL.normal[5]);
        expect(decode(encode(puzzle))).toEqual(puzzle);
        const turned = transpose(puzzle);
        expect(transpose(turned)).toEqual(puzzle);
        expect(countSolutions(turned, 2).count).toBe(1);
        expect(solvableByLogic(turned)).toBe(true);
    });

    it('組の問題は、どれも理屈だけで解ける（解は1つ）', () => {
        for (const list of Object.values(POOL)) {
            for (const text of list) expect(solvableByLogic(decode(text))).toBe(true);
        }
    });

    it('白いマスの続き：どの白いマスも、よこ・たての続きに入り、続きは2マス以上', () => {
        const puzzle = generate(8, 'hard');
        const { runs, cellRuns, whites } = layout(puzzle);
        whites.forEach(cell => expect(cellRuns[cell].every(r => r >= 0)).toBe(true));
        runs.forEach(run => expect(run.cells.length).toBeGreaterThanOrEqual(2));
    });

    it('まちがい：同じ続きに同じ数字・和が合わない続き・和を超えた続きの数字を示す', () => {
        const puzzle = decode('#,4-0,3-0/0-3,.,./0-4,.,.');
        // よこ 3（1・2）・よこ 4（1・3）・たて 4（1・3）・たて 3（1・2）
        let state = kakuro.initialState(puzzle);
        state = kakuro.applyInput(puzzle, state, { type: 'set', cell: 4, value: 3 });
        state = kakuro.applyInput(puzzle, state, { type: 'set', cell: 5, value: 3 });
        expect(kakuro.check(puzzle, state).errors).toEqual([4, 5]);
        const solved = [[4, 1], [5, 2], [7, 3], [8, 1]].reduce((s, [cell, value]) => kakuro.applyInput(puzzle, s, { type: 'set', cell, value }), kakuro.initialState(puzzle));
        expect(kakuro.check(puzzle, solved)).toEqual({ solved: true, errors: [] });
    });
});
