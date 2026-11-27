/**
 * カックロのロジック。DOM に触れない（サーバーとテストでもそのまま動く）
 * 問題は、遊ぶときには作らない（解が1つで理屈だけで解ける問題は、その場で作ると時間が読めない）。
 * scripts/build-pool.mjs が buildPuzzle で前もって作って確かめた組（pool.js）から、generate がシードで選ぶ
 *
 * 問題：{ width, height, clues: [null | [たての和, よこの和] …] }（null は数字を入れる白いマス。配列は黒いマスで、和のない向きは 0。左上から行ごと）
 * 状態：{ values: [0|1..9 …], notes: [ビット …] }（values は白いマスに書いた数字。黒いマスは 0。notes はメモの数字（1 << 数字））
 * 入力：{ type: 'set', cell, value }（数字を書く。value 0 で消す。どちらもそのマスのメモは消える）
 *       { type: 'note', cell, value }（メモの数字を付け外しする。数字を書いたマスには付けない）
 */

import { createRandom, randomInt, shuffle } from '../../random.js';
import { POOL } from './pool.js';

// 難しさごとの盤の大きさ（いちばん上の行と左の列は和を書く黒いマス）・黒いマスの多さ・続き（run）の長さの上限・白いマスの少なさの下限・1行（1列）の白いマスの数の下限。
// 問題はこの目安で前もって作り、pool.js に並べてある（scripts/build-pool.mjs）
export const SPECS = {
    easy: { size: 6, black: 0.12, minWhite: 0.55, maxRun: 4, minLine: 2 },
    normal: { size: 8, black: 0.15, minWhite: 0.45, maxRun: 5, minLine: 3 },
    hard: { size: 9, black: 0.12, minWhite: 0.5, maxRun: 6, minLine: 4 }
};

const FULL = 0b1111111110; // 1〜9
export const bitOf = (digit) => 1 << digit;
export const bitCount = (mask) => {
    let count = 0;
    for (let m = mask; m; m &= m - 1) count++;
    return count;
};
const lowestDigit = (mask) => 31 - Math.clz32(mask & -mask);
export const digitsOf = (mask) => {
    const digits = [];
    for (let d = 1; d <= 9; d++) if (mask & bitOf(d)) digits.push(d);
    return digits;
};

// COMBOS[マスの数][和]：その和になる、ちがう数字の組（ビット）の一覧
const COMBOS = Array.from({ length: 10 }, () => Array.from({ length: 46 }, () => []));
for (let mask = 2; mask <= FULL; mask += 2) {
    const digits = digitsOf(mask);
    COMBOS[digits.length][digits.reduce((a, b) => a + b, 0)].push(mask);
}
export const combosOf = (length, sum) => (length >= 1 && length <= 9 && sum >= 1 && sum <= 45 ? COMBOS[length][sum] : []);

// ---------- 盤の形（和のまとまり） ----------

// 白いマスの続き（run）：{ dir: 'down'|'right', clue（黒いマスの番号）, sum, cells }。cellRuns[マス] = [よこの run, たての run]
const layoutCache = new Map();
export function layout(puzzle) {
    const key = JSON.stringify(puzzle);
    if (layoutCache.has(key)) return layoutCache.get(key);
    const { width: w, height: h, clues } = puzzle;
    const runs = [];
    const cellRuns = Array.from({ length: w * h }, () => [-1, -1]);
    for (let i = 0; i < w * h; i++) {
        if (!clues[i]) continue;
        const [down, right] = clues[i];
        for (const [dir, sum, step, slot] of [['right', right, 1, 0], ['down', down, w, 1]]) {
            const cells = [];
            for (let at = i + step; at < w * h && !clues[at] && (dir === 'down' || Math.floor(at / w) === Math.floor(i / w)); at += step) cells.push(at);
            if (!cells.length) continue;
            cells.forEach(cell => { cellRuns[cell][slot] = runs.length; });
            runs.push({ dir, clue: i, sum, cells });
        }
    }
    const whites = clues.map((c, i) => (c ? -1 : i)).filter(i => i >= 0);
    const result = { runs, cellRuns, whites };
    if (layoutCache.size > 20) layoutCache.delete(layoutCache.keys().next().value);
    layoutCache.set(key, result);
    return result;
}

// 問題の形が正しいか（オンラインで届いたものも投げずに確かめる）
export function validPuzzle(puzzle) {
    if (!Number.isInteger(puzzle?.width) || !Number.isInteger(puzzle.height) || !Array.isArray(puzzle.clues)) return false;
    return puzzle.clues.length === puzzle.width * puzzle.height
        && puzzle.clues.every(c => c === null || (Array.isArray(c) && c.length === 2 && c.every(Number.isInteger)));
}

// run の中で、まだ使える数字（今の数字を全部含む組の、残りの数字の和集合）
function allowedIn(run, used, length) {
    let allowed = 0;
    for (const combo of combosOf(length, run.sum)) if ((combo & used) === used) allowed |= combo & ~used;
    return allowed;
}

// ---------- 解の数え上げ ----------

// 解の数（limit まで）と、見つけた解（数字の盤。2つ目まで）
export function countSolutions(puzzle, limit = 2, maxNodes = Infinity) {
    const { runs, cellRuns, whites } = layout(puzzle);
    const values = new Array(puzzle.width * puzzle.height).fill(0);
    const used = new Int32Array(runs.length);
    const solutions = [];
    let count = 0;
    let nodes = 0;
    let aborted = false;
    const search = () => {
        if (++nodes > maxNodes) {
            aborted = true;
            return true;
        }
        const allowed = runs.map((run, r) => allowedIn(run, used[r], run.cells.length));
        let best = -1;
        let bestMask = 0;
        let bestCount = 10;
        for (const cell of whites) {
            if (values[cell]) continue;
            const [rh, rv] = cellRuns[cell];
            const mask = (rh >= 0 ? allowed[rh] : FULL) & (rv >= 0 ? allowed[rv] : FULL);
            const k = bitCount(mask);
            if (k < bestCount) {
                best = cell;
                bestMask = mask;
                bestCount = k;
                if (k === 0) return false;
            }
        }
        if (best < 0) {
            count++;
            solutions.push(values.slice());
            return count >= limit;
        }
        const [rh, rv] = cellRuns[best];
        for (let mask = bestMask; mask; mask &= mask - 1) {
            const d = lowestDigit(mask);
            const bit = bitOf(d);
            values[best] = d;
            if (rh >= 0) used[rh] |= bit;
            if (rv >= 0) used[rv] |= bit;
            const stop = search();
            if (rh >= 0) used[rh] &= ~bit;
            if (rv >= 0) used[rv] &= ~bit;
            values[best] = 0;
            if (stop) return true;
        }
        return false;
    };
    search();
    return { count, grid: solutions[0] ?? null, other: solutions[1] ?? null, aborted };
}

// ---------- 理屈で解く（問題の確かめとヒント） ----------

// 今の数字（values）から、空いた白いマスの候補を、和の組み合わせでしぼる。
// 組の残りの数字が、空いたマスの候補で配れるか（どのマスにも入る数字があり、残りの数字のどれもどこかのマスに入る）を見て、合う組だけを残す
export function narrow(puzzle, values, cand) {
    const { runs } = layout(puzzle);
    let changed = true;
    let any = false;
    while (changed) {
        changed = false;
        for (const run of runs) {
            let used = 0;
            const open = [];
            for (const cell of run.cells) {
                if (values[cell]) used |= bitOf(values[cell]);
                else open.push(cell);
            }
            if (!open.length) continue;
            let union = 0;
            for (const combo of combosOf(run.cells.length, run.sum)) {
                if ((combo & used) !== used) continue;
                const rest = combo & ~used;
                let cover = 0;
                let fits = true;
                for (const cell of open) {
                    const can = cand[cell] & rest;
                    if (!can) {
                        fits = false;
                        break;
                    }
                    cover |= can;
                }
                if (fits && cover === rest) union |= rest;
            }
            for (const cell of open) {
                const next = cand[cell] & union;
                if (next !== cand[cell]) {
                    cand[cell] = next;
                    changed = true;
                    any = true;
                }
            }
        }
    }
    return any;
}

// 空いた白いマスの、最初の候補（同じ run に書いた数字を除く 1〜9）
export function initialCandidates(puzzle, values) {
    const { runs, whites } = layout(puzzle);
    const cand = new Array(values.length).fill(0);
    const used = runs.map(run => run.cells.reduce((m, cell) => m | (values[cell] ? bitOf(values[cell]) : 0), 0));
    const { cellRuns } = layout(puzzle);
    for (const cell of whites) {
        if (values[cell]) continue;
        const [rh, rv] = cellRuns[cell];
        cand[cell] = FULL & ~(rh >= 0 ? used[rh] : 0) & ~(rv >= 0 ? used[rv] : 0);
    }
    return cand;
}

// 一つに決まるマス：候補が1つ（naked）か、run の中でその数字が必ず入り、入れるマスが1つだけ（hidden）
export function findPlacement(puzzle, values, cand) {
    const { runs, whites } = layout(puzzle);
    for (const cell of whites) {
        if (!values[cell] && cand[cell] && !(cand[cell] & (cand[cell] - 1))) return { kind: 'naked', cell, value: lowestDigit(cand[cell]) };
    }
    for (const run of runs) {
        let used = 0;
        const open = run.cells.filter(cell => {
            if (values[cell]) used |= bitOf(values[cell]);
            return !values[cell];
        });
        if (!open.length) continue;
        // どの組にも入る数字（必ず使う数字）
        let must = FULL;
        let found = false;
        for (const combo of combosOf(run.cells.length, run.sum)) {
            if ((combo & used) !== used) continue;
            if (!open.every(cell => cand[cell] & combo & ~used)) continue;
            must &= combo & ~used;
            found = true;
        }
        if (!found) continue;
        for (const d of digitsOf(must)) {
            const spots = open.filter(cell => cand[cell] & bitOf(d));
            if (spots.length === 1) return { kind: 'hidden', cell: spots[0], value: d, run };
        }
    }
    return null;
}

// 理屈（組み合わせで候補をしぼる・一つに決まるマスを探す）だけで、どこまで解けるか。決まった数字の盤と、決まらなかったマスの数と、その候補の数の合計（問題を作るときの目安）
export function logicSolve(puzzle) {
    const values = new Array(puzzle.width * puzzle.height).fill(0);
    const { whites, cellRuns, runs } = layout(puzzle);
    const cand = initialCandidates(puzzle, values);
    let empty = whites.length;
    while (empty) {
        narrow(puzzle, values, cand);
        const step = findPlacement(puzzle, values, cand);
        if (!step) break;
        values[step.cell] = step.value;
        cand[step.cell] = 0;
        const bit = bitOf(step.value);
        for (const r of cellRuns[step.cell]) if (r >= 0) runs[r].cells.forEach(cell => { cand[cell] &= ~bit; });
        empty--;
    }
    let spread = 0;
    for (const cell of whites) if (!values[cell]) spread += bitCount(cand[cell]);
    return { values, remaining: empty, spread };
}

// 理屈だけで最後まで解けるか（解ければ、解は1つに決まっている）
export const solvableByLogic = (puzzle) => logicSolve(puzzle).remaining === 0;

// ---------- 問題を作る ----------

// 白黒の形：外の1行・1列は黒。中は点対称にでたらめに黒くし、1マスだけの続きができたら黒にする。白いマスがつながっていて、十分あるものだけ
export function makePattern(size, spec, random) {
    const black = new Uint8Array(size * size);
    for (let i = 0; i < size; i++) {
        black[i] = 1;
        black[i * size] = 1;
    }
    const inner = size - 1;
    const mirror = (cell) => {
        const r = Math.floor(cell / size) - 1;
        const c = (cell % size) - 1;
        return (inner - 1 - r + 1) * size + (inner - 1 - c + 1);
    };
    for (let r = 1; r < size; r++) {
        for (let c = 1; c < size; c++) {
            const cell = r * size + c;
            if (cell <= mirror(cell) && random() < spec.black) {
                black[cell] = 1;
                black[mirror(cell)] = 1;
            }
        }
    }
    const runLength = (cell, step) => {
        let length = 1;
        for (let at = cell - step; !black[at]; at -= step) length++;
        for (let at = cell + step; at < size * size && !black[at] && (step === size || Math.floor(at / size) === Math.floor(cell / size)); at += step) length++;
        return length;
    };
    for (let changed = true; changed;) {
        changed = false;
        // 長すぎる続き（spec.maxRun より長い）は、途中のマスを黒くして切る
        for (let cell = 0; cell < size * size && spec.maxRun; cell++) {
            if (black[cell]) continue;
            for (const step of [1, size]) {
                if (black[cell] || runLength(cell, step) <= spec.maxRun) continue;
                black[cell] = 1;
                black[mirror(cell)] = 1;
                changed = true;
            }
        }
        for (let cell = 0; cell < size * size; cell++) {
            if (black[cell]) continue;
            if (runLength(cell, 1) < 2 || runLength(cell, size) < 2) {
                black[cell] = 1;
                black[mirror(cell)] = 1;
                changed = true;
            }
        }
    }
    const whites = [];
    for (let cell = 0; cell < size * size; cell++) if (!black[cell]) whites.push(cell);
    if (whites.length < spec.minWhite * inner * inner) return null;
    // 黒いマスが片寄って固まらないように、中のどの行・列にも白いマスが spec.minLine 個以上
    for (let k = 1; k < size; k++) {
        let row = 0;
        let col = 0;
        for (let j = 1; j < size; j++) {
            if (!black[k * size + j]) row++;
            if (!black[j * size + k]) col++;
        }
        if (row < (spec.minLine ?? 0) || col < (spec.minLine ?? 0)) return null;
    }
    // 白いマスがつながっているか
    const seen = new Set([whites[0]]);
    const queue = [whites[0]];
    while (queue.length) {
        const cell = queue.pop();
        for (const next of [cell - 1, cell + 1, cell - size, cell + size]) {
            if (next < 0 || next >= size * size || black[next] || seen.has(next)) continue;
            if (Math.abs((next % size) - (cell % size)) > 1) continue;
            seen.add(next);
            queue.push(next);
        }
    }
    return seen.size === whites.length ? black : null;
}

// 形に、同じ続きで数字が重ならないように、でたらめに数字を埋める
export function fillDigits(size, black, random) {
    const values = new Array(size * size).fill(0);
    const whites = [];
    for (let cell = 0; cell < size * size; cell++) if (!black[cell]) whites.push(cell);
    const usedAround = (cell) => {
        let used = 0;
        for (let at = cell - 1; !black[at]; at--) used |= bitOf(values[at]);
        for (let at = cell - size; !black[at]; at -= size) used |= bitOf(values[at]);
        return used;
    };
    const digits = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    const fill = (k) => {
        if (k === whites.length) return true;
        const cell = whites[k];
        const used = usedAround(cell);
        for (const d of shuffle(digits.slice(), random)) {
            if (used & bitOf(d)) continue;
            values[cell] = d;
            if (fill(k + 1)) return true;
        }
        values[cell] = 0;
        return false;
    };
    return fill(0) ? values : null;
}

// 数字の盤から、和を書いた問題を作る
export function cluesFrom(size, black, values) {
    const clues = new Array(size * size).fill(null);
    for (let cell = 0; cell < size * size; cell++) {
        if (!black[cell]) continue;
        let right = 0;
        let down = 0;
        for (let at = cell + 1; at < size * size && Math.floor(at / size) === Math.floor(cell / size) && !black[at]; at++) right += values[at];
        for (let at = cell + size; at < size * size && !black[at]; at += size) down += values[at];
        clues[cell] = [down, right];
    }
    return { width: size, height: size, clues };
}

// 同じ続き（よこ・たて）にある数字
function usedInRuns(size, black, values, cell) {
    let used = 0;
    for (const step of [1, size]) {
        for (let at = cell - step; !black[at]; at -= step) used |= bitOf(values[at]);
        for (let at = cell + step; at < size * size && !black[at] && (step === size || Math.floor(at / size) === Math.floor(cell / size)); at += step) used |= bitOf(values[at]);
    }
    return used;
}

// 形を作って数字を埋め、理屈だけで解けるようになるまで、数字を1つずつ変えていく（焼きなまし。だめなら null）。
// 目安は、理屈でしぼったあとに決まらないマスの候補の数の合計（0 なら解ける）。増える変更も、はじめのうちは確率で残す。
// 時間がかかることがあるので、遊ぶときには呼ばない（scripts/build-pool.mjs が前もって作り、pool.js に並べる）
export function buildPuzzle(spec, random, { steps = 4000 } = {}) {
    const { size } = spec;
    const black = makePattern(size, spec, random);
    if (!black) return null;
    const values = fillDigits(size, black, random);
    if (!values) return null;
    let puzzle = cluesFrom(size, black, values);
    const { whites } = layout(puzzle);
    let solved = logicSolve(puzzle);
    for (let step = 0; step < steps && solved.remaining; step++) {
        const cell = whites[randomInt(random, whites.length)];
        const free = digitsOf(FULL & ~usedInRuns(size, black, values, cell) & ~bitOf(values[cell]));
        if (!free.length) continue;
        const before = values[cell];
        values[cell] = free[randomInt(random, free.length)];
        const next = cluesFrom(size, black, values);
        const nextSolved = logicSolve(next);
        const temperature = 4 * (1 - step / steps) + 0.3;
        if (nextSolved.spread <= solved.spread || random() < Math.exp((solved.spread - nextSolved.spread) / temperature)) {
            puzzle = next;
            solved = nextSolved;
        } else values[cell] = before;
    }
    return solved.remaining ? null : puzzle;
}

// ---------- 問題の組（pool.js）から選ぶ ----------

// 問題を文字にする（1行ずつ / で区切り、マスは , で区切る。白いマスは .、黒いマスは「たて-よこ」の和で、和のない黒は #）
export function encode(puzzle) {
    const rows = [];
    for (let r = 0; r < puzzle.height; r++) {
        rows.push(puzzle.clues.slice(r * puzzle.width, (r + 1) * puzzle.width)
            .map(c => (!c ? '.' : c[0] || c[1] ? `${c[0]}-${c[1]}` : '#')).join(','));
    }
    return rows.join('/');
}

export function decode(text) {
    const rows = text.split('/').map(row => row.split(','));
    const clues = rows.flat().map(token => (token === '.' ? null : token === '#' ? [0, 0] : token.split('-').map(Number)));
    return { width: rows[0].length, height: rows.length, clues };
}

// たてとよこを入れかえた問題（和の向きも入れかわる。解は1つのまま）
export function transpose(puzzle) {
    const { width: w, height: h, clues } = puzzle;
    const next = new Array(w * h);
    for (let r = 0; r < h; r++) for (let c = 0; c < w; c++) {
        const clue = clues[r * w + c];
        next[c * h + r] = clue ? [clue[1], clue[0]] : null;
    }
    return { width: h, height: w, clues: next };
}

// シードで、組から1問を選び、半分の確率でたてとよこを入れかえる（同じ引数なら同じ問題）
export function generate(seed, difficulty = 'normal') {
    const list = POOL[difficulty] ?? POOL.normal;
    const random = createRandom(seed);
    const puzzle = decode(list[randomInt(random, list.length)]);
    return random() < 0.5 ? transpose(puzzle) : puzzle;
}
