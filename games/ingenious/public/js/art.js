/**
 * 絵（すべて自作の SVG。公式の画像は使っていない）
 * 6色の記号は、色覚に配慮して形も変える：赤は8つのとがりの星、緑は丸、青は六芒星、橙は六角、黄は太陽、紫は輪
 * 記号は symbol としてページに一度だけ入れ、use で使い回す（viewBox -10 -10 20 20）
 * 線のアイコン（ホーム・遊び方など）は viewBox 24×24 で、色は currentColor
 */

import { COLORS } from './colors.js';

// 平らな辺を上にした六角の、中心 0,0・中心から角まで s の頂点
export function hexPoints(s) {
    return Array.from({ length: 6 }, (_, i) => {
        const a = Math.PI / 3 * i;
        return `${(s * Math.cos(a)).toFixed(2)},${(s * Math.sin(a)).toFixed(2)}`;
    }).join(' ');
}

const star = (points, outer, inner) => Array.from({ length: points * 2 }, (_, i) => {
    const r = i % 2 ? inner : outer;
    const a = Math.PI / points * i - Math.PI / 2;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

const pointyHex = (r) => Array.from({ length: 6 }, (_, i) => {
    const a = Math.PI / 3 * i - Math.PI / 2;
    return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
}).join(' ');

const SHAPES = {
    red: (c) => `<polygon points="${star(8, 9, 4.6)}" fill="${c}" stroke="#fff" stroke-width=".6" stroke-opacity=".5"/>`,
    green: (c) => `<circle r="7.2" fill="${c}"/><circle cx="-2.4" cy="-2.6" r="2" fill="#fff" opacity=".35"/>`,
    blue: (c) => `<polygon points="${star(6, 9.2, 5)}" fill="${c}"/>`,
    orange: (c) => `<polygon points="${pointyHex(8)}" fill="${c}"/><polygon points="${pointyHex(4)}" fill="#fff" opacity=".22"/>`,
    yellow: (c) => `<g fill="${c}"><circle r="4.6"/>${Array.from({ length: 8 }, (_, i) => `<polygon points="-1.4,-6 1.4,-6 0,-9.4" transform="rotate(${i * 45})"/>`).join('')}</g>`,
    purple: (c) => `<circle r="6.2" fill="none" stroke="${c}" stroke-width="3.6"/>`
};

// 線のアイコン（24×24）
const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    log: '<path d="M5 6h14M5 12h14M5 18h9"/>',
    rotate: '<path d="M20 12a8 8 0 1 1-2.6-5.9"/><path d="M20 4v5h-5"/>',
    zoomOut: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21M7.5 10.5h6"/>',
    swap: '<path d="M4 8h13l-3-3M20 16H7l3 3"/>'
};

export function symbolsSvg() {
    const shapes = Object.entries(SHAPES).map(([key, draw]) => `<symbol id="s-${key}" viewBox="-10 -10 20 20" overflow="visible">${draw(COLORS[key].hex)}</symbol>`).join('');
    const icons = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${shapes}${icons}</defs></svg>`;
}

// 単独で使う本体（アイコンの画像を作るときに使う）
export const shapeBody = (color) => SHAPES[color](COLORS[color].hex);

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// 記号（中心 0,0、大きさ size）。SVG の中で使う
export const symbolUse = (color, size) => `<use href="#s-${color}" x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}"/>`;

// 記号だけの小さな SVG（得点の横などに置く）
export const symbolIcon = (color, cls = '') => `<svg class="sym ${cls}" viewBox="-10 -10 20 20" aria-label="${COLORS[color].name}"><use href="#s-${color}" x="-10" y="-10" width="20" height="20"/></svg>`;

// 手札のタイル1枚（縦に2つの六角。上が colors[0]）
export function tileSvg(colors, cls = '') {
    const s = 10;
    const h = Math.sqrt(3) * s;
    const cell = (color, y) => `<g transform="translate(0 ${y.toFixed(2)})"><polygon class="tile-hex" points="${hexPoints(s * 0.96)}"/>${symbolUse(color, 13)}</g>`;
    return `<svg class="hand-tile ${cls}" viewBox="${-s - 1} ${-h / 2 - 1} ${2 * s + 2} ${2 * h + 2}" aria-label="${COLORS[colors[0]].name}と${COLORS[colors[1]].name}">
        ${cell(colors[0], 0)}${cell(colors[1], h)}</svg>`;
}
