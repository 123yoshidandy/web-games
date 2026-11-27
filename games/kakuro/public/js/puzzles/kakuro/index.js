/**
 * カックロ
 * 問題・状態・入力の形は logic.js の先頭。問題は前もって作って確かめた組（pool.js）から選ぶ。どれも理屈だけで解けるので、解は1つで、ヒントも理屈で決まるマスを示せる
 * やさしいは 6×6、ふつうは 8×8、むずかしいは 9×9（どれも上の1行と左の1列は和の黒いマス）
 */

import { generate, countSolutions, layout, validPuzzle, initialCandidates, narrow, findPlacement, bitCount, SPECS } from './logic.js';
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

const validState = (puzzle, state) => {
    const n = puzzle.width * puzzle.height;
    return Array.isArray(state?.values) && state.values.length === n && Array.isArray(state.notes) && state.notes.length === n
        && state.values.every(v => Number.isInteger(v) && v >= 0 && v <= 9)
        && state.notes.every(v => Number.isInteger(v) && v >= 0);
};

const runName = (run) => `${run.dir === 'right' ? 'よこ' : 'たて'}の和 ${run.sum}（${run.cells.length}マス）`;
const cellName = (puzzle, cell) => `上から${Math.floor(cell / puzzle.width) + 1}行目・左から${(cell % puzzle.width) + 1}列目`;
const sizeLabel = (difficulty) => `${SPECS[difficulty].size}×${SPECS[difficulty].size}`;

const kakuro = {
    id: 'kakuro',
    name: 'カックロ',
    rules: [
        '白いマスに 1〜9 の数字を入れましょう。黒いマスの斜線の右上の数字は右へ続く白いマスの和、左下の数字は下へ続く白いマスの和です。',
        '和を作る続きの中では、同じ数字を2回使えません。たとえば 2マスで和が 3 なら、1 と 2 の組だけです。'
    ],
    controls: 'マスを押して選び、下の数字のボタンで入れます。「メモ」にすると、候補の数字を小さく書いておけます。「消す」で選んだマスを消します。',
    difficulties: { easy: sizeLabel('easy'), normal: sizeLabel('normal'), hard: sizeLabel('hard') },
    // CPU が1手（ヒント1つ分：数字1つ）にかける秒数の目安（ふつうの強さ）
    cpuSecondsPerStep: 4,

    generate,

    solve(puzzle, limit = 2) {
        const { count, grid } = countSolutions(puzzle, limit);
        return { count, solution: grid ? { values: grid, notes: new Array(grid.length).fill(0) } : null };
    },

    initialState: (puzzle) => ({ values: new Array(puzzle.clues.length).fill(0), notes: new Array(puzzle.clues.length).fill(0) }),

    applyInput(puzzle, state, input) {
        if (!input || (input.type !== 'set' && input.type !== 'note')) return state;
        const { cell, value } = input;
        if (!Number.isInteger(cell) || cell < 0 || cell >= puzzle.clues.length || puzzle.clues[cell]) return state;
        if (!Number.isInteger(value) || value < 0 || value > 9) return state;
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
        // 書いた数字は、同じ続き（よこ・たて）のメモから外す
        if (value) {
            const { runs, cellRuns } = layout(puzzle);
            for (const r of cellRuns[cell]) if (r >= 0) runs[r].cells.forEach(other => { notes[other] &= ~(1 << value); });
        }
        return { values, notes };
    },

    // 解けたか（白いマスがすべて埋まり、どの続きも和が合い、同じ数字がない）と、まちがいの見える書いたマス
    // （同じ続きに同じ数字がある・埋まった続きの和が合わない・埋まりきらない続きの和がもう超えている）
    check(puzzle, state) {
        if (!validPuzzle(puzzle) || !validState(puzzle, state)) return { solved: false, errors: [] };
        const { runs, whites } = layout(puzzle);
        const errors = new Set();
        let solved = whites.every(cell => state.values[cell]);
        for (const run of runs) {
            const digits = run.cells.map(cell => state.values[cell]).filter(Boolean);
            const sum = digits.reduce((a, b) => a + b, 0);
            const full = digits.length === run.cells.length;
            const clash = new Set(digits).size !== digits.length;
            if (clash || (full && sum !== run.sum) || (!full && sum >= run.sum)) {
                run.cells.forEach(cell => { if (state.values[cell]) errors.add(cell); });
                solved = false;
            }
        }
        return { solved, errors: [...errors].sort((a, b) => a - b) };
    },

    // 次の一手：まちがった数字があれば消す。なければ、和の組み合わせから一つに決まるマスを示す（決まらなければ答えを1つ示す）
    hint(puzzle, state) {
        if (!validPuzzle(puzzle) || !validState(puzzle, state) || kakuro.check(puzzle, state).solved) return null;
        const answer = solutionGrid(puzzle);
        if (!answer) return null;
        const { whites, runs, cellRuns } = layout(puzzle);
        const wrong = whites.find(cell => state.values[cell] && state.values[cell] !== answer[cell]);
        if (wrong !== undefined) {
            return { input: { type: 'set', cell: wrong, value: 0 }, cells: [wrong], message: 'この数字はちがいます。消しましょう' };
        }
        const values = whites.reduce((grid, cell) => { grid[cell] = state.values[cell]; return grid; }, new Array(puzzle.clues.length).fill(0));
        const cand = initialCandidates(puzzle, values);
        narrow(puzzle, values, cand);
        const show = (cell, value, message) => ({ input: { type: 'set', cell, value }, cells: [cell], message });
        const step = findPlacement(puzzle, values, cand);
        if (step?.kind === 'naked') {
            const names = cellRuns[step.cell].filter(r => r >= 0).map(r => runName(runs[r])).join('と');
            return show(step.cell, step.value, `${names}の組み合わせから、このマスは ${step.value} だけです`);
        }
        if (step) return show(step.cell, step.value, `${runName(step.run)}には ${step.value} が必ず入り、入れるのはこのマスだけです`);
        let best = -1;
        whites.forEach(cell => { if (!values[cell] && (best < 0 || bitCount(cand[cell]) < bitCount(cand[best]))) best = cell; });
        return show(best, answer[best], `${cellName(puzzle, best)}は ${answer[best]} です`);
    },

    // 試験用：でたらめな1手
    randomInput(puzzle, state, random) {
        const cell = randomInt(random, puzzle.clues.length);
        if (random() < 0.2) return { type: 'note', cell, value: 1 + randomInt(random, 9) };
        return { type: 'set', cell, value: randomInt(random, 10) };
    },

    render
};

export default kakuro;
