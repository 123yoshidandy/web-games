/**
 * 盤・塔・ドーム・職人の絵（SVG）。盤の画面・タイトルの絵・遊び方の図で、同じ描き方を使う
 * 真正面から少し見下ろした形（2.5D）：奥の行ほど上に描き、塔は上の面と正面の面で段の高さを見せる
 * 座標は「見る人から見た」マス（vx, vy）。回すのは ui.js の側で行う
 */

export const W = 100;      // マスの幅
export const D = 80;       // マスの奥行き（真上に近い角度から見下ろす）
export const L = 13;       // 1段の高さ（塔が奥のマスにかぶりすぎないように低めにする）
export const M = 10;       // 周りの余白
export const TOP = 3 * L + 48; // 3段の塔とドーム・職人の分の、上の余白
export const BASE = 16;    // 島の厚み（手前の縁）
export const SEAT_COLORS = ['#e9ad2c', '#d9483b', '#8d5ad8'];
const NS = 'http://www.w3.org/2000/svg';

export const boardWidth = (n) => M * 2 + n * W;
export const boardHeight = (n) => TOP + n * D + BASE + M;
export const cellX = (vx) => M + vx * W;
export const cellY = (vy) => TOP + vy * D;
// 段 k の塔の内側へのずれ（上の段ほど細い）
const insetX = (k) => k * 10;
const insetY = (k) => k * 9;
// 高さ h のマスの上の面の中心
export const topCenter = (vx, vy, h) => [cellX(vx) + W / 2, cellY(vy) + D / 2 - h * L];

export function el(tag, attrs = {}, parent = null) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
}

// 高さ h のマスの上の面の四角
export function topFace(vx, vy, h) {
    const x0 = cellX(vx);
    const y0 = cellY(vy);
    if (h === 0) return { x: x0 + 3, y: y0 + 3, width: W - 6, height: D - 6 };
    const ix = insetX(h);
    const iy = insetY(h);
    return { x: x0 + ix, y: y0 + iy - h * L, width: W - 2 * ix, height: D - 2 * iy };
}

// 盤の地（海の上の島と、草のマス）
export function drawGround(parent, n) {
    const w = n * W;
    const g = el('g', { class: 'ground' }, parent);
    el('rect', { class: 'island-side', x: M - 4, y: TOP - 4, width: w + 8, height: n * D + BASE + 4, rx: 12 }, g);
    el('rect', { class: 'island', x: M - 4, y: TOP - 4, width: w + 8, height: n * D + 8, rx: 12 }, g);
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) el('rect', { class: 'grass', ...topFace(x, y, 0), rx: 6 }, g);
    }
    return g;
}

// 1マスの塔（段とドーム）。fresh: 新しく建てた段（落ちてくるように見せる）
export function drawTower(parent, vx, vy, h, dome, fresh = null) {
    const g = el('g', { class: 'tower' }, parent);
    const x0 = cellX(vx);
    const y0 = cellY(vy);
    for (let k = 1; k <= h; k++) {
        const ix = insetX(k);
        const iy = insetY(k);
        const part = el('g', { class: `level l${k}` }, g);
        if (fresh === k) part.classList.add('drop');
        // 正面の面と、上の面
        el('rect', { class: 'front', x: x0 + ix, y: y0 + D - iy - k * L, width: W - 2 * ix, height: L }, part);
        el('rect', { class: 'top', x: x0 + ix, y: y0 + iy - k * L, width: W - 2 * ix, height: D - 2 * iy }, part);
        // 窓と戸（1段目は戸、上の段は窓）
        const fx = x0 + W / 2;
        const fy = y0 + D - iy - k * L;
        if (k === 1) el('path', { class: 'door', d: `M${fx - 5} ${fy + L} v-7 a5 5 0 0 1 10 0 v7 z` }, part);
        else el('rect', { class: 'window', x: fx - 5, y: fy + 3, width: 10, height: L - 6, rx: 2 }, part);
    }
    if (dome) {
        const [cx, cy] = topCenter(vx, vy, h);
        const r = (W - 2 * insetX(h)) / 2 - 5;
        const part = el('g', { class: 'dome' }, g);
        if (fresh === 'dome') part.classList.add('drop');
        el('ellipse', { class: 'dome-base', cx, cy: cy + 4, rx: r, ry: r * 0.35 }, part);
        el('path', { class: 'dome-cap', d: `M${cx - r} ${cy + 4} A${r} ${r * 0.95} 0 0 1 ${cx + r} ${cy + 4} A${r} ${r * 0.35} 0 0 1 ${cx - r} ${cy + 4} Z` }, part);
        el('path', { class: 'dome-shine', d: `M${cx - r * 0.55} ${cy - r * 0.2} A${r * 0.6} ${r * 0.6} 0 0 1 ${cx - r * 0.05} ${cy - r * 0.68}` }, part);
    }
    return g;
}

// 職人（原点が足もと。置き場所は transform で決める）
export function createWorker(seat, parent) {
    const g = el('g', { class: `worker seat${seat}` }, parent);
    el('ellipse', { class: 'worker-shadow', cx: 0, cy: 2, rx: 17, ry: 6 }, g);
    el('path', { class: 'worker-body', d: 'M-14 2 C-15 -14 -9 -26 0 -27 C9 -26 15 -14 14 2 Z', fill: SEAT_COLORS[seat] }, g);
    el('circle', { class: 'worker-head', cx: 0, cy: -36, r: 10, fill: SEAT_COLORS[seat] }, g);
    el('circle', { class: 'worker-shine', cx: -3.5, cy: -39, r: 3.2 }, g);
    return g;
}

export function placeWorker(g, vx, vy, h) {
    const [cx, cy] = topCenter(vx, vy, h);
    g.style.transform = `translate(${cx}px, ${cy + 4}px)`;
}

// 小さな盤の図（タイトル・遊び方）。heights: { 'x,y': h }、domes: ['x,y']、workers: [{ x, y, seat }]、marks: [{ x, y, kind }]
export function diagram({ n = 3, heights = {}, domes = [], workers = [], marks = [] } = {}) {
    const svg = el('svg', { viewBox: `0 0 ${boardWidth(n)} ${boardHeight(n)}`, class: 'board-svg' });
    drawGround(svg, n);
    const h = (x, y) => heights[`${x},${y}`] ?? 0;
    for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
            drawTower(svg, x, y, h(x, y), domes.includes(`${x},${y}`));
            marks.filter(m => m.x === x && m.y === y).forEach(m => drawMark(svg, x, y, h(x, y), m.kind));
        }
    }
    workers.forEach(w => placeWorker(createWorker(w.seat, svg), w.x, w.y, h(w.x, w.y)));
    return svg;
}

// 押せる先の印（上の面に重ねる）。kind: move・build・select・last
export function drawMark(parent, vx, vy, h, kind) {
    const face = topFace(vx, vy, h);
    const g = el('g', { class: `mark ${kind}` }, parent);
    el('rect', { class: 'mark-face', ...face, rx: h ? 3 : 6 }, g);
    const [cx, cy] = topCenter(vx, vy, h);
    if (kind === 'can' || kind === 'select') el('ellipse', { class: 'mark-ring', cx, cy: cy + 6, rx: 24, ry: 10 }, g);
    if (kind === 'move') el('circle', { class: 'mark-dot', cx, cy, r: 9 }, g);
    if (kind === 'build') el('rect', { class: 'mark-block', x: cx - 10, y: cy - 8, width: 20, height: 16, rx: 3 }, g);
    return g;
}
