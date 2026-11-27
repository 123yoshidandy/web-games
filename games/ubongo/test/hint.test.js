import { describe, it, expect } from 'vitest';
import { applyCommand, puzzleOf } from '../public/js/game.js';
import { suggest, hintMove } from '../public/js/cpu-player.js';
import { solve, isSolution } from '../public/js/solver.js';
import { placedCells } from '../public/js/pieces.js';
import { newRace } from './helpers.js';

describe('ヒント', () => {
    it('解く時間には、盤面を埋める解答をすすめる', () => {
        const state = newRace();
        const move = suggest(state, 0);
        expect(move.type).toBe('submit');
        expect(applyCommand(state, 0, { ...move, t: 3000 }).ok).toBe(true);
    });

    it('宝石を取る番には、動ける列をすすめ、番でなければ何もすすめない', () => {
        const state = newRace({ players: [{ name: 'A', isCPU: false }, { name: 'B', isCPU: false }] });
        applyCommand(state, 0, { ...suggest(state, 0), t: 3000 });
        applyCommand(state, 1, { ...suggest(state, 1), t: 4000 });
        expect(suggest(state, 1)).toBeNull();
        const move = suggest(state, 0);
        expect(move.type).toBe('pick');
        expect(applyCommand(state, 0, move).ok).toBe(true);
    });

    it('置いたピースのままで解けるなら、その続きの1つを置く', () => {
        const puzzle = puzzleOf(newRace(), 0);
        const [solution] = solve(puzzle.shape, puzzle.pieces);
        const placed = [solution[0]];
        const move = hintMove(puzzle, placed);
        expect(move.remove).toEqual([]);
        expect(placed.some(p => p.id === move.place.id)).toBe(false);
        expect(solve(puzzle.shape, puzzle.pieces, { fixed: [...placed, move.place] }).length).toBe(1);
    });

    it('置いたピースが間違っていれば、ぶつかるピースを外して正しいピースを置く', () => {
        const state = newRace({ seed: 8 });
        const puzzle = puzzleOf(state, 0);
        const [solution] = solve(puzzle.shape, puzzle.pieces);
        // 解答にないマスの組で、盤面に入る置き方を探して置く
        let wrong = null;
        for (const p of solution) {
            for (const rot of [1, 2, 3]) {
                const candidate = { ...p, rot };
                if (solve(puzzle.shape, puzzle.pieces, { fixed: [candidate] }).length === 0 && isSolution(puzzle.shape, [p.id], [candidate]) === false) {
                    const inside = new Set(puzzle.shape.flatMap((row, y) => [...row].map((ch, x) => (ch === '#' ? `${x},${y}` : null))).filter(Boolean));
                    if (placedCells(candidate).every(([x, y]) => inside.has(`${x},${y}`))) wrong = candidate;
                }
                if (wrong) break;
            }
            if (wrong) break;
        }
        if (!wrong) return; // この問題では作れない
        const move = hintMove(puzzle, [wrong]);
        expect(move).not.toBeNull();
        const kept = [wrong].filter(p => !move.remove.includes(p.id));
        expect(solve(puzzle.shape, puzzle.pieces, { fixed: [...kept, move.place] }).length).toBe(1);
    });
});
