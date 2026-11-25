/**
 * 盤・くぼみ・玉・矢印の絵（SVG）。盤の画面・タイトルの絵で、同じ描き方を使う
 * 座標は「見る人から見た」マスの番号（自分が下）。回すのは ui.js の側で行う
 */

import { CELLS, SIZE, DIRS, BLACK } from './rules.js';

export const S = 40;               // となりのマスの中心の間隔
export const MARGIN = 34;
export const H = S * Math.sqrt(3) / 2;
export const R_MARBLE = 17;
export const WIDTH = 8 * S + MARGIN * 2;
export const HEIGHT = 8 * H + MARGIN * 2;
const NS = 'http://www.w3.org/2000/svg';

export const cellXY = (c) => {
    const { q, r } = CELLS[c];
    return [WIDTH / 2 + (q + r / 2) * S, HEIGHT / 2 + r * H];
};
// 向き d の画面の上の向き（単位）
export const dirXY = (d) => {
    const [dq, dr] = DIRS[d];
    const x = (dq + dr / 2);
    const y = dr * Math.sqrt(3) / 2;
    return [x, y];
};

export function el(tag, attrs = {}, parent = null) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (parent) parent.appendChild(node);
    return node;
}

// 玉の光沢（グラデーション）。ページに1回だけ、常に描かれる見えない SVG に入れる
// （隠れている画面の SVG に置くと、そこを参照したほかの SVG の塗りが消えるため）
export function addDefs() {
    if (document.getElementById('marble-defs')) return;
    const holder = el('svg', { id: 'marble-defs', width: 0, height: 0, 'aria-hidden': 'true' });
    holder.style.position = 'absolute';
    document.body.prepend(holder);
    const defs = el('defs', {}, holder);
    const grad = (id, stops) => {
        const g = el('radialGradient', { id, cx: '35%', cy: '30%', r: '75%' }, defs);
        stops.forEach(([o, c]) => el('stop', { offset: o, 'stop-color': c }, g));
    };
    grad('marble-black', [['0', '#6b6f78'], ['0.35', '#2a2c31'], ['1', '#07080a']]);
    grad('marble-white', [['0', '#ffffff'], ['0.5', '#ece6da'], ['1', '#b7ad9b']]);
    return defs;
}

// 六角形の板とくぼみ
export function drawBoard(svg) {
    const g = el('g', { class: 'plate' }, svg);
    const cx = WIDTH / 2;
    const cy = HEIGHT / 2;
    const rx = 4 * S + S * 0.82;
    const pts = [0, 60, 120, 180, 240, 300].map(a => {
        const t = (a * Math.PI) / 180;
        return `${cx + rx * Math.cos(t)},${cy + rx * Math.sin(t)}`;
    }).join(' ');
    el('polygon', { class: 'plate-edge', points: pts, transform: `translate(0 5)` }, g);
    el('polygon', { class: 'plate-top', points: pts }, g);
    for (let c = 0; c < SIZE; c++) {
        const [x, y] = cellXY(c);
        el('circle', { class: 'pit', cx: x, cy: y, r: R_MARBLE - 1 }, g);
    }
    return g;
}

// 玉（原点が中心。置き場所は transform で決める）
export function createMarble(color, parent) {
    const g = el('g', { class: `marble ${color === BLACK ? 'black' : 'white'}` }, parent);
    el('circle', { class: 'marble-shadow', cx: 1.5, cy: 2.5, r: R_MARBLE }, g);
    el('circle', { class: 'marble-body', cx: 0, cy: 0, r: R_MARBLE, fill: color === BLACK ? 'url(#marble-black)' : 'url(#marble-white)' }, g);
    return g;
}

export function placeMarble(g, c) {
    const [x, y] = cellXY(c);
    g.style.transform = `translate(${x}px, ${y}px)`;
}

// 矢印のボタン（中心 x, y）。d は押したときに送る向き、viewDir は画面の上の向き
export function drawArrow(parent, x, y, d, push, viewDir = d) {
    const g = el('g', { class: `arrow${push ? ' push' : ''}`, 'data-dir': d }, parent);
    el('circle', { class: 'arrow-hit', cx: x, cy: y, r: 21 }, g);
    el('circle', { class: 'arrow-bg', cx: x, cy: y, r: 15 }, g);
    const angle = (Math.atan2(dirXY(viewDir)[1], dirXY(viewDir)[0]) * 180) / Math.PI;
    el('path', { class: 'arrow-head', d: 'M-7 0 H6 M0 -6 L7 0 L0 6', transform: `translate(${x} ${y}) rotate(${angle})` }, g);
    return g;
}

// 小さな盤の図（タイトル）。board: 見る人の向きの配列（0・1・2）
export function diagram(board) {
    const svg = el('svg', { viewBox: `0 0 ${WIDTH} ${HEIGHT}`, class: 'board-svg' });
    addDefs();
    drawBoard(svg);
    board.forEach((v, c) => { if (v) placeMarble(createMarble(v, svg), c); });
    return svg;
}
