import { describe, it, expect } from 'vitest';
import { generate, countSolutions, solvableByLogic, geometry, SPECS } from '../public/js/puzzles/sudoku/logic.js';
import sudoku from '../public/js/puzzles/sudoku/index.js';

describe('数独のロジック', () => {
    it('難しさごとの大きさとブロックで問題を作る', () => {
        for (const [difficulty, spec] of Object.entries(SPECS)) {
            const puzzle = generate(3, difficulty);
            expect(puzzle.size).toBe(spec.size);
            expect(puzzle.boxWidth * puzzle.boxHeight).toBe(spec.size);
            expect(puzzle.givens).toHaveLength(spec.size * spec.size);
        }
    });

    it('盤の形：どのマスも、行・列・ブロックの3つのまとまりに入る', () => {
        const geo = geometry({ size: 6, boxWidth: 3, boxHeight: 2 });
        expect(geo.units).toHaveLength(18);
        expect(geo.peers[0]).toHaveLength(5 + 5 + 2);
        expect(geo.unitsOf[7]).toEqual([1, 6 + 1, 12 + 0]);
    });

    it('ふつうは一つに決まるマスを探すだけで解け、むずかしいはそれだけでは解けない', () => {
        for (const seed of [1, 2, 3]) {
            expect(solvableByLogic(generate(seed, 'normal'), 1)).toBe(true);
            const hard = generate(seed, 'hard');
            expect(solvableByLogic(hard, 1)).toBe(false);
            expect(solvableByLogic(hard, 2)).toBe(true);
            expect(countSolutions(hard, 2).count).toBe(1);
        }
    });

    it('メモは数字を書いたマスに付かず、書いた数字は同じ行・列・ブロックのメモから外れる', () => {
        const puzzle = generate(5, 'easy');
        const empty = puzzle.givens.indexOf(0);
        const geo = geometry(puzzle);
        const peer = geo.peers[empty].find(cell => !puzzle.givens[cell]);
        let state = sudoku.initialState(puzzle);
        state = sudoku.applyInput(puzzle, state, { type: 'note', cell: peer, value: 2 });
        expect(state.notes[peer]).toBe(1 << 2);
        state = sudoku.applyInput(puzzle, state, { type: 'set', cell: empty, value: 2 });
        expect(state.notes[peer]).toBe(0);
        expect(sudoku.applyInput(puzzle, state, { type: 'note', cell: empty, value: 3 })).toBe(state);
    });
});
