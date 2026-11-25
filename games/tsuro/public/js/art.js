/**
 * 絵（すべて自作の SVG。公式の画像は使っていない）
 * 墨と金：盤は漆の黒、タイルは墨色の地に金の道。駒は8色の石で、通った道をその色でなぞる
 * 座標は1マス 100。盤は 600×600 で、縁の外に駒を置く余白を取る
 */

import { POINT_XY, SIDE, pathsOf, rowOf, colOf } from './tiles.js';

export const U = 100;
export const PAD = 18;
export const COLORS = ['#e5543d', '#f4efe4', '#4d8fe0', '#4fbf74', '#a77be0', '#ef8fb1', '#5fd0d0', '#b9c46a'];
export const COLOR_NAMES = ['朱', '胡粉', '藍', '若竹', '藤', '桃', '水浅葱', '萌黄'];

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    log: '<path d="M5 6h14M5 12h14M5 18h9"/>',
    rotate: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>'
};

export function symbolsSvg() {
    const lines = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
        <linearGradient id="g-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#3a332c"/><stop offset="1" stop-color="#231e1a"/></linearGradient>
        <linearGradient id="g-board" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1d1915"/><stop offset="1" stop-color="#0f0d0b"/></linearGradient>
        <radialGradient id="g-stone" cx=".35" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></radialGradient>
        ${lines}</defs></svg>`;
}

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// ---- 道の形 ----

const NORMAL = [[0, 1], [-1, 0], [0, -1], [1, 0]];  // 辺ごとの、マスの内側への向き

export function pointXY(cell, p) {
    return [colOf(cell) * U + POINT_XY[p][0] * U, rowOf(cell) * U + POINT_XY[p][1] * U];
}

// マスの中の端点 a から b への曲線（ox, oy はマスの左上）。同じ辺の2点は小さく、ほかは大きく曲げる
function curve(ox, oy, a, b, { move = true } = {}) {
    const [ax, ay] = [ox + POINT_XY[a][0] * U, oy + POINT_XY[a][1] * U];
    const [bx, by] = [ox + POINT_XY[b][0] * U, oy + POINT_XY[b][1] * U];
    const k = SIDE[a] === SIDE[b] ? 30 : 40;
    const [nax, nay] = NORMAL[SIDE[a]];
    const [nbx, nby] = NORMAL[SIDE[b]];
    const head = move ? `M${ax.toFixed(1)} ${ay.toFixed(1)}` : '';
    return `${head}C${(ax + nax * k).toFixed(1)} ${(ay + nay * k).toFixed(1)} ${(bx + nbx * k).toFixed(1)} ${(by + nby * k).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`;
}

// 通った道（[[cell, 入る端点, 出る端点], ...]）を1本の線にする
export function trailPath(segs) {
    return segs.map(([cell, a, b], i) => curve(colOf(cell) * U, rowOf(cell) * U, a, b, { move: i === 0 })).join('');
}

// タイル1枚（ox, oy に置く）。道は墨の縁取りのあとに金の線を引き、交わりは後から引いた道が上に見える
export function tileGroup(tile, rot, ox = 0, oy = 0, { cls = '' } = {}) {
    const pairs = pathsOf(tile, rot);
    const d = pairs.map(([a, b]) => curve(ox, oy, a, b));
    const lines = d.map(path => `<path d="${path}" class="road-ink"/><path d="${path}" class="road-gold"/>`).join('');
    return `<g class="tile-g ${cls}"><rect x="${ox + 2}" y="${oy + 2}" width="${U - 4}" height="${U - 4}" rx="7" class="tile-face"/>
        <rect x="${ox + 6}" y="${oy + 6}" width="${U - 12}" height="${U - 12}" rx="4" class="tile-rim"/>${lines}</g>`;
}

// 手札などに使う、タイル1枚の SVG
export function tileSvg(tile, rot, { cls = '' } = {}) {
    return `<svg class="tile-svg ${cls}" viewBox="0 0 100 100" aria-hidden="true">${tileGroup(tile, rot)}</svg>`;
}

// 駒（石）
export function stoneSvg(seat, x, y, { r = 11, cls = '', id = '' } = {}) {
    return `<g class="stone ${cls}" ${id ? `id="${id}"` : ''} transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">
        <circle r="${r}" fill="${COLORS[seat]}" class="stone-body"/><circle r="${r}" fill="url(#g-stone)"/></g>`;
}

// 竜のタイルの印
export const dragonBadge = (cls = '') => `<span class="dragon ${cls}" title="竜のタイル" aria-label="竜のタイル">竜</span>`;

// 色の印（名前の前の小さな石）
export const dotHtml = (seat) => `<span class="dot" style="--c:${COLORS[seat]}"></span>`;
