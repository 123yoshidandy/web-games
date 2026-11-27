/**
 * テント
 * 問題・状態・入力の形は logic.js の先頭。やさしい・ふつうは理屈だけで解ける問題、むずかしいは解が1つで、試しが要る問題を作る
 * ヒントは、まちがった印を消す → 行・列の数や木の理屈で決まるテント → 置けないとわかるマス → 置くと矛盾するマス → 答えのテント、の順に出す
 */

import { generate, countSolutions, propagate, blankValues, shapeOf, canPair, EMPTY, TENT, GRASS, SIZES } from './logic.js';
import { render } from './render.js';
import { randomInt } from '../../random.js';

const lineName = (line) => (line.kind === 'row' ? `上から${line.index + 1}行目` : `左から${line.index + 1}列目`);

// 答えのテントのマス。ヒントで何度も使うので、問題ごとに覚えておく
const solutionCache = new Map();
function solutionTents(puzzle) {
    const key = JSON.stringify(puzzle);
    if (!solutionCache.has(key)) {
        if (solutionCache.size > 20) solutionCache.delete(solutionCache.keys().next().value);
        solutionCache.set(key, new Set(countSolutions(puzzle, 1).tents ?? []));
    }
    return solutionCache.get(key);
}

const validState = (puzzle, state) => Array.isArray(state?.cells) && state.cells.length === puzzle.width * puzzle.height
    && state.cells.every(v => v === EMPTY || v === TENT || v === GRASS);

const tents = {
    id: 'tents',
    name: 'テント',
    rules: [
        '木のとなり（上下左右）にテントを張りましょう。木とテントは1つずつ組になり、どの木にも、となりに自分のテントが1つあります。',
        'テントどうしは、ななめも含めて、となり合いません。盤面の外の数字は、その行・列にあるテントの数です。'
    ],
    controls: 'マスを押すと、テント → 芝生（テントを置かない印）→ 空、の順に変わります。なぞると芝生をまとめて付けられます。',
    difficulties: { easy: `${SIZES.easy}×${SIZES.easy}`, normal: `${SIZES.normal}×${SIZES.normal}`, hard: `${SIZES.hard}×${SIZES.hard}` },
    // CPU が1手（ヒント1つ分：行・列1本や木1本の理屈）にかける秒数の目安（ふつうの強さ）
    cpuSecondsPerStep: 10,

    generate,

    solve(puzzle, limit = 2) {
        const { count, tents: list } = countSolutions(puzzle, limit);
        if (!list) return { count, solution: null };
        const on = new Set(list);
        const { isTree } = shapeOf(puzzle);
        return { count, solution: { cells: Array.from({ length: puzzle.width * puzzle.height }, (_, cell) => (isTree[cell] ? EMPTY : on.has(cell) ? TENT : GRASS)) } };
    },

    initialState: (puzzle) => ({ cells: new Array(puzzle.width * puzzle.height).fill(EMPTY) }),

    applyInput(puzzle, state, input) {
        if (!input || !Array.isArray(input.cells) || !input.cells.length || ![EMPTY, TENT, GRASS].includes(input.value)) return state;
        const { isTree } = shapeOf(puzzle);
        // 木のマスは空にする（おかしな状態を直す）ときだけ受け付ける
        if (!input.cells.every(cell => Number.isInteger(cell) && cell >= 0 && cell < isTree.length && (!isTree[cell] || input.value === EMPTY))) return state;
        if (input.cells.every(cell => state.cells[cell] === input.value)) return state;
        const cells = state.cells.slice();
        input.cells.forEach(cell => { cells[cell] = input.value; });
        return { cells };
    },

    // 解けたか（数が合い、テントがとなり合わず、木と1つずつ組にできる）と、まちがい（となり合うテントのマス・テントが多すぎる行と列）
    check(puzzle, state) {
        if (!validState(puzzle, state)) return { solved: false, errors: [] };
        const { isTree, ring, lines } = shapeOf(puzzle);
        const isTent = cell => state.cells[cell] === TENT;
        const errors = [];
        let solved = true;
        state.cells.forEach((value, cell) => {
            if (value !== TENT) return;
            if (isTree[cell] || ring[cell].some(isTent)) errors.push(cell);
        });
        for (const line of lines) {
            const count = line.cells.filter(isTent).length;
            if (count > line.need) errors.push({ kind: line.kind, index: line.index });
            if (count !== line.need) solved = false;
        }
        if (errors.length || !canPair(puzzle, isTent)) solved = false;
        return { solved, errors };
    },

    // 次の一手
    hint(puzzle, state) {
        if (!validState(puzzle, state) || tents.check(puzzle, state).solved) return null;
        const answer = solutionTents(puzzle);
        const { isTree, ring, sides, candidate, lines } = shapeOf(puzzle);
        const wrong = state.cells.map((value, cell) => cell).filter(cell => (isTree[cell] && state.cells[cell] !== EMPTY)
            || (state.cells[cell] === TENT && !answer.has(cell)) || (state.cells[cell] === GRASS && answer.has(cell)));
        if (wrong.length) return { input: { cells: wrong, value: EMPTY }, cells: wrong, message: 'まちがった印があります。消しましょう' };

        const place = (cells, value, message, extra = []) => ({ input: { cells, value }, cells: [...extra, ...cells], message });
        const isTent = cell => state.cells[cell] === TENT;
        // テントを置けないとすぐわかるマス：木・となりに木がない・テントのまわり・テントがそろった行と列
        const nearTent = new Uint8Array(state.cells.length);
        state.cells.forEach((value, cell) => { if (value === TENT) ring[cell].forEach(s => { nearTent[s] = 1; }); });
        const fullLine = new Uint8Array(state.cells.length);
        for (const line of lines) {
            if (line.cells.filter(isTent).length === line.need) line.cells.forEach(cell => { fullLine[cell] = 1; });
        }
        const blocked = cell => !candidate[cell] || nearTent[cell] || (fullLine[cell] && !isTent(cell));
        const open = cell => state.cells[cell] === EMPTY && !blocked(cell);

        for (const line of lines) {
            const have = line.cells.filter(isTent).length;
            const free = line.cells.filter(open);
            if (free.length && have + free.length === line.need) {
                return place(free, TENT, `${lineName(line)}：テントを置けるマスが、ちょうど残りの数だけです`);
            }
        }
        for (const tree of puzzle.trees) {
            const spots = sides[tree].filter(cell => isTent(cell) || open(cell));
            if (spots.length === 1 && !isTent(spots[0])) return place(spots, TENT, 'この木のテントを張れる場所は、ここだけです', [tree]);
        }
        const empty = state.cells.map((value, cell) => cell).filter(cell => state.cells[cell] === EMPTY && !isTree[cell]);
        const near = empty.filter(cell => nearTent[cell]);
        if (near.length) return place(near, GRASS, 'テントのまわり（ななめも）には、テントを置けません');
        const full = empty.filter(cell => fullLine[cell]);
        if (full.length) return place(full, GRASS, 'テントがそろった行・列の残りには、テントを置けません');
        const lonely = empty.filter(cell => !candidate[cell]);
        if (lonely.length) return place(lonely, GRASS, 'となりに木がないマスには、テントを置けません');
        // 置いてみると矛盾するマス
        const known = blankValues(puzzle);
        state.cells.forEach((value, cell) => {
            if (value === TENT) known[cell] = 1;
            else if (value === GRASS) known[cell] = 0;
        });
        for (const cell of empty) {
            if (answer.has(cell)) continue;
            const trial = known.slice();
            trial[cell] = 1;
            if (!propagate(puzzle, trial)) return place([cell], GRASS, 'ここにテントを置くと、あとで矛盾します');
        }
        const next = [...answer].find(cell => !isTent(cell));
        if (next === undefined) return null;
        return place([next], TENT, 'ここにテントが入ります');
    },

    // 試験用：でたらめな1手
    randomInput(puzzle, state, random) {
        return { cells: [randomInt(random, puzzle.width * puzzle.height)], value: randomInt(random, 3) };
    },

    render
};

export default tents;
