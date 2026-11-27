/**
 * スリザーリンク
 * 問題・状態・入力の形は logic.js の先頭。輪をでたらめに作り、解が1つのまま外せる数字を外して作る
 * ヒントは、まちがった印を消す → 1つの決まり（数字・点・小さな輪）で決まる辺 → 1本ためすと行き詰まる辺 → 答えの辺、の順に出す
 * ヒントの cells（光らせるもの）は、マスではなく辺の番号
 */

import { generate, countSolutions, findDeduction, propagate, isSolution, geometryOf, LINE, CROSS, EMPTY, SIZES } from './logic.js';
import { render } from './render.js';
import { randomInt } from '../../random.js';

// 答え（辺ごとに 1 線・0 ×）。ヒントで何度も使うので、問題ごとに覚えておく
const solutionCache = new Map();
function solutionEdges(puzzle) {
    const key = JSON.stringify(puzzle);
    if (!solutionCache.has(key)) {
        if (solutionCache.size > 20) solutionCache.delete(solutionCache.keys().next().value);
        solutionCache.set(key, countSolutions(puzzle, 1).edges);
    }
    return solutionCache.get(key);
}

const validState = (puzzle, state) => Array.isArray(state?.edges) && state.edges.length === geometryOf(puzzle).edgeCount
    && state.edges.every(v => v === EMPTY || v === LINE || v === CROSS);

// 状態を、解くときの値（-1 未定・0 ×・1 線）にする
const toSolver = (state) => Int8Array.from(state.edges, v => (v === LINE ? 1 : v === CROSS ? 0 : -1));

const MESSAGES = {
    'cell-full': (clue) => (clue === 0 ? '0 のまわりには、線を引きません' : `${clue} のまわりには、もう線が ${clue} 本あります。残りの辺は × です`),
    'cell-need': (clue) => `${clue} のまわりは、残りの辺すべてに線が入ります`,
    'vertex-full': () => 'この点からは、もう線が2本出ています。ほかの辺は × です',
    'vertex-continue': () => '線の先は、ここへしか進めません',
    'vertex-dead': () => 'この点からは、ほかへ進む道がありません。この辺は × です',
    loop: () => 'ここをつなぐと、輪が閉じてしまいます（ほかに線が残るか、数字が合いません）。× です'
};

const slitherlink = {
    id: 'slitherlink',
    name: 'スリザーリンク',
    rules: [
        '点と点の間に線を引いて、1つの輪を作りましょう。輪は交わったり、枝分かれしたりできません。',
        'マスの数字は、そのマスのまわり4辺のうち、線を引く辺の数です。数字のないマスは、何本でもかまいません。',
        '線を引かないとわかった辺には × を付けておけます。'
    ],
    controls: '下の「線」「×」で付けるものを選び、辺を押すか、点から点へなぞります。同じ印の辺を押すと消えます。',
    difficulties: { easy: `${SIZES.easy}×${SIZES.easy}`, normal: `${SIZES.normal}×${SIZES.normal}`, hard: `${SIZES.hard}×${SIZES.hard}` },
    // CPU が1手（ヒント1つ分：1つの決まりで決まる辺）にかける秒数の目安（ふつうの強さ）
    cpuSecondsPerStep: 2,

    generate,

    solve(puzzle, limit = 2) {
        const { count, edges } = countSolutions(puzzle, limit);
        return { count, solution: edges ? { edges: edges.map(v => (v === 1 ? LINE : CROSS)) } : null };
    },

    initialState: (puzzle) => ({ edges: new Array(geometryOf(puzzle).edgeCount).fill(EMPTY) }),

    applyInput(puzzle, state, input) {
        const count = geometryOf(puzzle).edgeCount;
        if (!input || !Array.isArray(input.edges) || !input.edges.length || ![EMPTY, LINE, CROSS].includes(input.value)) return state;
        if (!input.edges.every(edge => Number.isInteger(edge) && edge >= 0 && edge < count)) return state;
        if (input.edges.every(edge => state.edges[edge] === input.value)) return state;
        const edges = state.edges.slice();
        input.edges.forEach(edge => { edges[edge] = input.value; });
        return { edges };
    },

    // 解けたか（線が1つの輪で、数字がすべて合う）と、ルールに合わない所（線が多すぎる数字・3本以上の線が出る点）
    check(puzzle, state) {
        if (!validState(puzzle, state)) return { solved: false, errors: [] };
        const geo = geometryOf(puzzle);
        const lines = state.edges.map(v => v === LINE);
        const errors = [];
        puzzle.clues.forEach((clue, cell) => {
            if (clue === null) return;
            if (geo.cellEdges[cell].filter(edge => lines[edge]).length > clue) errors.push({ kind: 'cell', index: cell });
        });
        geo.vertexEdges.forEach((edges, vertex) => {
            if (edges.filter(edge => lines[edge]).length > 2) errors.push({ kind: 'vertex', index: vertex });
        });
        return { solved: !errors.length && isSolution(puzzle, lines), errors };
    },

    hint(puzzle, state) {
        if (!validState(puzzle, state) || slitherlink.check(puzzle, state).solved) return null;
        const geo = geometryOf(puzzle);
        const answer = solutionEdges(puzzle);
        const wrong = [];
        state.edges.forEach((value, edge) => {
            if ((value === LINE && answer[edge] !== 1) || (value === CROSS && answer[edge] === 1)) wrong.push(edge);
        });
        if (wrong.length) return { input: { edges: wrong, value: EMPTY }, cells: wrong, message: 'まちがった印があります。消しましょう' };

        const e = toSolver(state);
        const found = findDeduction(geo, puzzle.clues, e, { preferLine: true });
        if (found && !found.contradiction) {
            const message = MESSAGES[found.rule](puzzle.clues[found.cell]);
            return { input: { edges: found.edges, value: found.value === 1 ? LINE : CROSS }, cells: found.edges, message };
        }

        // 1本ためす：線を引く（× にする）と行き詰まるなら、その逆。線の端の近くから調べる
        const unknown = [];
        for (let edge = 0; edge < geo.edgeCount; edge++) if (e[edge] < 0) unknown.push(edge);
        const nearEnd = (edge) => geo.edgeEnds[edge].some(v => geo.vertexEdges[v].some(x => e[x] === 1));
        unknown.sort((a, b) => Number(nearEnd(b)) - Number(nearEnd(a)));
        for (const edge of unknown) {
            for (const value of [1, 0]) {
                const trial = e.slice();
                trial[edge] = value;
                if (propagate(geo, puzzle.clues, trial)) continue;
                return value === 1
                    ? { input: { edges: [edge], value: CROSS }, cells: [edge], message: 'ここに線を引くと、先で行き詰まります。× です' }
                    : { input: { edges: [edge], value: LINE }, cells: [edge], message: 'ここを × にすると、先で行き詰まります。線が入ります' };
            }
        }
        const edge = unknown.find(x => answer[x] === 1) ?? unknown[0];
        return { input: { edges: [edge], value: answer[edge] === 1 ? LINE : CROSS }, cells: [edge], message: answer[edge] === 1 ? 'ここに線が通ります' : 'ここには線が通りません' };
    },

    // 試験用：でたらめな1手
    randomInput(puzzle, state, random) {
        return { edges: [randomInt(random, geometryOf(puzzle).edgeCount)], value: randomInt(random, 3) };
    },

    render
};

export default slitherlink;
