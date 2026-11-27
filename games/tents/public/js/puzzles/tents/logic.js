/**
 * テントのロジック。DOM に触れない（サーバーとテストでもそのまま動く）
 *
 * 問題：{ width, height, trees: [木のマスの番号…], rows: [行ごとのテントの数…], cols: [列ごとのテントの数…] }
 * 状態：{ cells: [0|1|2 …] }（0 未定・1 テント・2 芝生（テントを置かない印）。左上から行ごと）
 * 入力：{ cells: [マスの番号…], value: 0|1|2 }（押した・なぞったマスをまとめて同じ値にする）
 */

import { createRandom, shuffle } from '../../random.js';

export const EMPTY = 0;
export const TENT = 1;
export const GRASS = 2;

// 解き方で使う値：-1 未定・0 テントなし・1 テント
const UNKNOWN = -1;

export const SIZES = { easy: 6, normal: 9, hard: 12 };

// 難しさごとの作り方。density はテントの数（マスの数に対する割合）、rule は解き方の決め方（'unique' は解が1つで、基本の理屈だけでは解けないもの）
const PLAN = {
    easy: { density: 0.2, rule: 'basic' },
    normal: { density: 0.19, rule: 'trial' },
    hard: { density: 0.18, rule: 'unique' }
};

// ---------- 盤面の形 ----------

// マスごとの、上下左右のマス・まわり8マス・となりの木。行・列ごとのマス
const shapeCache = new WeakMap();
export function shapeOf(puzzle) {
    if (shapeCache.has(puzzle)) return shapeCache.get(puzzle);
    const { width: w, height: h } = puzzle;
    const size = w * h;
    const isTree = new Uint8Array(size);
    puzzle.trees.forEach(cell => { isTree[cell] = 1; });
    const sides = [];
    const ring = [];
    for (let cell = 0; cell < size; cell++) {
        const r = Math.floor(cell / w);
        const c = cell % w;
        const s = [];
        const g = [];
        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                const rr = r + dr;
                const cc = c + dc;
                if ((!dr && !dc) || rr < 0 || rr >= h || cc < 0 || cc >= w) continue;
                g.push(rr * w + cc);
                if (!dr || !dc) s.push(rr * w + cc);
            }
        }
        sides.push(s);
        ring.push(g);
    }
    const treesNear = sides.map(s => s.filter(cell => isTree[cell]));
    // テントを置けるかもしれないマス（木ではなく、となりに木がある）
    const candidate = Array.from({ length: size }, (_, cell) => !isTree[cell] && treesNear[cell].length > 0);
    const lines = [
        ...Array.from({ length: h }, (_, r) => ({ kind: 'row', index: r, need: puzzle.rows[r], cells: Array.from({ length: w }, (_, c) => r * w + c) })),
        ...Array.from({ length: w }, (_, c) => ({ kind: 'col', index: c, need: puzzle.cols[c], cells: Array.from({ length: h }, (_, r) => r * w + c) }))
    ];
    const shape = { isTree, sides, ring, treesNear, candidate, lines };
    shapeCache.set(puzzle, shape);
    return shape;
}

// 木とテントを1つずつ組にできるか（となりどうし。二部グラフの完全マッチング）
export function canPair(puzzle, isTent) {
    const { sides } = shapeOf(puzzle);
    const tentOf = new Map();
    const tryTree = (tree, visited) => {
        for (const cell of sides[tree]) {
            if (!isTent(cell) || visited.has(cell)) continue;
            visited.add(cell);
            if (!tentOf.has(cell) || tryTree(tentOf.get(cell), visited)) {
                tentOf.set(cell, tree);
                return true;
            }
        }
        return false;
    };
    return puzzle.trees.every(tree => tryTree(tree, new Set()));
}

// ---------- 解き方 ----------

// 何もわかっていない値（木と、となりに木がないマスはテントなし）
export function blankValues(puzzle) {
    const { candidate } = shapeOf(puzzle);
    return Int8Array.from(candidate, ok => (ok ? UNKNOWN : 0));
}

// 今の値（-1・0・1）から、決まるところを決めていく。矛盾すれば false
// 使う理屈：テントのまわり8マスには置けない・行と列の数・置ける場所が1つしかない木
export function propagate(puzzle, values) {
    const { ring, sides, lines } = shapeOf(puzzle);
    for (let changed = true; changed;) {
        changed = false;
        for (let cell = 0; cell < values.length; cell++) {
            if (values[cell] !== 1) continue;
            for (const s of ring[cell]) {
                if (values[s] === 1) return false;
                if (values[s] === UNKNOWN) {
                    values[s] = 0;
                    changed = true;
                }
            }
        }
        for (const line of lines) {
            let tents = 0;
            let open = 0;
            for (const cell of line.cells) {
                if (values[cell] === 1) tents++;
                else if (values[cell] === UNKNOWN) open++;
            }
            if (tents > line.need || tents + open < line.need) return false;
            if (open && (tents === line.need || tents + open === line.need)) {
                const value = tents === line.need ? 0 : 1;
                line.cells.forEach(cell => { if (values[cell] === UNKNOWN) values[cell] = value; });
                changed = true;
            }
        }
        for (const tree of puzzle.trees) {
            let only = -1;
            let count = 0;
            for (const s of sides[tree]) {
                if (values[s] !== 0) {
                    only = s;
                    count++;
                }
            }
            if (!count) return false;
            if (count === 1 && values[only] === UNKNOWN) {
                values[only] = 1;
                changed = true;
            }
        }
    }
    return true;
}

const settled = (values) => !values.includes(UNKNOWN);

// 仮に置いてみて矛盾するマスを、逆の値に決める（1段だけの試し）。決まったら true
function trialStep(puzzle, values) {
    for (let cell = 0; cell < values.length; cell++) {
        if (values[cell] !== UNKNOWN) continue;
        for (const value of [1, 0]) {
            const copy = values.slice();
            copy[cell] = value;
            if (!propagate(puzzle, copy) || (settled(copy) && !canPair(puzzle, s => copy[s] === 1))) {
                values[cell] = 1 - value;
                return true;
            }
        }
    }
    return false;
}

// 理屈だけで解けるか（rule が 'basic' なら propagate だけ、'trial' なら1段の試しも使う）
export function solvesByLogic(puzzle, rule) {
    const values = blankValues(puzzle);
    for (;;) {
        if (!propagate(puzzle, values)) return false;
        if (settled(values)) return canPair(puzzle, cell => values[cell] === 1);
        if (rule !== 'trial' || !trialStep(puzzle, values)) return false;
    }
}

// 解の数を limit まで数える。{ count, tents（1つ目の解のテントのマス） }
export function countSolutions(puzzle, limit = 2) {
    const { lines } = shapeOf(puzzle);
    let count = 0;
    let first = null;
    const search = (values) => {
        if (count >= limit || !propagate(puzzle, values)) return;
        // 残りの置き方がいちばん少ない行・列の、最初の未定のマスで分ける
        let best = null;
        let bestOpen = Infinity;
        for (const line of lines) {
            const open = line.cells.filter(cell => values[cell] === UNKNOWN).length;
            if (open && open < bestOpen) {
                bestOpen = open;
                best = line;
            }
        }
        if (!best) {
            if (!canPair(puzzle, cell => values[cell] === 1)) return;
            count++;
            if (!first) first = values.reduce((list, value, cell) => (value === 1 ? [...list, cell] : list), []);
            return;
        }
        const choice = best.cells.find(cell => values[cell] === UNKNOWN);
        const on = values.slice();
        on[choice] = 1;
        search(on);
        values[choice] = 0;
        search(values);
    };
    search(blankValues(puzzle));
    return { count, tents: first };
}

// ---------- 問題を作る ----------

const goodFor = (puzzle, rule) => (rule === 'unique'
    ? !solvesByLogic(puzzle, 'basic') && countSolutions(puzzle, 2).count === 1
    : solvesByLogic(puzzle, rule));

// テントを、となり合わないようにでたらめに置き、それぞれの上下左右のどこかに木を立てる。決め方どおりに解ける形になるまで作り直す
export function generate(seed, difficulty = 'normal') {
    const size = SIZES[difficulty] ?? SIZES.normal;
    const plan = PLAN[difficulty] ?? PLAN.normal;
    const random = createRandom(seed);
    const w = size;
    const h = size;
    const target = Math.round(w * h * plan.density);
    const blank = shapeOf({ width: w, height: h, trees: [], rows: [], cols: [] });
    for (;;) {
        const tent = new Uint8Array(w * h);
        const tents = [];
        for (const cell of shuffle(Array.from({ length: w * h }, (_, i) => i), random)) {
            if (tents.length >= target) break;
            if (blank.ring[cell].some(s => tent[s])) continue;
            tent[cell] = 1;
            tents.push(cell);
        }
        const tree = new Uint8Array(w * h);
        const placed = [];
        for (const cell of shuffle(tents, random)) {
            const spots = blank.sides[cell].filter(s => !tent[s] && !tree[s]);
            if (!spots.length) {
                tent[cell] = 0;
                continue;
            }
            tree[spots[Math.floor(random() * spots.length)]] = 1;
            placed.push(cell);
        }
        const trees = [];
        tree.forEach((on, cell) => { if (on) trees.push(cell); });
        const rows = Array.from({ length: h }, (_, r) => placed.filter(cell => Math.floor(cell / w) === r).length);
        const cols = Array.from({ length: w }, (_, c) => placed.filter(cell => cell % w === c).length);
        const puzzle = { width: w, height: h, trees, rows, cols };
        if (goodFor(puzzle, plan.rule)) return puzzle;
    }
}
