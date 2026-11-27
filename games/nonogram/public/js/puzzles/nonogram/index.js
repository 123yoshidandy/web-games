/**
 * お絵かきロジック（ノノグラム）
 * 問題・状態・入力の形は logic.js の先頭。行の解き方だけで全部決まる問題だけを作るので、解は1つで、ヒントは行か列1本ずつの理屈になる
 */

import { generate, countSolutions, linesOf, solveLine, propagate, runsOf, FILLED, CROSS, EMPTY, SIZES } from './logic.js';
import { render } from './render.js';
import { randomInt } from '../../random.js';

const lineName = (line) => (line.kind === 'row' ? `上から${line.index + 1}行目` : `左から${line.index + 1}列目`);

// 答え（-1・0・1 の盤面）。ヒントで何度も使うので、問題ごとに覚えておく
const solutionCache = new Map();
function solutionGrid(puzzle) {
    const key = JSON.stringify(puzzle);
    if (!solutionCache.has(key)) {
        const grid = new Array(puzzle.width * puzzle.height).fill(-1);
        propagate(puzzle, grid);
        if (grid.includes(-1)) grid.splice(0, grid.length, ...countSolutions(puzzle, 1).grid);
        if (solutionCache.size > 20) solutionCache.delete(solutionCache.keys().next().value);
        solutionCache.set(key, grid);
    }
    return solutionCache.get(key);
}

const validState = (puzzle, state) => Array.isArray(state?.cells) && state.cells.length === puzzle.width * puzzle.height
    && state.cells.every(v => v === EMPTY || v === FILLED || v === CROSS);

const nonogram = {
    id: 'nonogram',
    name: 'お絵かきロジック',
    rules: [
        '盤面の外の数字は、その行・列に続けて塗るマスの数です。「3 1」なら、3マス続けて塗り、1マス以上あけて1マス塗ります。',
        '数字のとおりに塗って、絵を完成させましょう。塗らないとわかったマスには × を付けておけます。'
    ],
    controls: '下の「塗る」「×」で付けるものを選び、マスを押すかなぞります。同じ印のマスを押すと消えます。',
    difficulties: { easy: `${SIZES.easy}×${SIZES.easy}`, normal: `${SIZES.normal}×${SIZES.normal}`, hard: `${SIZES.hard}×${SIZES.hard}` },
    // CPU が1手（ヒント1つ分：行か列1本の理屈）にかける秒数の目安（ふつうの強さ）
    cpuSecondsPerStep: 3,

    generate,

    solve(puzzle, limit = 2) {
        const { count, grid } = countSolutions(puzzle, limit);
        return { count, solution: grid ? { cells: grid.map(v => (v === 1 ? FILLED : CROSS)) } : null };
    },

    initialState: (puzzle) => ({ cells: new Array(puzzle.width * puzzle.height).fill(EMPTY) }),

    applyInput(puzzle, state, input) {
        const size = puzzle.width * puzzle.height;
        if (!input || !Array.isArray(input.cells) || ![EMPTY, FILLED, CROSS].includes(input.value)) return state;
        if (!input.cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < size)) return state;
        if (input.cells.every(cell => state.cells[cell] === input.value)) return state;
        const cells = state.cells.slice();
        input.cells.forEach(cell => { cells[cell] = input.value; });
        return { cells };
    },

    // 解けたか（塗ったマスが、どの行・列の数字とも合うか）と、数字に合わなくなった行・列
    check(puzzle, state) {
        if (!validState(puzzle, state)) return { solved: false, errors: [] };
        const errors = [];
        let solved = true;
        for (const line of linesOf(puzzle)) {
            const values = line.cells.map(cell => state.cells[cell]);
            const runs = runsOf(values.map(v => (v === FILLED ? 1 : 0)));
            if (runs.length !== line.clue.length || runs.some((run, i) => run !== line.clue[i])) solved = false;
            const known = values.map(v => (v === FILLED ? 1 : v === CROSS ? 0 : -1));
            if (!solveLine(line.clue, known)) errors.push({ kind: line.kind, index: line.index });
        }
        return { solved, errors };
    },

    // 次の一手：まちがった印があれば消す。なければ、今の印から数字だけで決まるマスがある行・列を1本選ぶ
    hint(puzzle, state) {
        if (!validState(puzzle, state) || nonogram.check(puzzle, state).solved) return null;
        const answer = solutionGrid(puzzle);
        const wrong = [];
        state.cells.forEach((value, cell) => {
            if ((value === FILLED && answer[cell] !== 1) || (value === CROSS && answer[cell] === 1)) wrong.push(cell);
        });
        if (wrong.length) return { input: { cells: wrong, value: EMPTY }, cells: wrong, message: 'まちがった印があります。消しましょう' };

        let crossHint = null;
        for (const line of linesOf(puzzle)) {
            const known = line.cells.map(cell => (state.cells[cell] === FILLED ? 1 : state.cells[cell] === CROSS ? 0 : -1));
            const next = solveLine(line.clue, known);
            const fills = line.cells.filter((cell, i) => known[i] === -1 && next[i] === 1);
            if (fills.length) return { input: { cells: fills, value: FILLED }, cells: fills, message: `${lineName(line)}：数字から、塗るマスが決まります` };
            const crosses = line.cells.filter((cell, i) => known[i] === -1 && next[i] === 0);
            if (crosses.length && !crossHint) {
                crossHint = { input: { cells: crosses, value: CROSS }, cells: crosses, message: `${lineName(line)}：数字から、塗らないマスが決まります` };
            }
        }
        return crossHint;
    },

    // 試験用：でたらめな1手
    randomInput(puzzle, state, random) {
        return { cells: [randomInt(random, puzzle.width * puzzle.height)], value: randomInt(random, 3) };
    },

    render
};

export default nonogram;
