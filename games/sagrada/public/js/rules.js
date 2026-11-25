/**
 * 置き方の決まりと得点（DOM に依存しない純粋な関数）
 * window：20マスの配列（null か { id, color, value }）。pattern：窓枠（data.js の PATTERNS の1つ）
 */

import { ROWS, COLS, CELLS, COLORS, OBJECTIVES } from './data.js';

const rowOf = (i) => Math.floor(i / COLS);
const colOf = (i) => i % COLS;

export const isEdge = (i) => rowOf(i) === 0 || rowOf(i) === ROWS - 1 || colOf(i) === 0 || colOf(i) === COLS - 1;

// 縦横に隣り合うマス
export function orthogonal(i) {
    const r = rowOf(i), c = colOf(i);
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
        .filter(([y, x]) => y >= 0 && y < ROWS && x >= 0 && x < COLS).map(([y, x]) => y * COLS + x);
}

// 縦横斜めに隣り合うマス
export function around(i) {
    const r = rowOf(i), c = colOf(i);
    const list = [];
    for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
            const y = r + dy, x = c + dx;
            if ((dy || dx) && y >= 0 && y < ROWS && x >= 0 && x < COLS) list.push(y * COLS + x);
        }
    }
    return list;
}

export const diagonal = (i) => around(i).filter(j => rowOf(j) !== rowOf(i) && colOf(j) !== colOf(i));

// マスの制約に合うか
export function matchesCell(pattern, i, die, { ignoreColor = false, ignoreValue = false } = {}) {
    const cell = pattern.cells[i];
    if (!cell) return true;
    if (cell.color) return ignoreColor || cell.color === die.color;
    return ignoreValue || cell.value === die.value;
}

// die を i に置けるか
// options：ignoreColor / ignoreValue（マスの制約を無視）、alone（ほかのダイスと接しないマスに置く。コルクの定規）
export function canPlace(window, pattern, i, die, options = {}) {
    if (!Number.isInteger(i) || i < 0 || i >= CELLS || window[i]) return false;
    if (!matchesCell(pattern, i, die, options)) return false;
    // 縦横に同じ色・同じ目を並べない
    if (orthogonal(i).some(j => window[j] && (window[j].color === die.color || window[j].value === die.value))) return false;
    const empty = window.every(d => !d);
    if (options.alone) {
        if (around(i).some(j => window[j])) return false;
        return empty ? isEdge(i) : true;
    }
    // 最初のダイスは縁に、ほかはすでにあるダイスに縦横斜めで接する
    if (empty) return isEdge(i);
    return around(i).some(j => window[j]);
}

export function legalCells(window, pattern, die, options = {}) {
    const cells = [];
    for (let i = 0; i < CELLS; i++) if (canPlace(window, pattern, i, die, options)) cells.push(i);
    return cells;
}

// from のダイスを to へ動かせるか（動かす前に from から外して確かめる）
export function canMove(window, pattern, from, to, options = {}) {
    if (!Number.isInteger(from) || from < 0 || from >= CELLS || !window[from] || from === to) return false;
    const rest = [...window];
    const die = rest[from];
    rest[from] = null;
    return canPlace(rest, pattern, to, die, options);
}

export function applyMove(window, from, to) {
    const next = [...window];
    next[to] = next[from];
    next[from] = null;
    return next;
}

// ---- 得点 ----

const lines = (kind) => (kind === 'row'
    ? Array.from({ length: ROWS }, (_, r) => Array.from({ length: COLS }, (_, c) => r * COLS + c))
    : Array.from({ length: COLS }, (_, c) => Array.from({ length: ROWS }, (_, r) => r * COLS + c)));

// 埋まっていて、key（color か value）が重ならない行・列の数
function varietyLines(window, kind, key) {
    return lines(kind).filter(cells => {
        const dice = cells.map(i => window[i]);
        if (dice.some(d => !d)) return false;
        return new Set(dice.map(d => d[key])).size === dice.length;
    }).length;
}

const countValue = (window, v) => window.filter(d => d && d.value === v).length;

// 公共の目標の点
export function objectiveScore(window, id) {
    const points = OBJECTIVES[id].points;
    switch (id) {
        case 'rowColor': return varietyLines(window, 'row', 'color') * points;
        case 'colColor': return varietyLines(window, 'col', 'color') * points;
        case 'rowShade': return varietyLines(window, 'row', 'value') * points;
        case 'colShade': return varietyLines(window, 'col', 'value') * points;
        case 'light': return Math.min(countValue(window, 1), countValue(window, 2)) * points;
        case 'medium': return Math.min(countValue(window, 3), countValue(window, 4)) * points;
        case 'deep': return Math.min(countValue(window, 5), countValue(window, 6)) * points;
        case 'shadeVariety': return Math.min(...[1, 2, 3, 4, 5, 6].map(v => countValue(window, v))) * points;
        case 'colorVariety': return Math.min(...COLORS.map(c => window.filter(d => d && d.color === c).length)) * points;
        case 'diagonals':
            // 斜めに同じ色のダイスと接しているダイスの数
            return window.filter((d, i) => d && diagonal(i).some(j => window[j] && window[j].color === d.color)).length * points;
        default: return 0;
    }
}

// 個人の目標：その色のダイスの目の合計
export const privateScore = (window, color) => window.reduce((s, d) => s + (d && d.color === color ? d.value : 0), 0);

export const openSpaces = (window) => window.filter(d => !d).length;

// 点の内訳。privates：個人の目標の色（1人用は2枚のうち点の多い方を使う）
export function scoreWindow(window, { objectives, privates, tokens = 0, openPenalty = 1 }) {
    const publics = objectives.map(id => objectiveScore(window, id));
    const privateBest = Math.max(...privates.map(color => privateScore(window, color)));
    const open = openSpaces(window);
    const total = publics.reduce((s, x) => s + x, 0) + privateBest + tokens - open * openPenalty;
    return { publics, private: privateBest, tokens, open: -open * openPenalty, total };
}
