/**
 * 数独
 * 問題・状態・入力の形は logic.js の先頭。理屈だけで解ける問題だけを作るので、解は1つで、ヒントも理屈で決まるマスを示せる
 * やさしいは 6×6（2×3 のブロック）、ふつうとむずかしいは 9×9
 */

import { generate, countSolutions, geometry, filledGrid, candidatesOf, findPlacement, eliminate, bitCount, SPECS } from './logic.js';
import { render } from './render.js';
import { randomInt } from '../../random.js';

// 答え（数字の盤）。ヒントで何度も使うので、問題ごとに覚えておく
const solutionCache = new Map();
function solutionGrid(puzzle) {
    const key = JSON.stringify(puzzle);
    if (!solutionCache.has(key)) {
        if (solutionCache.size > 20) solutionCache.delete(solutionCache.keys().next().value);
        solutionCache.set(key, countSolutions(puzzle, 1).grid);
    }
    return solutionCache.get(key);
}

const validPuzzle = (puzzle) => Number.isInteger(puzzle?.size) && Array.isArray(puzzle.givens) && puzzle.givens.length === puzzle.size * puzzle.size;
const validState = (puzzle, state) => {
    const n = puzzle.size * puzzle.size;
    return Array.isArray(state?.values) && state.values.length === n && Array.isArray(state.notes) && state.notes.length === n
        && state.values.every(v => Number.isInteger(v) && v >= 0 && v <= puzzle.size)
        && state.notes.every(v => Number.isInteger(v) && v >= 0);
};

const cellName = (puzzle, cell) => `上から${Math.floor(cell / puzzle.size) + 1}行目・左から${(cell % puzzle.size) + 1}列目`;
const unitName = (unit) => (unit.kind === 'row' ? `上から${unit.index + 1}行目` : unit.kind === 'col' ? `左から${unit.index + 1}列目` : 'このブロック');
const sizeLabel = (difficulty) => `${SPECS[difficulty].size}×${SPECS[difficulty].size}`;

const sudoku = {
    id: 'sudoku',
    name: '数独',
    rules: [
        'あいているマスに数字を入れましょう。9×9 なら 1〜9、6×6 なら 1〜6 を使います。',
        'どの行（よこ）・列（たて）・太線で囲んだブロックにも、同じ数字が1つずつ入ります。'
    ],
    controls: 'マスを押して選び、下の数字のボタンで入れます。「メモ」にすると、候補の数字を小さく書いておけます。「消す」で選んだマスを消します。',
    difficulties: { easy: sizeLabel('easy'), normal: sizeLabel('normal'), hard: `${sizeLabel('hard')}（数字が少なめ）` },
    // CPU が1手（ヒント1つ分：数字1つ）にかける秒数の目安（ふつうの強さ）
    cpuSecondsPerStep: 2.5,

    generate,

    solve(puzzle, limit = 2) {
        const { count, grid } = countSolutions(puzzle, limit);
        return {
            count,
            solution: grid ? { values: grid.map((d, i) => (puzzle.givens[i] ? 0 : d)), notes: new Array(grid.length).fill(0) } : null
        };
    },

    initialState: (puzzle) => ({ values: new Array(puzzle.givens.length).fill(0), notes: new Array(puzzle.givens.length).fill(0) }),

    applyInput(puzzle, state, input) {
        if (!input || (input.type !== 'set' && input.type !== 'note')) return state;
        const { cell, value } = input;
        if (!Number.isInteger(cell) || cell < 0 || cell >= puzzle.givens.length || puzzle.givens[cell]) return state;
        if (!Number.isInteger(value) || value < 0 || value > puzzle.size) return state;
        if (input.type === 'note') {
            if (value === 0 || state.values[cell]) return state;
            const notes = state.notes.slice();
            notes[cell] ^= 1 << value;
            return { values: state.values, notes };
        }
        if (state.values[cell] === value && !state.notes[cell]) return state;
        const values = state.values.slice();
        values[cell] = value;
        const notes = state.notes.slice();
        notes[cell] = 0;
        // 書いた数字は、同じ行・列・ブロックのメモから外す
        if (value) {
            const bit = 1 << value;
            for (const p of geometry(puzzle).peers[cell]) notes[p] &= ~bit;
        }
        return { values, notes };
    },

    // 解けたか（すべて埋まり、どのまとまりにも同じ数字がない）と、同じまとまりに同じ数字がある、書いたマス
    check(puzzle, state) {
        if (!validPuzzle(puzzle) || !validState(puzzle, state)) return { solved: false, errors: [] };
        const geo = geometry(puzzle);
        const grid = filledGrid(puzzle, state.values);
        const clash = new Set();
        for (const unit of geo.units) {
            const seen = new Map();
            for (const cell of unit.cells) {
                const d = grid[cell];
                if (!d) continue;
                if (seen.has(d)) {
                    clash.add(cell);
                    clash.add(seen.get(d));
                } else seen.set(d, cell);
            }
        }
        const errors = [...clash].filter(cell => !puzzle.givens[cell]).sort((a, b) => a - b);
        return { solved: !clash.size && grid.every(Boolean), errors };
    },

    // 次の一手：まちがった数字があれば消す。なければ、理屈で一つに決まるマスを示す（決まらなければ答えを1つ示す）
    hint(puzzle, state) {
        if (!validPuzzle(puzzle) || !validState(puzzle, state) || sudoku.check(puzzle, state).solved) return null;
        const answer = solutionGrid(puzzle);
        const wrong = state.values.findIndex((v, i) => v && !puzzle.givens[i] && v !== answer[i]);
        if (wrong >= 0) {
            return { input: { type: 'set', cell: wrong, value: 0 }, cells: [wrong], message: 'この数字はちがいます。消しましょう' };
        }
        const geo = geometry(puzzle);
        const grid = filledGrid(puzzle, state.values);
        const cand = candidatesOf(geo, grid);
        const show = (cell, value, message) => ({ input: { type: 'set', cell, value }, cells: [cell], message });
        const step = findPlacement(geo, grid, cand);
        if (step?.kind === 'naked') return show(step.cell, step.value, `このマスに入るのは ${step.value} だけです（同じ行・列・ブロックにない数字）`);
        if (step) return show(step.cell, step.value, `${unitName(step.unit)}で ${step.value} が入るのは、このマスだけです`);
        while (eliminate(geo, grid, cand)) {
            const next = findPlacement(geo, grid, cand);
            if (next) return show(next.cell, next.value, `候補をしぼると（ブロックと行・列の重なりや、2つの数字の組から）、このマスは ${next.value} に決まります`);
        }
        let best = -1;
        grid.forEach((d, i) => { if (!d && (best < 0 || bitCount(cand[i]) < bitCount(cand[best]))) best = i; });
        return show(best, answer[best], `${cellName(puzzle, best)}は ${answer[best]} です`);
    },

    // 試験用：でたらめな1手
    randomInput(puzzle, state, random) {
        const cell = randomInt(random, puzzle.givens.length);
        if (random() < 0.2) return { type: 'note', cell, value: 1 + randomInt(random, puzzle.size) };
        return { type: 'set', cell, value: randomInt(random, puzzle.size + 1) };
    },

    render
};

export default sudoku;
