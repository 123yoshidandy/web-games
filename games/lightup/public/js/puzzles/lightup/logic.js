/**
 * ライトアップ（美術館）のロジック。DOM に触れない（サーバーとテストでもそのまま動く）
 *
 * 問題：{ width, height, grid: [-2|-1|0〜4 …] }（-2 白マス・-1 数字のない黒マス・0〜4 数字の黒マス。左上から行ごと）
 * 状態：{ cells: [0|1|2 …] }（0 未定・1 明かり・2 ・（明かりを置かない印）。黒マスは 0 のまま）
 * 入力：{ cells: [マスの番号…], value: 0|1|2 }（押した・なぞった白マスをまとめて同じ値にする）
 */

import { createRandom, shuffle } from '../../random.js';

export const WHITE = -2;
export const BLOCK = -1;

export const EMPTY = 0;
export const LIGHT = 1;
export const DOT = 2;

// 解き方で使う値：-1 未定・0 明かりなし・1 明かり
const UNKNOWN = -1;

export const SIZES = { easy: 7, normal: 10, hard: 14 };

// 難しさごとの作り方。walls は黒マスの割合、keep は残す数字の割合の下限、rule は数字を消してよいかの決め方
const PLAN = {
    easy: { walls: 0.2, keep: 0.6, rule: 'basic' },
    normal: { walls: 0.19, keep: 0, rule: 'trial' },
    hard: { walls: 0.18, keep: 0, rule: 'unique' }
};

// ---------- 盤面の形 ----------

// 白マスごとの、たて・よこに見えるマス（黒マスでさえぎられるまで。自分は含まない）と、黒マスごとのとなりの白マス
const shapeCache = new WeakMap();
export function shapeOf(puzzle) {
    if (shapeCache.has(puzzle)) return shapeCache.get(puzzle);
    const { width: w, height: h, grid } = puzzle;
    const seen = grid.map(() => []);
    const around = grid.map(() => []);
    const whites = [];
    const numbered = [];
    for (let cell = 0; cell < w * h; cell++) {
        const r = Math.floor(cell / w);
        const c = cell % w;
        if (grid[cell] === WHITE) {
            whites.push(cell);
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                for (let rr = r + dr, cc = c + dc; rr >= 0 && rr < h && cc >= 0 && cc < w; rr += dr, cc += dc) {
                    if (grid[rr * w + cc] !== WHITE) break;
                    seen[cell].push(rr * w + cc);
                }
            }
        } else {
            if (grid[cell] >= 0) numbered.push(cell);
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
                const rr = r + dr;
                const cc = c + dc;
                if (rr >= 0 && rr < h && cc >= 0 && cc < w && grid[rr * w + cc] === WHITE) around[cell].push(rr * w + cc);
            }
        }
    }
    const shape = { whites, numbered, seen, around };
    shapeCache.set(puzzle, shape);
    return shape;
}

// 明かりに照らされているマス（明かりのマスと、そこから見えるマス）
export function litCells(puzzle, isLight) {
    const { whites, seen } = shapeOf(puzzle);
    const lit = new Uint8Array(puzzle.width * puzzle.height);
    for (const cell of whites) {
        if (!isLight(cell)) continue;
        lit[cell] = 1;
        seen[cell].forEach(s => { lit[s] = 1; });
    }
    return lit;
}

// ---------- 解き方 ----------

// 今の値（-1・0・1）から、決まるところを決めていく。矛盾すれば false
// 使う理屈：明かりから見えるマスには置けない・数字のまわりの数・照らせるマスが1つしかない白マス
export function propagate(puzzle, values) {
    const { whites, numbered, seen, around } = shapeOf(puzzle);
    const { grid } = puzzle;
    for (let changed = true; changed;) {
        changed = false;
        for (const cell of whites) {
            if (values[cell] !== 1) continue;
            for (const s of seen[cell]) {
                if (values[s] === 1) return false;
                if (values[s] === UNKNOWN) {
                    values[s] = 0;
                    changed = true;
                }
            }
        }
        for (const wall of numbered) {
            let lights = 0;
            let open = 0;
            for (const s of around[wall]) {
                if (values[s] === 1) lights++;
                else if (values[s] === UNKNOWN) open++;
            }
            const need = grid[wall];
            if (lights > need || lights + open < need) return false;
            if (open && (lights === need || lights + open === need)) {
                const value = lights === need ? 0 : 1;
                around[wall].forEach(s => { if (values[s] === UNKNOWN) values[s] = value; });
                changed = true;
            }
        }
        if (changed) continue;
        const lit = litCells(puzzle, cell => values[cell] === 1);
        for (const cell of whites) {
            if (lit[cell]) continue;
            let only = -1;
            let count = 0;
            if (values[cell] === UNKNOWN) {
                only = cell;
                count++;
            }
            for (const s of seen[cell]) {
                if (values[s] === UNKNOWN) {
                    only = s;
                    count++;
                }
            }
            if (!count) return false;
            if (count === 1) {
                values[only] = 1;
                changed = true;
                break;
            }
        }
    }
    return true;
}

// 仮に置いてみて矛盾するマスを、逆の値に決める（1段だけの試し）。決まったら true
function trialStep(puzzle, values) {
    for (const cell of shapeOf(puzzle).whites) {
        if (values[cell] !== UNKNOWN) continue;
        for (const value of [1, 0]) {
            const copy = values.slice();
            copy[cell] = value;
            if (!propagate(puzzle, copy)) {
                values[cell] = 1 - value;
                return true;
            }
        }
    }
    return false;
}

// 理屈だけで解けるか（rule が 'basic' なら propagate だけ、'trial' なら1段の試しも使う）
export function solvesByLogic(puzzle, rule) {
    const values = new Int8Array(puzzle.width * puzzle.height).fill(UNKNOWN);
    for (;;) {
        if (!propagate(puzzle, values)) return false;
        if (shapeOf(puzzle).whites.every(cell => values[cell] !== UNKNOWN)) return true;
        if (rule !== 'trial' || !trialStep(puzzle, values)) return false;
    }
}

// 解の数を limit まで数える。{ count, lights（1つ目の解の明かりのマス） }
export function countSolutions(puzzle, limit = 2) {
    const { whites, seen } = shapeOf(puzzle);
    let count = 0;
    let first = null;
    const search = (values) => {
        if (count >= limit || !propagate(puzzle, values)) return;
        const lit = litCells(puzzle, cell => values[cell] === 1);
        // 照らせるマスがいちばん少ない、照らされていない白マスで分ける
        let best = -1;
        let bestCount = Infinity;
        for (const cell of whites) {
            if (lit[cell]) continue;
            const n = (values[cell] === UNKNOWN ? 1 : 0) + seen[cell].filter(s => values[s] === UNKNOWN).length;
            if (n < bestCount) {
                bestCount = n;
                best = cell;
            }
        }
        if (best < 0) {
            count++;
            if (!first) first = whites.filter(cell => values[cell] === 1);
            return;
        }
        const choice = values[best] === UNKNOWN ? best : seen[best].find(s => values[s] === UNKNOWN);
        const on = values.slice();
        on[choice] = 1;
        search(on);
        values[choice] = 0;
        search(values);
    };
    search(new Int8Array(puzzle.width * puzzle.height).fill(UNKNOWN));
    return { count, lights: first };
}

// ---------- 問題を作る ----------

// 数字を消してもよいか（難しさの決め方で、まだ解けるか）
const stillGood = (puzzle, rule) => (rule === 'unique' ? countSolutions(puzzle, 2).count === 1 : solvesByLogic(puzzle, rule));

// 黒マスを点対称に置き、明かりをでたらめに置いて、黒マスに数字を付ける。解が1つになる形なら、数字をできるだけ消す
export function generate(seed, difficulty = 'normal') {
    const size = SIZES[difficulty] ?? SIZES.normal;
    const plan = PLAN[difficulty] ?? PLAN.normal;
    const random = createRandom(seed);
    const w = size;
    const h = size;
    for (let attempt = 0; ; attempt++) {
        const grid = new Array(w * h).fill(WHITE);
        for (let cell = 0; cell < Math.ceil(w * h / 2); cell++) {
            if (random() < plan.walls) {
                grid[cell] = BLOCK;
                grid[w * h - 1 - cell] = BLOCK;
            }
        }
        let puzzle = { width: w, height: h, grid };
        const { whites, seen, around } = shapeOf(puzzle);
        if (whites.length < w * h * 0.6) continue;
        // 明かり：でたらめな順に、まだ照らされていない白マスに置く
        const light = new Uint8Array(w * h);
        const lit = new Uint8Array(w * h);
        for (const cell of shuffle(whites.slice(), random)) {
            if (lit[cell]) continue;
            light[cell] = 1;
            lit[cell] = 1;
            seen[cell].forEach(s => { lit[s] = 1; });
        }
        const full = grid.map((value, cell) => (value === WHITE ? WHITE : around[cell].filter(s => light[s]).length));
        puzzle = { width: w, height: h, grid: full };
        if (!stillGood(puzzle, plan.rule)) continue;
        // 数字を消す（でたらめな順に、消しても決め方どおりに解けるものだけ）
        const walls = shuffle(full.map((value, cell) => cell).filter(cell => full[cell] >= 0), random);
        const keepAtLeast = Math.ceil(walls.length * plan.keep);
        let kept = walls.length;
        for (const wall of walls) {
            if (kept <= keepAtLeast) break;
            const trial = puzzle.grid.slice();
            trial[wall] = BLOCK;
            const next = { width: w, height: h, grid: trial };
            if (stillGood(next, plan.rule)) {
                puzzle = next;
                kept--;
            }
        }
        return puzzle;
    }
}

