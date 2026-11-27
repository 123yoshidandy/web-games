/**
 * 橋をかけろ
 * 問題・状態・入力の形は logic.js の先頭。解が1つの問題だけを作る
 * ヒントは、多すぎる橋を直す手を先に出し、次に島の数字から決まる橋を示す。理屈で決まらなければ、答えの橋を1つ示す
 */

import { generate, countSolutions, edgesOf, edgeBetween, propagate, initialBounds, SIZES } from './logic.js';
import { render } from './render.js';
import { randomInt } from '../../random.js';

const solutionCache = new Map();
function answerOf(puzzle) {
    const key = JSON.stringify(puzzle);
    if (!solutionCache.has(key)) {
        if (solutionCache.size > 20) solutionCache.delete(solutionCache.keys().next().value);
        solutionCache.set(key, countSolutions(puzzle, 1).solution);
    }
    return solutionCache.get(key);
}

const validState = (puzzle, state) => Array.isArray(state?.bridges) && state.bridges.length === edgesOf(puzzle).edges.length
    && state.bridges.every(n => Number.isInteger(n) && n >= 0 && n <= 2);

// 光らせるマス：両端の島と、その間
const edgeCells = (puzzle, e) => {
    const edge = edgesOf(puzzle).edges[e];
    return [puzzle.islands[edge.a][0], ...edge.cells, puzzle.islands[edge.b][0]];
};

const bridgeInput = (puzzle, e, count) => {
    const { a, b } = edgesOf(puzzle).edges[e];
    return { type: 'bridge', a, b, count };
};

const hashi = {
    id: 'hashi',
    name: '橋をかけろ',
    rules: [
        '丸い島どうしを、たて・よこにまっすぐな橋でつなぎましょう。島の数字は、その島から出る橋の本数です。',
        '同じ2つの島の間にかけられる橋は2本まで。橋は交わったり、島を飛び越えたりできません。',
        'すべての島が橋で1つにつながると完成です。'
    ],
    controls: '島から、となりの島の方へ指をすべらせると橋をかけます。同じ所をもう一度なぞるか、橋を押すと、1本→2本→なしと変わります。',
    difficulties: { easy: `${SIZES.easy}×${SIZES.easy}`, normal: `${SIZES.normal}×${SIZES.normal}`, hard: `${SIZES.hard}×${SIZES.hard}` },
    // CPU が1手（ヒント1つ分：橋1か所）にかける秒数の目安（ふつうの強さ）
    cpuSecondsPerStep: 6,

    generate,

    solve(puzzle, limit = 2) {
        const { count, solution } = countSolutions(puzzle, limit);
        return { count, solution: solution ? { bridges: solution } : null };
    },

    initialState: (puzzle) => ({ bridges: edgesOf(puzzle).edges.map(() => 0) }),

    applyInput(puzzle, state, input) {
        if (!input || input.type !== 'bridge' || !validState(puzzle, state)) return state;
        const { a, b, count } = input;
        if (!Number.isInteger(a) || !Number.isInteger(b) || !Number.isInteger(count) || count < 0 || count > 2) return state;
        const e = edgeBetween(puzzle, a, b);
        if (e < 0 || state.bridges[e] === count) return state;
        // ほかの橋と交わるなら、かけない
        if (count > 0 && edgesOf(puzzle).edges[e].crosses.some(f => state.bridges[f] > 0)) return state;
        const bridges = state.bridges.slice();
        bridges[e] = count;
        return { bridges };
    },

    // 解けたか（どの島も数字どおりの本数で、交わりがなく、すべてつながる）と、まちがっている島の番号（本数が多すぎる・交わる橋がある）
    check(puzzle, state) {
        if (!validState(puzzle, state)) return { solved: false, errors: [] };
        const { edges, incident } = edgesOf(puzzle);
        const wrong = new Set();
        edges.forEach((edge, e) => {
            if (state.bridges[e] > 0 && edge.crosses.some(f => state.bridges[f] > 0)) {
                wrong.add(edge.a);
                wrong.add(edge.b);
            }
        });
        let exact = true;
        puzzle.islands.forEach(([, n], i) => {
            const degree = incident[i].reduce((sum, e) => sum + state.bridges[e], 0);
            if (degree > n) wrong.add(i);
            if (degree !== n) exact = false;
        });
        const errors = [...wrong].sort((x, y) => x - y);
        let solved = exact && !errors.length;
        if (solved) {
            const parent = puzzle.islands.map((_, i) => i);
            const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
            edges.forEach((edge, e) => { if (state.bridges[e] > 0) parent[find(edge.a)] = find(edge.b); });
            solved = puzzle.islands.every((_, i) => find(i) === find(0));
        }
        return { solved, errors };
    },

    // 次の一手：答えより多い橋があれば減らす。なければ、島の数字から決まる橋を示す。決まらなければ、答えの橋を1つ示す
    hint(puzzle, state) {
        if (!validState(puzzle, state) || hashi.check(puzzle, state).solved) return null;
        const answer = answerOf(puzzle);
        const graph = edgesOf(puzzle);
        const show = (e, count, message) => ({ input: bridgeInput(puzzle, e, count), cells: edgeCells(puzzle, e), message });
        for (let e = 0; e < answer.length; e++) {
            if (state.bridges[e] > answer[e]) {
                return show(e, answer[e], answer[e] ? 'この橋は多すぎます。1本にします' : 'この橋はかかりません。はずします');
            }
        }
        // 今かかっている橋は、どれも答えの一部。それを下限にして、島の数字から決まる本数を求める
        const { lo, hi } = initialBounds(puzzle, graph);
        state.bridges.forEach((n, e) => {
            lo[e] = n;
            hi[e] = Math.max(hi[e], n);
        });
        if (propagate(puzzle, graph, lo, hi)) {
            for (let e = 0; e < lo.length; e++) {
                if (lo[e] > state.bridges[e]) {
                    return show(e, lo[e], `島の数字と、まわりにかけられる橋の数から、ここには橋が${lo[e] === 2 ? '2本' : '少なくとも1本'}かかります`);
                }
            }
        }
        const e = answer.findIndex((n, i) => n > state.bridges[i]);
        if (e < 0) return null;
        return show(e, answer[e], `ここには橋が${answer[e]}本かかります`);
    },

    // 試験用：でたらめな1手（どこかの所の橋を 0〜2 本にする）
    randomInput(puzzle, state, random) {
        const { edges } = edgesOf(puzzle);
        const { a, b } = edges[randomInt(random, edges.length)];
        return { type: 'bridge', a, b, count: randomInt(random, 3) };
    },

    render
};

export default hashi;
