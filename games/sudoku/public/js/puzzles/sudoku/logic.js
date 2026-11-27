/**
 * 数独のロジック。DOM に触れない（サーバーとテストでもそのまま動く）
 *
 * 問題：{ size, boxWidth, boxHeight, givens: [0|1..size …] }（最初からある数字。0 は空き。左上から行ごと）
 * 状態：{ values: [0|1..size …], notes: [ビット …] }（values は書いた数字で、最初からある数字のマスは 0 のまま。notes はメモの数字（1 << 数字））
 * 入力：{ type: 'set', cell, value }（数字を書く。value 0 で消す。どちらもそのマスのメモは消える）
 *       { type: 'note', cell, value }（メモの数字を付け外しする。数字を書いたマスには付けない）
 */

import { createRandom, shuffle } from '../../random.js';

// 難しさごとの大きさと作り方（level 1：一つに決まるマスを探すだけで解ける。level 2：候補をしぼる理屈も使う）
export const SPECS = {
    easy: { size: 6, boxWidth: 3, boxHeight: 2, level: 1, minGivens: 0 },
    normal: { size: 9, boxWidth: 3, boxHeight: 3, level: 1, minGivens: 30 },
    hard: { size: 9, boxWidth: 3, boxHeight: 3, level: 2, minGivens: 0, needsLevel2: true }
};

export const bitOf = (digit) => 1 << digit;
export const bitCount = (mask) => {
    let count = 0;
    for (let m = mask; m; m &= m - 1) count++;
    return count;
};
export const digitsOf = (mask) => {
    const digits = [];
    for (let d = 1; mask >> d; d++) if (mask & bitOf(d)) digits.push(d);
    return digits;
};
const lowestDigit = (mask) => 31 - Math.clz32(mask & -mask);

// ---------- 盤の形（行・列・ブロック） ----------

const geometryCache = new Map();
export function geometry(puzzle) {
    const { size, boxWidth, boxHeight } = puzzle;
    const key = `${size}:${boxWidth}:${boxHeight}`;
    if (geometryCache.has(key)) return geometryCache.get(key);
    const n = size * size;
    const units = []; // { kind: 'row'|'col'|'box', index, cells }
    for (let r = 0; r < size; r++) units.push({ kind: 'row', index: r, cells: Array.from({ length: size }, (_, c) => r * size + c) });
    for (let c = 0; c < size; c++) units.push({ kind: 'col', index: c, cells: Array.from({ length: size }, (_, r) => r * size + c) });
    const boxesPerRow = size / boxWidth;
    for (let b = 0; b < size; b++) {
        const top = Math.floor(b / boxesPerRow) * boxHeight;
        const left = (b % boxesPerRow) * boxWidth;
        const cells = [];
        for (let r = 0; r < boxHeight; r++) for (let c = 0; c < boxWidth; c++) cells.push((top + r) * size + left + c);
        units.push({ kind: 'box', index: b, cells });
    }
    const boxOf = (cell) => Math.floor(Math.floor(cell / size) / boxHeight) * boxesPerRow + Math.floor((cell % size) / boxWidth);
    const unitsOf = Array.from({ length: n }, (_, i) => [Math.floor(i / size), size + (i % size), 2 * size + boxOf(i)]);
    const peers = Array.from({ length: n }, (_, i) => {
        const set = new Set();
        unitsOf[i].forEach(u => units[u].cells.forEach(cell => { if (cell !== i) set.add(cell); }));
        return [...set];
    });
    const geo = { size, n, full: ((1 << (size + 1)) - 2), units, unitsOf, peers, boxOf };
    geometryCache.set(key, geo);
    return geo;
}

// 最初からある数字と書いた数字を合わせた盤
export const filledGrid = (puzzle, values) => puzzle.givens.map((g, i) => g || values[i] || 0);

// ---------- 解の数え上げ ----------

// 解の数（limit まで）と、1つ目の解（数字の盤）
export function countSolutions(puzzle, limit = 2, grid = puzzle.givens) {
    const geo = geometry(puzzle);
    const { size, n, full } = geo;
    const cells = grid.slice();
    const rowMask = new Int32Array(size);
    const colMask = new Int32Array(size);
    const boxMask = new Int32Array(size);
    for (let i = 0; i < n; i++) {
        const d = cells[i];
        if (!d) continue;
        const [r, c, b] = geo.unitsOf[i];
        const bit = bitOf(d);
        if ((rowMask[r] | colMask[c - size] | boxMask[b - 2 * size]) & bit) return { count: 0, grid: null };
        rowMask[r] |= bit;
        colMask[c - size] |= bit;
        boxMask[b - 2 * size] |= bit;
    }
    let count = 0;
    let first = null;
    const search = () => {
        // 候補がいちばん少ない空きマスから
        let best = -1;
        let bestMask = 0;
        let bestCount = size + 1;
        for (let i = 0; i < n; i++) {
            if (cells[i]) continue;
            const [r, c, b] = geo.unitsOf[i];
            const mask = full & ~(rowMask[r] | colMask[c - size] | boxMask[b - 2 * size]);
            const k = bitCount(mask);
            if (k < bestCount) {
                best = i;
                bestMask = mask;
                bestCount = k;
                if (k <= 1) break;
            }
        }
        if (best < 0) {
            count++;
            if (!first) first = cells.slice();
            return count >= limit;
        }
        const [r, c, b] = geo.unitsOf[best];
        for (let mask = bestMask; mask; mask &= mask - 1) {
            const d = lowestDigit(mask);
            const bit = bitOf(d);
            cells[best] = d;
            rowMask[r] |= bit;
            colMask[c - size] |= bit;
            boxMask[b - 2 * size] |= bit;
            const stop = search();
            rowMask[r] &= ~bit;
            colMask[c - size] &= ~bit;
            boxMask[b - 2 * size] &= ~bit;
            cells[best] = 0;
            if (stop) return true;
        }
        return false;
    };
    search();
    return { count, grid: first };
}

// ---------- 理屈で解く（問題の難しさの確かめとヒント） ----------

// 盤から、各空きマスの候補（ビット）を求める
export function candidatesOf(geo, grid) {
    return grid.map((d, i) => {
        if (d) return 0;
        let used = 0;
        for (const p of geo.peers[i]) if (grid[p]) used |= bitOf(grid[p]);
        return geo.full & ~used;
    });
}

// 一つに決まるマスを探す：そのマスに入る数字が1つだけ（naked）か、まとまり（行・列・ブロック）の中でその数字が入るマスが1つだけ（hidden）
export function findPlacement(geo, grid, cand) {
    for (let i = 0; i < geo.n; i++) {
        if (!grid[i] && cand[i] && !(cand[i] & (cand[i] - 1))) return { kind: 'naked', cell: i, value: lowestDigit(cand[i]) };
    }
    for (const unit of geo.units) {
        let placed = 0;
        unit.cells.forEach(cell => { if (grid[cell]) placed |= bitOf(grid[cell]); });
        for (let d = 1; d <= geo.size; d++) {
            const bit = bitOf(d);
            if (placed & bit) continue;
            let only = -1;
            let count = 0;
            for (const cell of unit.cells) {
                if (!grid[cell] && (cand[cell] & bit)) {
                    only = cell;
                    if (++count > 1) break;
                }
            }
            if (count === 1) return { kind: 'hidden', cell: only, value: d, unit };
        }
    }
    return null;
}

export function place(geo, grid, cand, cell, value) {
    grid[cell] = value;
    cand[cell] = 0;
    const bit = bitOf(value);
    for (const p of geo.peers[cell]) cand[p] &= ~bit;
}

// 候補をしぼる理屈（ブロックと行・列の重なり、2つの数字の組）。1つでもしぼれたら true
export function eliminate(geo, grid, cand) {
    let changed = false;
    const remove = (cells, mask, keep) => {
        for (const cell of cells) {
            if (keep.includes(cell) || grid[cell] || !(cand[cell] & mask)) continue;
            cand[cell] &= ~mask;
            changed = true;
        }
    };
    const boxes = geo.units.filter(u => u.kind === 'box');
    const lines = geo.units.filter(u => u.kind !== 'box');
    for (let d = 1; d <= geo.size; d++) {
        const bit = bitOf(d);
        // ブロックの中で、その数字の候補が1つの行（列）にそろっていれば、その行（列）のほかのマスから消す
        for (const box of boxes) {
            const spots = box.cells.filter(cell => !grid[cell] && (cand[cell] & bit));
            if (spots.length < 2) continue;
            for (const line of lines) {
                if (spots.every(cell => line.cells.includes(cell))) remove(line.cells, bit, spots);
            }
        }
        // 行（列）の中で、その数字の候補が1つのブロックにそろっていれば、そのブロックのほかのマスから消す
        for (const line of lines) {
            const spots = line.cells.filter(cell => !grid[cell] && (cand[cell] & bit));
            if (spots.length < 2) continue;
            const box = geo.boxOf(spots[0]);
            if (spots.every(cell => geo.boxOf(cell) === box)) remove(boxes[box].cells, bit, spots);
        }
    }
    // 同じまとまりの2マスの候補が、同じ2つの数字だけなら、まとまりのほかのマスからその2つを消す
    for (const unit of geo.units) {
        const pairs = unit.cells.filter(cell => !grid[cell] && bitCount(cand[cell]) === 2);
        for (let a = 0; a < pairs.length; a++) {
            for (let b = a + 1; b < pairs.length; b++) {
                if (cand[pairs[a]] === cand[pairs[b]]) remove(unit.cells, cand[pairs[a]], [pairs[a], pairs[b]]);
            }
        }
    }
    return changed;
}

// 理屈だけで最後まで解けるか（解ければ、解は1つに決まっている）
export function solvableByLogic(puzzle, level, grid = puzzle.givens) {
    const geo = geometry(puzzle);
    const cells = grid.slice();
    const cand = candidatesOf(geo, cells);
    let empty = cells.filter(d => !d).length;
    while (empty) {
        const step = findPlacement(geo, cells, cand);
        if (step) {
            place(geo, cells, cand, step.cell, step.value);
            empty--;
            continue;
        }
        if (level < 2 || !eliminate(geo, cells, cand)) return false;
    }
    return true;
}

// ---------- 問題を作る ----------

// ルールに合う、数字で埋まった盤（でたらめな順に数字を試す）
function fullGrid(puzzle, random) {
    const geo = geometry(puzzle);
    const grid = new Array(geo.n).fill(0);
    const digits = Array.from({ length: geo.size }, (_, i) => i + 1);
    const fill = (i) => {
        if (i === geo.n) return true;
        let used = 0;
        for (const p of geo.peers[i]) if (grid[p]) used |= bitOf(grid[p]);
        for (const d of shuffle(digits.slice(), random)) {
            if (used & bitOf(d)) continue;
            grid[i] = d;
            if (fill(i + 1)) return true;
        }
        grid[i] = 0;
        return false;
    };
    fill(0);
    return grid;
}

// 埋まった盤から、点対称の組で数字を抜いていく。抜いても理屈で解ける間だけ抜く（解は1つのまま）
export function generate(seed, difficulty = 'normal') {
    const spec = SPECS[difficulty] ?? SPECS.normal;
    const random = createRandom(seed);
    const base = { size: spec.size, boxWidth: spec.boxWidth, boxHeight: spec.boxHeight };
    const n = spec.size * spec.size;
    let puzzle = null;
    for (let attempt = 0; attempt < 60; attempt++) {
        const givens = fullGrid(base, random);
        let count = n;
        const order = shuffle(Array.from({ length: Math.ceil(n / 2) }, (_, i) => i), random);
        for (const cell of order) {
            const mirror = n - 1 - cell;
            const removing = cell === mirror ? 1 : 2;
            if (count - removing < spec.minGivens) continue;
            const saved = [givens[cell], givens[mirror]];
            givens[cell] = 0;
            givens[mirror] = 0;
            if (solvableByLogic({ ...base, givens }, spec.level, givens)) count -= removing;
            else [givens[cell], givens[mirror]] = saved;
        }
        puzzle = { ...base, givens };
        // むずかしいは、一つに決まるマスを探すだけでは解けない問題にする
        if (!spec.needsLevel2 || !solvableByLogic(puzzle, 1)) break;
    }
    return puzzle;
}
