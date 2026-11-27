/**
 * 四角に切れ
 * 問題・状態・入力の形は logic.js の先頭。解が1つの問題だけを作る
 * ヒントは、答えにない長方形を消す手を先に出し、次に置き方が1通りしかない数字の長方形を示す
 */

import { generate, countSolutions, candidatesOf, openCandidates, areaOf, cellsOf, containsCell, sameRect, SIZES } from './logic.js';
import { render } from './render.js';
import { randomInt } from '../../random.js';

const solutionCache = new Map();
function answerOf(puzzle) {
    const key = JSON.stringify(puzzle);
    if (!solutionCache.has(key)) {
        if (solutionCache.size > 20) solutionCache.delete(solutionCache.keys().next().value);
        solutionCache.set(key, countSolutions(puzzle, 1, candidatesOf(puzzle)).solutions[0]);
    }
    return solutionCache.get(key);
}

const validRect = (puzzle, rect) => Array.isArray(rect) && rect.length === 4 && rect.every(Number.isInteger)
    && rect[0] >= 0 && rect[1] >= 0 && rect[0] <= rect[2] && rect[1] <= rect[3] && rect[2] < puzzle.height && rect[3] < puzzle.width;
const validState = (puzzle, state) => Array.isArray(state?.rects) && state.rects.every(rect => validRect(puzzle, rect));

const overlaps = (x, y) => x[0] <= y[2] && y[0] <= x[2] && x[1] <= y[3] && y[1] <= x[3];
const byCorner = (x, y) => x[0] - y[0] || x[1] - y[1];

const shikaku = {
    id: 'shikaku',
    name: '四角に切れ',
    rules: [
        '盤面を、マスの線にそって長方形（正方形も）に切り分けましょう。',
        'どの長方形にも数字がちょうど1つ入り、その数字が長方形のマスの数になるようにします。すべてのマスを分けると完成です。'
    ],
    controls: 'マスからマスへ指をすべらせると、その間を長方形で囲みます。長方形を押すと消えます。',
    difficulties: { easy: `${SIZES.easy}×${SIZES.easy}`, normal: `${SIZES.normal}×${SIZES.normal}`, hard: `${SIZES.hard}×${SIZES.hard}` },
    // CPU が1手（ヒント1つ分：長方形1つ）にかける秒数の目安（ふつうの強さ）
    cpuSecondsPerStep: 7,

    generate,

    solve(puzzle, limit = 2) {
        const { count, solutions } = countSolutions(puzzle, limit, candidatesOf(puzzle));
        return { count, solution: solutions.length ? { rects: solutions[0].slice().sort(byCorner) } : null };
    },

    initialState: () => ({ rects: [] }),

    applyInput(puzzle, state, input) {
        if (!input || !validState(puzzle, state)) return state;
        if (input.type === 'rect') {
            const rect = [input.top, input.left, input.bottom, input.right];
            if (!validRect(puzzle, rect) || state.rects.some(other => sameRect(other, rect))) return state;
            return { rects: [...state.rects.filter(other => !overlaps(other, rect)), rect].sort(byCorner) };
        }
        if (input.type === 'erase') {
            const { cell } = input;
            if (!Number.isInteger(cell) || cell < 0 || cell >= puzzle.width * puzzle.height) return state;
            const rects = state.rects.filter(rect => !containsCell(rect, puzzle.width, cell));
            return rects.length === state.rects.length ? state : { rects };
        }
        return state;
    },

    // 解けたか（長方形がすき間も重なりもなく盤面を埋め、どれも数字が1つで面積が数字どおり）と、まちがっている長方形の番号
    check(puzzle, state) {
        if (!validState(puzzle, state)) return { solved: false, errors: [] };
        const { width: w, height: h, clues } = puzzle;
        const count = new Uint8Array(w * h);
        state.rects.forEach(rect => cellsOf(rect, w).forEach(x => { count[x]++; }));
        const errors = [];
        state.rects.forEach((rect, i) => {
            const inside = clues.filter(([cell]) => containsCell(rect, w, cell));
            const overlapped = cellsOf(rect, w).some(x => count[x] > 1);
            if (overlapped || inside.length !== 1 || inside[0][1] !== areaOf(rect)) errors.push(i);
        });
        const solved = !errors.length && count.every(n => n === 1);
        return { solved, errors };
    },

    // 次の一手：答えにない長方形があれば消す。なければ、置き方が1通りしかない数字の長方形を示す。なければ、候補のいちばん少ない数字の答えを示す
    hint(puzzle, state) {
        if (!validState(puzzle, state) || shikaku.check(puzzle, state).solved) return null;
        const { width: w } = puzzle;
        const answer = answerOf(puzzle);
        const wrong = state.rects.find(rect => !answer.some(right => sameRect(right, rect)));
        if (wrong) {
            const cell = wrong[0] * w + wrong[1];
            return { input: { type: 'erase', cell }, cells: cellsOf(wrong, w), message: 'この長方形はちがいます。消します' };
        }
        const covered = new Uint8Array(w * puzzle.height);
        state.rects.forEach(rect => cellsOf(rect, w).forEach(x => { covered[x] = 1; }));
        const candidates = candidatesOf(puzzle);
        const show = (k, message) => {
            const [top, left, bottom, right] = answer[k];
            return { input: { type: 'rect', top, left, bottom, right }, cells: cellsOf(answer[k], w), message };
        };
        const open = answer.map((rect, k) => k).filter(k => !state.rects.some(rect => sameRect(rect, answer[k])));
        if (!open.length) return null;
        const choices = open.map(k => ({ k, n: openCandidates(candidates[k], covered).length }));
        const forced = choices.find(choice => choice.n === 1);
        if (forced) return show(forced.k, `${puzzle.clues[forced.k][1]} の長方形は、ほかの数字や長方形をよけると、この置き方しかありません`);
        choices.sort((x, y) => x.n - y.n || x.k - y.k);
        return show(choices[0].k, `${puzzle.clues[choices[0].k][1]} の長方形は、こうなります`);
    },

    // 試験用：でたらめな1手（でたらめな小さい長方形を描くか、どこかを消す）
    randomInput(puzzle, state, random) {
        const { width: w, height: h } = puzzle;
        if (random() < 0.2) return { type: 'erase', cell: randomInt(random, w * h) };
        const top = randomInt(random, h);
        const left = randomInt(random, w);
        return { type: 'rect', top, left, bottom: Math.min(h - 1, top + randomInt(random, 3)), right: Math.min(w - 1, left + randomInt(random, 3)) };
    },

    render
};

export default shikaku;
