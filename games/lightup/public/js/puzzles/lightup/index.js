/**
 * ライトアップ（美術館）
 * 問題・状態・入力の形は logic.js の先頭。やさしい・ふつうは理屈だけで解ける問題、むずかしいは解が1つの問題を作る
 * ヒントは、まちがった印を消す → 数字や照らし方の理屈で決まるマス → 置くと矛盾するマス → 答えの明かり、の順に出す
 */

import { generate, countSolutions, propagate, shapeOf, litCells, WHITE, EMPTY, LIGHT, DOT, SIZES } from './logic.js';
import { render } from './render.js';
import { randomInt } from '../../random.js';

// 答えの明かりのマス。ヒントで何度も使うので、問題ごとに覚えておく
const solutionCache = new Map();
function solutionLights(puzzle) {
    const key = JSON.stringify(puzzle);
    if (!solutionCache.has(key)) {
        if (solutionCache.size > 20) solutionCache.delete(solutionCache.keys().next().value);
        solutionCache.set(key, new Set(countSolutions(puzzle, 1).lights ?? []));
    }
    return solutionCache.get(key);
}

const validPuzzle = (puzzle) => Array.isArray(puzzle?.grid) && puzzle.grid.length === puzzle.width * puzzle.height;
const validState = (puzzle, state) => Array.isArray(state?.cells) && state.cells.length === puzzle.width * puzzle.height
    && state.cells.every(v => v === EMPTY || v === LIGHT || v === DOT);

const lightup = {
    id: 'lightup',
    name: 'ライトアップ',
    rules: [
        '白いマスに明かりを置いて、盤面のすべての白いマスを照らしましょう。明かりは、たて・よこに、黒いマスか盤面の端まで照らします。',
        '明かりどうしが照らし合ってはいけません。黒いマスの数字は、その上下左右に置く明かりの数です（数字のない黒いマスのまわりは、いくつでもかまいません）。'
    ],
    controls: '白いマスを押すと、明かり →「・」（明かりを置かない印）→ 空、の順に変わります。なぞると「・」をまとめて付けられます。',
    difficulties: { easy: `${SIZES.easy}×${SIZES.easy}`, normal: `${SIZES.normal}×${SIZES.normal}`, hard: `${SIZES.hard}×${SIZES.hard}` },
    // CPU が1手（ヒント1つ分：数字1つや白マス1つの理屈）にかける秒数の目安（ふつうの強さ）
    cpuSecondsPerStep: 4,

    generate,

    solve(puzzle, limit = 2) {
        const { count, lights } = countSolutions(puzzle, limit);
        if (!lights) return { count, solution: null };
        const on = new Set(lights);
        return { count, solution: { cells: puzzle.grid.map((value, cell) => (value !== WHITE ? EMPTY : on.has(cell) ? LIGHT : DOT)) } };
    },

    initialState: (puzzle) => ({ cells: new Array(puzzle.width * puzzle.height).fill(EMPTY) }),

    applyInput(puzzle, state, input) {
        if (!input || !Array.isArray(input.cells) || !input.cells.length || ![EMPTY, LIGHT, DOT].includes(input.value)) return state;
        // 黒マスは空にする（おかしな状態を直す）ときだけ受け付ける
        if (!input.cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < puzzle.grid.length && (puzzle.grid[cell] === WHITE || input.value === EMPTY))) return state;
        if (input.cells.every(cell => state.cells[cell] === input.value)) return state;
        const cells = state.cells.slice();
        input.cells.forEach(cell => { cells[cell] = input.value; });
        return { cells };
    },

    // 解けたか（白マスがすべて照らされ、明かりが照らし合わず、数字が合う）と、まちがいのマス（照らし合う明かり・明かりが多すぎる数字）
    check(puzzle, state) {
        if (!validPuzzle(puzzle) || !validState(puzzle, state)) return { solved: false, errors: [] };
        const { whites, numbered, seen, around } = shapeOf(puzzle);
        const isLight = cell => state.cells[cell] === LIGHT;
        const errors = [];
        let solved = state.cells.every((value, cell) => puzzle.grid[cell] === WHITE || value === EMPTY);
        for (const cell of whites) {
            if (isLight(cell) && seen[cell].some(isLight)) errors.push(cell);
        }
        for (const wall of numbered) {
            const lights = around[wall].filter(isLight).length;
            if (lights > puzzle.grid[wall]) errors.push(wall);
            if (lights !== puzzle.grid[wall]) solved = false;
        }
        const lit = litCells(puzzle, isLight);
        if (errors.length || whites.some(cell => !lit[cell])) solved = false;
        return { solved, errors };
    },

    // 次の一手
    hint(puzzle, state) {
        if (!validPuzzle(puzzle) || !validState(puzzle, state) || lightup.check(puzzle, state).solved) return null;
        const answer = solutionLights(puzzle);
        const { whites, numbered, seen, around } = shapeOf(puzzle);
        const wrong = state.cells.map((value, cell) => cell).filter(cell => (puzzle.grid[cell] !== WHITE && state.cells[cell] !== EMPTY)
            || (state.cells[cell] === LIGHT && !answer.has(cell)) || (state.cells[cell] === DOT && answer.has(cell)));
        if (wrong.length) return { input: { cells: wrong, value: EMPTY }, cells: wrong, message: 'まちがった印があります。消しましょう' };

        const lit = litCells(puzzle, cell => state.cells[cell] === LIGHT);
        // まだ置ける（明かりも・もなく、照らされていない）白マス
        const open = cell => state.cells[cell] === EMPTY && !lit[cell];
        const place = (cells, value, message, extra = []) => ({ input: { cells, value }, cells: [...extra, ...cells], message });

        for (const wall of numbered) {
            const lights = around[wall].filter(cell => state.cells[cell] === LIGHT).length;
            const free = around[wall].filter(open);
            if (free.length && lights + free.length === puzzle.grid[wall]) {
                return place(free, LIGHT, `数字の ${puzzle.grid[wall]}：置けるマスがちょうどその数なので、すべて明かりです`, [wall]);
            }
        }
        for (const cell of whites) {
            if (lit[cell]) continue;
            const can = [cell, ...seen[cell]].filter(open);
            if (can.length === 1) return place(can, LIGHT, 'このマスを照らせる場所は1つだけです', can[0] === cell ? [] : [cell]);
        }
        for (const wall of numbered) {
            const lights = around[wall].filter(cell => state.cells[cell] === LIGHT).length;
            const free = around[wall].filter(open);
            if (free.length && lights === puzzle.grid[wall]) {
                return place(free, DOT, `数字の ${puzzle.grid[wall]}：明かりはそろっています。残りのマスには置けません`, [wall]);
            }
        }
        // 置いてみると矛盾するマス（どこかが照らせなくなる・数字が合わなくなる）
        const known = new Int8Array(puzzle.grid.length).fill(-1);
        whites.forEach(cell => {
            if (state.cells[cell] === LIGHT) known[cell] = 1;
            else if (state.cells[cell] === DOT || lit[cell]) known[cell] = 0;
        });
        for (const cell of whites) {
            if (!open(cell) || answer.has(cell)) continue;
            const trial = known.slice();
            trial[cell] = 1;
            if (!propagate(puzzle, trial)) return place([cell], DOT, 'ここに明かりを置くと、あとで矛盾します');
        }
        const next = whites.find(cell => answer.has(cell) && state.cells[cell] !== LIGHT);
        if (next === undefined) return null;
        return place([next], LIGHT, 'ここに明かりが入ります');
    },

    // 試験用：でたらめな1手
    randomInput(puzzle, state, random) {
        return { cells: [randomInt(random, puzzle.width * puzzle.height)], value: randomInt(random, 3) };
    },

    render
};

export default lightup;
