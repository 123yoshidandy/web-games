/**
 * お絵かきロジック（ノノグラム）のロジック。DOM に触れない（サーバーとテストでもそのまま動く）
 *
 * 問題：{ width, height, rows: [[数字…]…], cols: [[数字…]…] }（数字のない列は []。画面では 0 と出す）
 * 状態：{ cells: [0|1|2 …] }（0 未定・1 塗る・2 ×。左上から行ごと）
 * 入力：{ cells: [マスの番号…], value: 0|1|2 }（なぞった・押したマスをまとめて同じ値にする）
 */

import { createRandom, randomInt } from '../../random.js';

export const EMPTY = 0;
export const FILLED = 1;
export const CROSS = 2;

// 行の解き方で使う値：-1 未定・0 白・1 黒
const UNKNOWN = -1;

export const SIZES = { easy: 5, normal: 10, hard: 15 };

// ---------- 1行の解き方 ----------

// 数字（clue）と、今わかっているマス（-1・0・1）から、どの並べ方でも同じになるマスを決める
// 返り値：新しい行（矛盾すれば null）
export function solveLine(clue, line) {
    const n = line.length;
    const k = clue.length;
    // 白（0）・黒（1）の数の累積（区間に白・黒があるかを O(1) で調べる）
    const zeros = new Int16Array(n + 1);
    const ones = new Int16Array(n + 1);
    for (let i = 0; i < n; i++) {
        zeros[i + 1] = zeros[i] + (line[i] === 0 ? 1 : 0);
        ones[i + 1] = ones[i] + (line[i] === 1 ? 1 : 0);
    }
    const W = k + 1;
    // fits[i * W + j]：i 番目のマスから後ろに、j 番目からの塊を置けるか
    const fits = new Uint8Array((n + 1) * W);
    const canPlace = (i, j) => {
        const end = i + clue[j];
        return end <= n && zeros[end] - zeros[i] === 0 && (end === n || line[end] !== 1);
    };
    const nextOf = (i, j) => Math.min(i + clue[j] + 1, n);
    for (let i = n; i >= 0; i--) {
        fits[i * W + k] = ones[n] - ones[i] === 0 ? 1 : 0;
        for (let j = k - 1; j >= 0; j--) {
            if (i === n) continue;
            const skip = line[i] !== 1 && fits[(i + 1) * W + j];
            const place = canPlace(i, j) && fits[nextOf(i, j) * W + j + 1];
            fits[i * W + j] = skip || place ? 1 : 0;
        }
    }
    if (!fits[0]) return null;

    // 前から、たどり着ける置き方だけをたどって、黒になりうる・白になりうるマスに印を付ける
    const canFill = new Uint8Array(n);
    const canEmpty = new Uint8Array(n);
    const reach = new Uint8Array((n + 1) * W);
    reach[0] = 1;
    for (let i = 0; i <= n; i++) {
        for (let j = 0; j <= k; j++) {
            if (!reach[i * W + j] || !fits[i * W + j]) continue;
            if (j === k) {
                for (let x = i; x < n; x++) canEmpty[x] = 1;
                continue;
            }
            if (i < n && line[i] !== 1 && fits[(i + 1) * W + j]) {
                canEmpty[i] = 1;
                reach[(i + 1) * W + j] = 1;
            }
            if (canPlace(i, j) && fits[nextOf(i, j) * W + j + 1]) {
                const end = i + clue[j];
                for (let x = i; x < end; x++) canFill[x] = 1;
                if (end < n) canEmpty[end] = 1;
                reach[nextOf(i, j) * W + j + 1] = 1;
            }
        }
    }
    const result = line.slice();
    for (let i = 0; i < n; i++) {
        if (canFill[i] && !canEmpty[i]) result[i] = 1;
        else if (canEmpty[i] && !canFill[i]) result[i] = 0;
    }
    return result;
}

// ---------- 盤面 ----------

export const rowCells = (puzzle, r) => Array.from({ length: puzzle.width }, (_, c) => r * puzzle.width + c);
export const colCells = (puzzle, c) => Array.from({ length: puzzle.height }, (_, r) => r * puzzle.width + c);

// 行と列の一覧（{ kind: 'row'|'col', index, clue, cells }）
export function linesOf(puzzle) {
    const lines = [];
    for (let r = 0; r < puzzle.height; r++) lines.push({ kind: 'row', index: r, clue: puzzle.rows[r], cells: rowCells(puzzle, r) });
    for (let c = 0; c < puzzle.width; c++) lines.push({ kind: 'col', index: c, clue: puzzle.cols[c], cells: colCells(puzzle, c) });
    return lines;
}

// 行の解き方を、変わらなくなるまで繰り返す。grid は -1・0・1 の配列（書き換える）
// 返り値：矛盾がなければ true
export function propagate(puzzle, grid) {
    const lines = linesOf(puzzle);
    const dirty = new Set(lines.map((_, i) => i));
    const linesOfCell = (cell) => [Math.floor(cell / puzzle.width), puzzle.height + (cell % puzzle.width)];
    while (dirty.size) {
        const [index] = dirty;
        dirty.delete(index);
        const line = lines[index];
        const before = line.cells.map(cell => grid[cell]);
        const after = solveLine(line.clue, before);
        if (!after) return false;
        after.forEach((value, i) => {
            if (value === before[i]) return;
            const cell = line.cells[i];
            grid[cell] = value;
            linesOfCell(cell).forEach(other => { if (other !== index) dirty.add(other); });
        });
    }
    return true;
}

// 解の数を数える（limit まで）。行の解き方で決まらないときだけ、マスを仮に決めて分ける
export function countSolutions(puzzle, limit = 2) {
    let count = 0;
    let first = null;
    const search = (grid) => {
        if (count >= limit) return;
        if (!propagate(puzzle, grid)) return;
        const unknown = grid.indexOf(UNKNOWN);
        if (unknown < 0) {
            count++;
            if (!first) first = grid.slice();
            return;
        }
        for (const value of [1, 0]) {
            const next = grid.slice();
            next[unknown] = value;
            search(next);
        }
    };
    search(new Array(puzzle.width * puzzle.height).fill(UNKNOWN));
    return { count, grid: first };
}

// 行の解き方だけで全部決まるか
export function lineSolvable(puzzle) {
    const grid = new Array(puzzle.width * puzzle.height).fill(UNKNOWN);
    return propagate(puzzle, grid) && !grid.includes(UNKNOWN);
}

// ---------- 数字 ----------

// 行（0・1 の並び）の黒の塊の長さ
export function runsOf(values) {
    const runs = [];
    let run = 0;
    for (const value of values) {
        if (value === 1) run++;
        else if (run) {
            runs.push(run);
            run = 0;
        }
    }
    if (run) runs.push(run);
    return runs;
}

export function cluesOf(grid, width, height) {
    const rows = [];
    const cols = [];
    for (let r = 0; r < height; r++) rows.push(runsOf(grid.slice(r * width, (r + 1) * width)));
    for (let c = 0; c < width; c++) cols.push(runsOf(Array.from({ length: height }, (_, r) => grid[r * width + c])));
    return { rows, cols };
}

// ---------- 生成 ----------

// まとまりのある絵（ただの砂嵐にしない）：乱数で塗ってから、まわりの多数決で2回ならす
function randomPicture(size, random, density) {
    let grid = Array.from({ length: size * size }, () => (random() < density ? 1 : 0));
    for (let pass = 0; pass < 2; pass++) {
        grid = grid.map((value, i) => {
            const r = Math.floor(i / size);
            const c = i % size;
            let filled = 0;
            let total = 0;
            for (let dr = -1; dr <= 1; dr++) {
                for (let dc = -1; dc <= 1; dc++) {
                    const rr = r + dr;
                    const cc = c + dc;
                    if (rr < 0 || cc < 0 || rr >= size || cc >= size) continue;
                    total++;
                    filled += grid[rr * size + cc];
                }
            }
            // ならす強さは弱め（自分を多めに数える）。境目のマスだけが入れ替わる
            const score = (filled + value * 2) / (total + 2);
            if (score > 0.62) return 1;
            if (score < 0.38) return 0;
            return value;
        });
    }
    return grid;
}

// 行の解き方で決まらないマスを1つずつ入れ替えて、決まる絵に近づける
function makeLineSolvable(grid, size, random, maxFixes) {
    for (let fix = 0; fix <= maxFixes; fix++) {
        const clues = cluesOf(grid, size, size);
        const puzzle = { width: size, height: size, ...clues };
        const work = new Array(size * size).fill(UNKNOWN);
        propagate(puzzle, work);
        const unknown = [];
        work.forEach((value, i) => { if (value === UNKNOWN) unknown.push(i); });
        if (!unknown.length) return puzzle;
        const cell = unknown[randomInt(random, unknown.length)];
        grid[cell] = 1 - grid[cell];
    }
    return null;
}

// 同じシードと難しさからは、同じ問題になる
export function generate(seed, difficulty = 'normal') {
    const size = SIZES[difficulty] ?? SIZES.normal;
    const random = createRandom(seed);
    for (let attempt = 0; ; attempt++) {
        const density = 0.5 + random() * 0.15;
        const grid = randomPicture(size, random, density);
        const filled = grid.reduce((a, b) => a + b, 0);
        // 真っ白・真っ黒に近い絵は解きごたえがないので作り直す
        if (filled < size * size * 0.3 || filled > size * size * 0.8) continue;
        const puzzle = makeLineSolvable(grid, size, random, size * 3);
        if (puzzle) return puzzle;
        if (attempt > 200) throw new Error('お絵かきロジックの問題を作れませんでした');
    }
}
