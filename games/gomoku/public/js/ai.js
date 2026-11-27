/**
 * 五目並べの読み（DOM に依存しない。乱数は使わない）
 *
 * 形の表
 * - 点に石を置いたとして、4つの方向それぞれで、前後4つずつ（9マス）の並びから形を決める
 *   形：五（FIVE）・活四（OPEN4：止められない四）・四（FOUR）・活三（OPEN3：次に活四になる三）・三・活二・二
 * - 9マスのうち真ん中を除く8マス（空き・自分・ふさがり）の組は 3^8＝6561 通りしかないので、最初に表を作る
 *   四は「五になる点の数」、三は「1つ足すと四・活四になるか」、二は「1つ足すと三・活三になるか」で決める（表の中を引き直して作る）
 *
 * 探索
 * - 候補は、石から2マス以内の空き点。攻め（自分の形）と守り（相手がそこに置いたときの形）の値で並べる
 * - 勝ちの手（五）があれば打つ。相手に五の点（四）があれば、そこを止めるしかない（読みの手数を減らさない）
 * - VCF：四を続けて相手に止めさせ、最後に止められない形（五・活四・四四）を作る勝ち筋を探す
 * - αβ探索（ネガマックス）：候補の上位だけを読み、葉では5マスの枠ごとの石の数と、残った脅威（活三・四）で局面を見積もる
 * 5マスの枠の数は、石を置く・外すたびに差分で直すので速い
 */

import { EMPTY, BLACK, WHITE, DIRECTIONS, centerPoint } from './rules.js';

// ---- 形 ----

export const SHAPE = { NONE: 0, TWO: 1, OPEN2: 2, THREE: 3, OPEN3: 4, FOUR: 5, OPEN4: 6, FIVE: 7 };
const S = SHAPE;
const R = 4;                      // 真ん中から前後に見るマス
const POW = [1, 3, 9, 27, 81, 243, 729, 2187];

// 8マスの組の番号から、9マスの並び（0 空き・1 自分・2 ふさがり。真ん中は自分）
function decode(index) {
    const cells = new Array(2 * R + 1);
    let k = 0;
    for (let i = 0; i < cells.length; i++) {
        if (i === R) {
            cells[i] = 1;
            continue;
        }
        cells[i] = Math.floor(index / POW[k]) % 3;
        k++;
    }
    return cells;
}

// 真ん中を含む自分の石の続きが、5つ以上か
function fiveThroughCenter(cells) {
    let lo = R;
    let hi = R;
    while (lo > 0 && cells[lo - 1] === 1) lo--;
    while (hi < cells.length - 1 && cells[hi + 1] === 1) hi++;
    return hi - lo + 1 >= 5;
}

const SHAPE_TABLE = new Int8Array(3 ** 8).fill(-1);

function shapeOf(index) {
    if (SHAPE_TABLE[index] >= 0) return SHAPE_TABLE[index];
    const cells = decode(index);
    let result;
    if (fiveThroughCenter(cells)) {
        result = S.FIVE;
    } else {
        // 空きのマスに自分の石を足したときの、組の番号
        const adds = [];
        let k = 0;
        for (let i = 0; i < cells.length; i++) {
            if (i === R) continue;
            if (cells[i] === 0) adds.push({ i, next: index + POW[k] });
            k++;
        }
        const fivePoints = adds.filter(({ i }) => {
            cells[i] = 1;
            const five = fiveThroughCenter(cells);
            cells[i] = 0;
            return five;
        }).length;
        if (fivePoints >= 2) result = S.OPEN4;
        else if (fivePoints === 1) result = S.FOUR;
        else {
            const after = adds.map(({ next }) => shapeOf(next));
            if (after.includes(S.OPEN4)) result = S.OPEN3;
            else if (after.includes(S.FOUR)) result = S.THREE;
            else if (after.includes(S.OPEN3)) result = S.OPEN2;
            else if (after.includes(S.THREE)) result = S.TWO;
            else result = S.NONE;
        }
    }
    SHAPE_TABLE[index] = result;
    return result;
}
for (let i = 0; i < SHAPE_TABLE.length; i++) shapeOf(i);

// 4つの方向の形から、その点の値（攻めの強さ）
export const VALUE = { FIVE: 1e7, WIN: 1e6, FOUR_THREE: 2e5, DOUBLE_THREE: 5e4, FOUR: 1200, OPEN3: 1000 };
function pointValue(counts) {
    if (counts[S.FIVE]) return VALUE.FIVE;
    if (counts[S.OPEN4] || counts[S.FOUR] >= 2) return VALUE.WIN;
    if (counts[S.FOUR] && counts[S.OPEN3]) return VALUE.FOUR_THREE;
    if (counts[S.OPEN3] >= 2) return VALUE.DOUBLE_THREE;
    return counts[S.FOUR] * VALUE.FOUR + counts[S.OPEN3] * VALUE.OPEN3 + counts[S.THREE] * 150 + counts[S.OPEN2] * 120 + counts[S.TWO] * 15 + 1;
}

// ---- 盤（探索用） ----

// 盤の大きさごとの下ごしらえ：点ごと・方向ごとの前後8マスの番号（盤の外は -1）、5マスの枠、点が入る枠
const PREP = new Map();
function prepare(size) {
    if (PREP.has(size)) return PREP.get(size);
    const n = size * size;
    const lines = new Int16Array(n * 4 * 8);
    for (let sq = 0; sq < n; sq++) {
        const r = Math.floor(sq / size);
        const c = sq % size;
        DIRECTIONS.forEach(([dr, dc], d) => {
            let k = 0;
            for (let step = -R; step <= R; step++) {
                if (step === 0) continue;
                const rr = r + dr * step;
                const cc = c + dc * step;
                lines[(sq * 4 + d) * 8 + k] = rr >= 0 && rr < size && cc >= 0 && cc < size ? rr * size + cc : -1;
                k++;
            }
        });
    }
    const windows = [];
    for (let r = 0; r < size; r++) {
        for (let c = 0; c < size; c++) {
            for (const [dr, dc] of DIRECTIONS) {
                const er = r + dr * 4;
                const ec = c + dc * 4;
                if (er < 0 || er >= size || ec < 0 || ec >= size) continue;
                windows.push(Array.from({ length: 5 }, (_, i) => (r + dr * i) * size + c + dc * i));
            }
        }
    }
    const cellWindows = Array.from({ length: n }, () => []);
    windows.forEach((cells, w) => cells.forEach(sq => cellWindows[sq].push(w)));
    // 2マス以内の点
    const near = Array.from({ length: n }, (_, sq) => {
        const list = [];
        const r = Math.floor(sq / size);
        const c = sq % size;
        for (let dr = -2; dr <= 2; dr++) {
            for (let dc = -2; dc <= 2; dc++) {
                if ((!dr && !dc) || r + dr < 0 || r + dr >= size || c + dc < 0 || c + dc >= size) continue;
                list.push((r + dr) * size + c + dc);
            }
        }
        return list;
    });
    const prep = { lines, windowCount: windows.length, cellWindows: cellWindows.map(list => Int32Array.from(list)), near };
    PREP.set(size, prep);
    return prep;
}

// 5マスの枠の値（同じ色だけが k 個入った枠）
const WINDOW_VALUE = [0, 2, 14, 90, 650, 50000];

export class Position {
    constructor(board, size) {
        this.size = size;
        this.prep = prepare(size);
        this.board = Int8Array.from(board);
        this.counts = [null, new Int8Array(this.prep.windowCount), new Int8Array(this.prep.windowCount)];
        this.nearCount = new Int16Array(size * size);
        this.score = 0;           // 黒から見た枠の値の合計
        this.stones = 0;
        const original = this.board;
        this.board = new Int8Array(size * size);
        original.forEach((color, sq) => { if (color) this.place(sq, color); });
    }

    windowValue(w) {
        const b = this.counts[BLACK][w];
        const wh = this.counts[WHITE][w];
        if (b && wh) return 0;
        return b ? WINDOW_VALUE[b] : -WINDOW_VALUE[wh];
    }

    place(sq, color) {
        for (const w of this.prep.cellWindows[sq]) {
            this.score -= this.windowValue(w);
            this.counts[color][w]++;
            this.score += this.windowValue(w);
        }
        for (const s of this.prep.near[sq]) this.nearCount[s]++;
        this.board[sq] = color;
        this.stones++;
    }

    remove(sq) {
        const color = this.board[sq];
        for (const w of this.prep.cellWindows[sq]) {
            this.score -= this.windowValue(w);
            this.counts[color][w]--;
            this.score += this.windowValue(w);
        }
        for (const s of this.prep.near[sq]) this.nearCount[s]--;
        this.board[sq] = EMPTY;
        this.stones--;
    }

    // sq に color を置いたときの、方向 d の形
    shape(sq, color, d) {
        const { lines } = this.prep;
        const base = (sq * 4 + d) * 8;
        let index = 0;
        for (let k = 0; k < 8; k++) {
            const s = lines[base + k];
            const v = s < 0 ? 2 : this.board[s] === EMPTY ? 0 : this.board[s] === color ? 1 : 2;
            index += v * POW[k];
        }
        return SHAPE_TABLE[index];
    }

    // sq に color を置いたときの値（4方向の形をまとめる）
    value(sq, color) {
        const counts = [0, 0, 0, 0, 0, 0, 0, 0];
        for (let d = 0; d < 4; d++) counts[this.shape(sq, color, d)]++;
        return pointValue(counts);
    }

    // 候補の点（石から2マス以内の空き。石がなければ真ん中）
    candidates() {
        const list = [];
        if (this.stones === 0) return [centerPoint(this.size)];
        for (let sq = 0; sq < this.board.length; sq++) {
            if (this.board[sq] === EMPTY && this.nearCount[sq] > 0) list.push(sq);
        }
        return list;
    }

    // 候補ごとの攻め（color の値）と守り（相手の値）。五の点と、相手の五の点も集める
    scan(color) {
        const other = 3 - color;
        const moves = [];
        const wins = [];
        const threats = [];       // 相手が置けば五になる点（相手の四）
        let bestAttack = 0;
        let bestDefense = 0;
        for (const sq of this.candidates()) {
            const attack = this.value(sq, color);
            const defense = this.value(sq, other);
            if (attack >= VALUE.FIVE) wins.push(sq);
            if (defense >= VALUE.FIVE) threats.push(sq);
            if (attack > bestAttack) bestAttack = attack;
            if (defense > bestDefense) bestDefense = defense;
            moves.push({ sq, attack, defense });
        }
        return { moves, wins, threats, bestAttack, bestDefense };
    }

    hash() {
        let h = 2166136261;
        for (let i = 0; i < this.board.length; i++) h = Math.imul(h ^ (this.board[i] + i * 3), 16777619);
        return h >>> 0;
    }
}

// ---- VCF（四の連続で勝つ筋） ----

// color が四を続けて勝てるなら、その手順（color の手と相手の止めを交互に）を返す。なければ null
// 前提：相手に五の点（四）がない。nodes は読む手の上限（{ left }）
export function findVcf(pos, color, depth, budget = { left: 4000 }) {
    if (depth <= 0 || budget.left <= 0) return null;
    const other = 3 - color;
    const fours = [];
    for (const sq of pos.candidates()) {
        let four = false;
        let win = false;
        const counts = [0, 0, 0, 0, 0, 0, 0, 0];
        for (let d = 0; d < 4; d++) {
            const s = pos.shape(sq, color, d);
            counts[s]++;
            if (s >= S.FOUR) four = true;
        }
        if (!four) continue;
        const value = pointValue(counts);
        if (value >= VALUE.WIN) win = true;
        if (win) return [sq];
        fours.push({ sq, value });
    }
    fours.sort((a, b) => b.value - a.value);
    for (const { sq } of fours) {
        if (--budget.left <= 0) return null;
        pos.place(sq, color);
        // 相手が止める点（五の点。四なので1つ）
        let block = -1;
        for (const s of pos.candidates()) {
            if (pos.value(s, color) >= VALUE.FIVE) {
                block = s;
                break;
            }
        }
        let line = null;
        if (block >= 0) {
            pos.place(block, other);
            // 止めた石で相手に四ができたら、この筋はやめる
            let counter = false;
            for (let d = 0; d < 4 && !counter; d++) if (pos.shape(block, other, d) >= S.FOUR) counter = true;
            if (!counter) {
                const rest = findVcf(pos, color, depth - 1, budget);
                if (rest) line = [sq, block, ...rest];
            }
            pos.remove(block);
        }
        pos.remove(sq);
        if (line) return line;
    }
    return null;
}

// ---- αβ探索 ----

const WIN_SCORE = 1e9;
const MAX_PLY = 30;

// 葉の見積もり（手番の color から見た値）
function evaluate(pos, color, info) {
    const base = color === BLACK ? pos.score : -pos.score;
    // 手番の側が止められない形を作れるなら、ほぼ勝ち
    if (info.bestAttack >= VALUE.WIN && info.threats.length === 0) return WIN_SCORE / 2;
    let value = base;
    // 手番の側の攻めの余地と、相手の脅威（相手の手番なら打てる形）
    value += Math.min(info.bestAttack, VALUE.FOUR_THREE) * 0.2;
    if (info.threats.length === 0) value -= Math.min(info.bestDefense, VALUE.FOUR_THREE) * 0.1;
    return value;
}

function order(info, width, forced) {
    if (forced) return forced;
    const list = info.moves.map(m => ({ sq: m.sq, key: m.attack * 1.1 + m.defense }));
    list.sort((a, b) => b.key - a.key || a.sq - b.sq);
    return list.slice(0, width).map(m => m.sq);
}

function negamax(pos, color, depth, alpha, beta, ply, ctx) {
    ctx.nodes++;
    const info = pos.scan(color);
    if (info.wins.length) return WIN_SCORE - ply;
    if (info.threats.length >= 2) {
        // 相手の五の点が2つ：止めきれない（同じ点で止まる形もまれにあるが、負けとみる）
        return -(WIN_SCORE - ply - 1);
    }
    if (info.moves.length === 0) return 0;
    const forced = info.threats.length === 1 ? [info.threats[0]] : null;
    if (!forced && info.bestAttack >= VALUE.WIN) return WIN_SCORE - ply - 2;
    if ((depth <= 0 && !forced) || ply >= MAX_PLY || ctx.nodes >= ctx.maxNodes || ctx.timeUp()) return evaluate(pos, color, info);
    const width = ctx.widths[Math.min(ply, ctx.widths.length - 1)];
    let best = -Infinity;
    for (const sq of order(info, width, forced)) {
        pos.place(sq, color);
        // 止めるしかない手は、読みの手数に数えない
        const value = -negamax(pos, 3 - color, forced ? depth : depth - 1, -beta, -alpha, ply + 1, ctx);
        pos.remove(sq);
        if (value > best) best = value;
        if (value > alpha) alpha = value;
        if (alpha >= beta) break;
    }
    return best;
}

// 強さごとの読み方
export const SEARCH = {
    easy: { depth: 0, vcf: 0, widths: [6], maxNodes: 0, noise: 0.4, defense: 0.8, blockRate: 0.85 },
    normal: { depth: 3, vcf: 6, vcfNodes: 1500, widths: [10, 8, 6], maxNodes: 8000, oppVcf: 0, maxMs: 1500 },
    strong: { depth: 6, vcf: 16, vcfNodes: 8000, widths: [14, 10, 8, 6, 5, 4], maxNodes: 150000, oppVcf: 10, maxMs: 2500 }
};

// 盤から作るシードの乱数（同じ局面なら同じ値）
function seeded(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * 手を選ぶ。board（0 空き・1 黒・2 白）、color は手番の色
 * options：level（easy・normal・strong）、maxMs（読みを打ち切る時間）
 * 返す：{ sq, reason（'win'・'block'・'vcf'・'search'・'easy'）, line（VCF の手順） }
 */
export function chooseMove(board, size, color, { level = 'normal', maxMs = 3000, now = () => Date.now() } = {}) {
    const conf = SEARCH[level] ?? SEARCH.normal;
    const pos = new Position(board, size);
    const random = seeded(pos.hash() ^ (pos.stones * 2654435761));
    const info = pos.scan(color);
    if (info.moves.length === 0) return null;
    if (pos.stones === 0) return { sq: centerPoint(size), reason: 'open' };
    if (info.wins.length) return { sq: info.wins[0], reason: 'win' };

    if (level === 'easy') return chooseEasy(info, conf, random);

    if (info.threats.length) return { sq: info.threats[0], reason: 'block' };
    if (conf.vcf) {
        const line = findVcf(pos, color, conf.vcf, { left: conf.vcfNodes });
        if (line) return { sq: line[0], reason: 'vcf', line };
    }

    const started = now();
    const ctx = {
        nodes: 0,
        maxNodes: conf.maxNodes,
        widths: conf.widths,
        timeUp: () => now() - started > Math.min(maxMs, conf.maxMs ?? maxMs)
    };
    const roots = order(info, conf.widths[0] + 2, null);
    // 相手が四を続けて勝てる筋が残る手は避ける（つよいだけ）
    const opponentVcf = (sq) => {
        if (!conf.oppVcf) return false;
        pos.place(sq, color);
        const after = pos.scan(3 - color);
        // こちらに四があれば、相手はまず止めるので、相手の VCF は始まらない
        const result = after.threats.length === 0 && Boolean(findVcf(pos, 3 - color, conf.oppVcf, { left: 1500 }));
        pos.remove(sq);
        return result;
    };
    const scored = [];
    let alpha = -Infinity;
    for (const sq of roots) {
        pos.place(sq, color);
        const value = -negamax(pos, 3 - color, conf.depth - 1, -Infinity, -alpha + 1, 1, ctx);
        pos.remove(sq);
        scored.push({ sq, value, tie: random() });
        if (value > alpha) alpha = value;
    }
    scored.sort((a, b) => b.value - a.value || b.tie - a.tie);
    for (const entry of scored.slice(0, 5)) {
        if (entry.value <= -WIN_SCORE / 2) break;
        if (!opponentVcf(entry.sq)) return { sq: entry.sq, reason: 'search', value: entry.value };
    }
    return { sq: scored[0].sq, reason: 'search', value: scored[0].value };
}

// やさしい：五は逃さないが、相手の四を見落とすことがあり、上位の手から乱数で選ぶ。守りを軽く見る
function chooseEasy(info, conf, random) {
    if (info.threats.length && random() < conf.blockRate) return { sq: info.threats[0], reason: 'block' };
    const list = info.moves.map(m => ({ sq: m.sq, key: (m.attack + m.defense * conf.defense) * (1 + (random() - 0.5) * 2 * conf.noise) }));
    list.sort((a, b) => b.key - a.key || a.sq - b.sq);
    const top = list.slice(0, conf.widths[0]);
    // 上ほど選ばれやすい
    const pick = Math.floor(random() ** 2.2 * top.length);
    return { sq: top[pick].sq, reason: 'easy' };
}
