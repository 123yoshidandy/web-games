/**
 * ぬりかべ
 * 問題・状態・入力の形は logic.js の先頭。理屈だけで解ける問題だけを使うので、解は1つで、ヒントも理屈で決まるマスを示せる
 * やさしいは 5×5、ふつうは 7×7、むずかしいは 9×9（仮に置いて矛盾を探す理屈が要る）
 */

import { generate, countSolutions, deduce, isSolution, neighborsOf, validPuzzle, EMPTY, WALL, DOT, SPECS } from './logic.js';
import { render } from './render.js';
import { randomInt } from '../../random.js';

// 解き方の中の値（logic.js と同じ）：-1 未定・0 島・1 壁
const UNKNOWN = -1;
const ISLAND = 0;
const BLACK = 1;

// 答え（0・1 の盤）。ヒントで何度も使うので、問題ごとに覚えておく
const solutionCache = new Map();
function solutionGrid(puzzle) {
    const key = JSON.stringify(puzzle);
    if (!solutionCache.has(key)) {
        if (solutionCache.size > 20) solutionCache.delete(solutionCache.keys().next().value);
        solutionCache.set(key, countSolutions(puzzle, 1).grid);
    }
    return solutionCache.get(key);
}

const validState = (puzzle, state) => Array.isArray(state?.cells) && state.cells.length === puzzle.numbers.length
    && state.cells.every(v => v === EMPTY || v === WALL || v === DOT);

// 状態を解き方の盤にする（数字のマスと「・」は島、塗ったマスは壁、ほかは未定）
const gridOf = (puzzle, state) => state.cells.map((v, i) => (puzzle.numbers[i] || v === DOT ? ISLAND : v === WALL ? BLACK : UNKNOWN));

// 島（または壁）のつながり。member で選んだマスのまとまりと、となりの未定のマス
function groups(puzzle, grid, member) {
    const nb = neighborsOf(puzzle.width, puzzle.height);
    const seen = new Uint8Array(grid.length);
    const list = [];
    grid.forEach((v, start) => {
        if (seen[start] || !member(v)) return;
        const group = { cells: [], numbers: [], open: 0 };
        const stack = [start];
        seen[start] = 1;
        while (stack.length) {
            const cell = stack.pop();
            group.cells.push(cell);
            if (puzzle.numbers[cell]) group.numbers.push(cell);
            for (const next of nb[cell]) {
                if (grid[next] === UNKNOWN) group.open++;
                else if (!seen[next] && member(grid[next])) {
                    seen[next] = 1;
                    stack.push(next);
                }
            }
        }
        list.push(group);
    });
    return list;
}

const RULE_MESSAGES = {
    complete: '数字の大きさになった島のまわりは、壁です',
    between: '2つの数字の島にはさまれたマスは壁です（島になると、1つの島に数字が2つ入ってしまう）',
    square: '壁が 2×2 にかたまらないように、このマスは島です',
    'wall-exit': '壁はすべてつながります。このかたまりが外へ出られるのは、このマスだけです',
    unreachable: 'どの数字の島からも届かないマスは、壁です',
    'count-island': '壁の数がそろったので、残りのマスは島です',
    'count-wall': '島の大きさの合計がそろうので、残りのマスは壁です'
};

function hintMessage(puzzle, step) {
    if (step.rule === 'island-exit') {
        return step.number !== undefined ? `この島（${puzzle.numbers[step.number]}）が大きくなれるのは、このマスだけです` : '「・」のマスが数字の島につながるには、このマスを通るしかありません';
    }
    if (step.rule === 'trial') return step.value === BLACK ? 'このマスを島にすると、どこかで行き詰まります。壁です' : 'このマスを壁にすると、どこかで行き詰まります。島（・）です';
    if (step.rule === 'count') return RULE_MESSAGES[step.value === ISLAND ? 'count-island' : 'count-wall'];
    return RULE_MESSAGES[step.rule];
}

const sizeLabel = (difficulty) => `${SPECS[difficulty].size}×${SPECS[difficulty].size}`;

const nurikabe = {
    id: 'nurikabe',
    name: 'ぬりかべ',
    rules: [
        'マスを塗って壁にし、残りのマスで島を作りましょう。数字のマスは、その数と同じ大きさの島に1つずつ入ります。数字のない島や、数字が2つある島は作れません。',
        '壁はすべてたて・よこにつながり、2×2 にかたまってはいけません。'
    ],
    controls: '下の「塗る」「・」で付けるものを選び、マスを押すかなぞります。同じ印のマスを押すと消えます。島とわかったマスには「・」を付けておけます。',
    difficulties: { easy: sizeLabel('easy'), normal: sizeLabel('normal'), hard: `${sizeLabel('hard')}（仮に置いて考える）` },
    // CPU が1手（ヒント1つ分：1つの理屈で決まるマス）にかける秒数の目安（ふつうの強さ）
    cpuSecondsPerStep: 4,

    generate,

    solve(puzzle, limit = 2) {
        const { count, grid } = countSolutions(puzzle, limit);
        return { count, solution: grid ? { cells: grid.map((v, i) => (puzzle.numbers[i] ? EMPTY : v === BLACK ? WALL : DOT)) } : null };
    },

    initialState: (puzzle) => ({ cells: new Array(puzzle.numbers.length).fill(EMPTY) }),

    applyInput(puzzle, state, input) {
        if (!input || !Array.isArray(input.cells) || !input.cells.length || ![EMPTY, WALL, DOT].includes(input.value)) return state;
        if (!input.cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < puzzle.numbers.length && (!puzzle.numbers[cell] || input.value === EMPTY))) return state;
        if (input.cells.every(cell => state.cells[cell] === input.value)) return state;
        const cells = state.cells.slice();
        input.cells.forEach(cell => { cells[cell] = input.value; });
        return { cells };
    },

    // 解けたか（塗ったマスを壁、ほかを島として、決まりをすべて満たす）と、まちがいの見えるマス
    // （2×2 の壁・数字が2つの島・大きすぎる島・閉じたのに小さい島・閉じた数字のない島・閉じこめられた壁）
    check(puzzle, state) {
        if (!validPuzzle(puzzle) || !validState(puzzle, state)) return { solved: false, errors: [] };
        const { width, numbers } = puzzle;
        const grid = gridOf(puzzle, state);
        const errors = new Set();
        for (let cell = 0; cell < grid.length; cell++) {
            if (cell % width === width - 1 || cell + width >= grid.length) continue;
            const square = [cell, cell + 1, cell + width, cell + width + 1];
            if (square.every(c => grid[c] === BLACK)) square.forEach(c => errors.add(c));
        }
        for (const group of groups(puzzle, grid, v => v === ISLAND)) {
            const size = group.numbers.length === 1 ? numbers[group.numbers[0]] : 0;
            const wrong = group.numbers.length > 1 || (size && group.cells.length > size) || (!group.open && (!size || group.cells.length < size));
            if (wrong) group.cells.forEach(c => errors.add(c));
        }
        const walls = groups(puzzle, grid, v => v === BLACK);
        if (walls.length > 1) walls.filter(group => !group.open).forEach(group => group.cells.forEach(c => errors.add(c)));
        const solved = isSolution(puzzle, grid.map(v => (v === UNKNOWN ? ISLAND : v)));
        return { solved, errors: [...errors].sort((a, b) => a - b) };
    },

    // 次の一手：まちがった印があれば消す。なければ、理屈で決まるマスを示す（決まらなければ答えを1つ示す）
    hint(puzzle, state) {
        if (!validPuzzle(puzzle) || !validState(puzzle, state) || nurikabe.check(puzzle, state).solved) return null;
        const answer = solutionGrid(puzzle);
        if (!answer) return null;
        const wrong = [];
        state.cells.forEach((v, cell) => {
            if (puzzle.numbers[cell] ? v !== EMPTY : (v === WALL && answer[cell] !== BLACK) || (v === DOT && answer[cell] !== ISLAND)) wrong.push(cell);
        });
        if (wrong.length) return { input: { cells: wrong, value: EMPTY }, cells: wrong, message: 'まちがった印があります。消しましょう' };
        const grid = gridOf(puzzle, state);
        const step = deduce(puzzle, grid, { trial: true });
        if (step) {
            const cells = step.cells;
            return { input: { cells, value: step.value === BLACK ? WALL : DOT }, cells, message: hintMessage(puzzle, step) };
        }
        const cell = grid.findIndex((v, i) => v === UNKNOWN && answer[i] === BLACK);
        const target = cell >= 0 ? cell : grid.indexOf(UNKNOWN);
        const value = answer[target] === BLACK ? WALL : DOT;
        return { input: { cells: [target], value }, cells: [target], message: value === WALL ? 'このマスは壁です' : 'このマスは島（・）です' };
    },

    // 試験用：でたらめな1手
    randomInput(puzzle, state, random) {
        return { cells: [randomInt(random, puzzle.numbers.length)], value: randomInt(random, 3) };
    },

    render
};

export default nurikabe;
