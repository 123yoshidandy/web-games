/**
 * ナンバーリンク
 * 問題・状態・入力の形は logic.js の先頭。すべてのマスを通るルールで、解が1つの問題だけを作る
 * ヒントは答えから、まちがった線を直すか、まだの数字の線を1本ずつ示す
 */

import { generate, countSolutions, endGrid, isAdjacent, SIZES } from './logic.js';
import { render } from './render.js';
import { randomInt } from '../../random.js';

const solutionCache = new Map();
function solutionPaths(puzzle) {
    const key = JSON.stringify(puzzle);
    if (!solutionCache.has(key)) {
        if (solutionCache.size > 20) solutionCache.delete(solutionCache.keys().next().value);
        solutionCache.set(key, countSolutions(puzzle, 1).paths);
    }
    return solutionCache.get(key);
}

// 線を、問題のルールに合う所まで切りそろえる（片方の数字から始まり、となりへ進み、ほかの数字と同じマスを通らない）
function trimPath(puzzle, pair, cells, owners) {
    const [a, b] = puzzle.ends[pair];
    if (!Array.isArray(cells) || !cells.length || (cells[0] !== a && cells[0] !== b)) return [];
    const size = puzzle.width * puzzle.height;
    const goal = cells[0] === a ? b : a;
    const path = [cells[0]];
    const seen = new Set(path);
    for (let i = 1; i < cells.length; i++) {
        const cell = cells[i];
        if (!Number.isInteger(cell) || cell < 0 || cell >= size || seen.has(cell)) break;
        if (!isAdjacent(puzzle.width, path[path.length - 1], cell)) break;
        if (owners[cell] >= 0 && owners[cell] !== pair) break;
        if (owners[cell] === pair && cell !== goal) break;
        path.push(cell);
        seen.add(cell);
        if (cell === goal) break;
    }
    return path.length > 1 ? path : [];
}

const validState = (puzzle, state) => Array.isArray(state?.paths) && state.paths.length === puzzle.ends.length
    && state.paths.every(path => Array.isArray(path) && path.every(Number.isInteger));

// 線がつながっているか（両方の数字を結んでいる）
const connected = (puzzle, pair, path) => {
    const [a, b] = puzzle.ends[pair];
    return path.length >= 2 && ((path[0] === a && path[path.length - 1] === b) || (path[0] === b && path[path.length - 1] === a));
};

// 答えの線と同じ向き（state の線と同じ数字から始まる向き）にそろえる
const oriented = (answer, start) => (answer[0] === start ? answer : answer.slice().reverse());

const numberlink = {
    id: 'numberlink',
    name: 'ナンバーリンク',
    rules: [
        '同じ数字どうしを、たて・よこの線でつなぎましょう。',
        '線は交わったり、枝分かれしたりできません。すべてのマスに線を通すと完成です。'
    ],
    controls: '数字から指でなぞって線を引きます。線の途中からなぞると、そこから引き直せます。数字を押すと、その線を消します。',
    difficulties: { easy: `${SIZES.easy}×${SIZES.easy}`, normal: `${SIZES.normal}×${SIZES.normal}`, hard: `${SIZES.hard}×${SIZES.hard}` },
    // CPU が1手（ヒント1つ分：線1本）にかける秒数の目安（ふつうの強さ）
    cpuSecondsPerStep: 13,

    generate,

    solve(puzzle, limit = 2) {
        const { count, paths } = countSolutions(puzzle, limit);
        return { count, solution: paths ? { paths } : null };
    },

    initialState: (puzzle) => ({ paths: puzzle.ends.map(() => []) }),

    applyInput(puzzle, state, input) {
        if (!input || !Number.isInteger(input.pair) || input.pair < 0 || input.pair >= puzzle.ends.length) return state;
        const owners = endGrid(puzzle);
        let path = [];
        if (input.type === 'path') path = trimPath(puzzle, input.pair, input.cells, owners);
        else if (input.type !== 'clear') return state;
        const before = state.paths[input.pair];
        if (before.length === path.length && before.every((cell, i) => cell === path[i])) return state;
        // ほかの線が新しい線と重なったら、重なる手前で切る（数字1つだけになったら消す）
        const taken = new Set(path);
        const paths = state.paths.map((other, p) => {
            if (p === input.pair) return path;
            const cut = other.findIndex(cell => taken.has(cell));
            if (cut < 0) return other;
            return cut >= 2 ? other.slice(0, cut) : [];
        });
        return { paths };
    },

    // 解けたか（すべての数字がつながり、すべてのマスを通っている）と、ルールに合わない線の番号
    check(puzzle, state) {
        if (!validState(puzzle, state)) return { solved: false, errors: [] };
        const size = puzzle.width * puzzle.height;
        const owners = endGrid(puzzle);
        const used = new Int8Array(size).fill(-1);
        const errors = [];
        let solved = true;
        state.paths.forEach((path, pair) => {
            if (!path.length) {
                solved = false;
                return;
            }
            const trimmed = trimPath(puzzle, pair, path, owners);
            const overlaps = path.some(cell => used[cell] >= 0);
            if (trimmed.length !== path.length || overlaps) errors.push(pair);
            path.forEach(cell => { if (cell >= 0 && cell < size) used[cell] = pair; });
            if (!connected(puzzle, pair, path)) solved = false;
        });
        if (errors.length || used.includes(-1)) solved = false;
        return { solved, errors };
    },

    // 次の一手：答えとちがう線があれば正しく引き直す。なければ、まだつながっていない線のうち、いちばん短いものを示す
    hint(puzzle, state) {
        if (!validState(puzzle, state) || numberlink.check(puzzle, state).solved) return null;
        const answer = solutionPaths(puzzle);
        const show = (pair, start, message) => {
            const cells = oriented(answer[pair], start);
            return { input: { type: 'path', pair, cells }, cells, message };
        };
        for (let pair = 0; pair < answer.length; pair++) {
            const path = state.paths[pair];
            if (!path.length) continue;
            const right = oriented(answer[pair], path[0]);
            if (path.some((cell, i) => cell !== right[i])) return show(pair, path[0], `${pair + 1} の線がちがいます。こうつながります`);
        }
        const open = answer.map((path, pair) => pair).filter(pair => !connected(puzzle, pair, state.paths[pair]));
        if (!open.length) return null;
        open.sort((x, y) => answer[x].length - answer[y].length || x - y);
        const pair = open[0];
        return show(pair, state.paths[pair][0] ?? answer[pair][0], `${pair + 1} の線は、こうつながります`);
    },

    // 試験用：でたらめな1手（どれかの数字から、でたらめに数マス進む線）
    randomInput(puzzle, state, random) {
        const pair = randomInt(random, puzzle.ends.length);
        if (random() < 0.15) return { type: 'clear', pair };
        const start = puzzle.ends[pair][randomInt(random, 2)];
        const cells = [start];
        const w = puzzle.width;
        for (let i = 0, n = 1 + randomInt(random, 6); i < n; i++) {
            const last = cells[cells.length - 1];
            const options = [last - w, last + w, last % w ? last - 1 : -1, (last + 1) % w ? last + 1 : -1]
                .filter(cell => cell >= 0 && cell < w * puzzle.height);
            cells.push(options[randomInt(random, options.length)]);
        }
        return { type: 'path', pair, cells };
    },

    render
};

export default numberlink;
