/**
 * 絵（自作）：六角形の駒と、虫の絵（SVG のシンボル）
 * 駒は白（象牙色）と黒（墨色）。虫は種類ごとの色で描く
 */

import { KIND_NAMES } from './rules.js';

export const HEX_R = 30; // 盤の六角形の外接円の半径（盤の座標の単位）
export const SQRT3 = Math.sqrt(3);
export const KIND_COLORS = { Q: '#e2a521', B: '#8a5cc7', G: '#3fa65a', S: '#a0663a', A: '#2f78d0', L: '#d8423a', M: '#8e96a3', P: '#21a092' };

// 先の尖った六角形の頂点（中心が原点）
export function hexPoints(r = HEX_R) {
    return Array.from({ length: 6 }, (_, i) => {
        const a = Math.PI / 180 * (60 * i - 30);
        return `${(r * Math.cos(a)).toFixed(2)},${(r * Math.sin(a)).toFixed(2)}`;
    }).join(' ');
}

// 軸座標 → 盤の座標
export function cellCenter(key) {
    const [q, r] = key.split(',').map(Number);
    return { x: HEX_R * SQRT3 * (q + r / 2), y: HEX_R * 1.5 * r };
}

// 虫の絵（-10〜10 の座標。fill="currentColor" が種類の色）
const BUGS = {
    // 女王蜂：しま模様の胴と羽
    Q: `<ellipse cx="-5" cy="-5" rx="5" ry="3.4" fill="#fff" fill-opacity=".85" stroke="#0003" stroke-width=".6" transform="rotate(-25 -5 -5)"/>
        <ellipse cx="5" cy="-5" rx="5" ry="3.4" fill="#fff" fill-opacity=".85" stroke="#0003" stroke-width=".6" transform="rotate(25 5 -5)"/>
        <ellipse cx="0" cy="2" rx="4.6" ry="7" fill="currentColor"/>
        <path d="M-4.2 0h8.4M-4.4 3.4h8.8M-3.4 6.6h6.8" stroke="#2a1d06" stroke-width="1.5"/>
        <circle cx="0" cy="-6.4" r="2.8" fill="#2a1d06"/>
        <path d="M-2.6 -9.6l1.3-1.8 1.3 1.4 1.3-1.4 1.3 1.8z" fill="currentColor"/>`,
    // カブトムシ：丸い殻と角
    B: `<path d="M0 -9.5v3.5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        <path d="M-7 -3l-2.6-2M7 -3l2.6-2M-7.6 2l-2.8 0M7.6 2l2.8 0M-6.6 6l-2.4 2M6.6 6l2.4 2" stroke="#1d1430" stroke-width="1.3" stroke-linecap="round"/>
        <ellipse cx="0" cy="2" rx="7.4" ry="8" fill="currentColor"/>
        <path d="M0 -5.6v15.4" stroke="#1d1430" stroke-width="1.2"/>
        <ellipse cx="0" cy="-5" rx="4" ry="2.6" fill="#1d1430"/>`,
    // バッタ：細長い胴と大きな後ろ脚
    G: `<path d="M-3 4 L-8 -1 L-6 9M3 4 L8 -1 L6 9" fill="none" stroke="#173d20" stroke-width="1.6" stroke-linejoin="round"/>
        <ellipse cx="0" cy="1.5" rx="3.4" ry="8.6" fill="currentColor"/>
        <ellipse cx="0" cy="-7" rx="2.8" ry="2.6" fill="currentColor" stroke="#173d20" stroke-width=".8"/>
        <path d="M-1 -9l-3 -2.5M1 -9l3 -2.5" stroke="#173d20" stroke-width="1" stroke-linecap="round"/>`,
    // クモ：丸い胴と8本の脚
    S: `<path d="M-3 -2l-5 -5-2 2M3 -2l5 -5 2 2M-3.5 0.5l-6.5 -1.5M3.5 0.5l6.5 -1.5M-3.2 3l-6 3.4M3.2 3l6 3.4M-2 5l-3.6 5M2 5l3.6 5" fill="none" stroke="#3a2210" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"/>
        <circle cx="0" cy="3.4" r="4.6" fill="currentColor"/>
        <circle cx="0" cy="-3" r="3" fill="currentColor" stroke="#3a2210" stroke-width=".8"/>`,
    // アリ：3つの節と脚
    A: `<path d="M-1.5 -1l-6 -3M1.5 -1l6 -3M-1.8 1l-6.6 1.5M1.8 1l6.6 1.5M-1.5 2.6l-5 5M1.5 2.6l5 5M-1 -8.5l-3 -2.5M1 -8.5l3 -2.5" fill="none" stroke="#10284a" stroke-width="1.2" stroke-linecap="round"/>
        <circle cx="0" cy="-6.4" r="2.8" fill="currentColor"/>
        <ellipse cx="0" cy="0.4" rx="2.4" ry="3" fill="currentColor"/>
        <ellipse cx="0" cy="6.6" rx="3.6" ry="4.2" fill="currentColor"/>`,
    // テントウムシ：赤い殻に黒い点
    L: `<circle cx="0" cy="-6.4" r="3.2" fill="#1d1d1d"/>
        <circle cx="0" cy="1.4" r="7.8" fill="currentColor"/>
        <path d="M0 -6v15" stroke="#1d1d1d" stroke-width="1"/>
        <circle cx="-3.6" cy="-0.6" r="1.6" fill="#1d1d1d"/><circle cx="3.6" cy="-0.6" r="1.6" fill="#1d1d1d"/>
        <circle cx="-3.4" cy="4.6" r="1.5" fill="#1d1d1d"/><circle cx="3.4" cy="4.6" r="1.5" fill="#1d1d1d"/>`,
    // 蚊：細い胴、長い脚、針
    M: `<path d="M-1.5 -1l-7 -6M1.5 -1l7 -6M-1.5 1.5l-8 2M1.5 1.5l8 2M-1 3.5l-5 6.5M1 3.5l5 6.5" fill="none" stroke="#3c414a" stroke-width=".9" stroke-linecap="round"/>
        <ellipse cx="-4" cy="-2.6" rx="4.4" ry="1.8" fill="#fff" fill-opacity=".8" transform="rotate(30 -4 -2.6)"/>
        <ellipse cx="4" cy="-2.6" rx="4.4" ry="1.8" fill="#fff" fill-opacity=".8" transform="rotate(-30 4 -2.6)"/>
        <ellipse cx="0" cy="3" rx="1.8" ry="6" fill="currentColor"/>
        <circle cx="0" cy="-4.6" r="2.2" fill="currentColor"/>
        <path d="M0 -6.6v-4" stroke="#3c414a" stroke-width="1" stroke-linecap="round"/>`,
    // ダンゴムシ：節のある楕円
    P: `<ellipse cx="0" cy="0.5" rx="6.6" ry="8.8" fill="currentColor"/>
        <path d="M-6.2 -3.4h12.4M-6.6 0h13.2M-6.4 3.4h12.8M-5.2 6.6h10.4" stroke="#0d3f39" stroke-width="1.1"/>
        <path d="M-2 -8.4l-2 -2.4M2 -8.4l2 -2.4" stroke="#0d3f39" stroke-width="1" stroke-linecap="round"/>`
};

// <defs> に入れるシンボル（ページに1回だけ置く）
export function symbolsSvg() {
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${Object.entries(BUGS).map(([k, body]) => `<symbol id="bug-${k}" viewBox="-11 -11 22 22">${body}</symbol>`).join('')}</defs></svg>`;
}

// 盤の上の駒（中心が原点の <g> の中身）
export function pieceShape(kind, owner, r = HEX_R) {
    const size = r * 1.18;
    return `<polygon class="tile o${owner}" points="${hexPoints(r - 1.5)}"/>
        <use href="#bug-${kind}" x="${-size / 2}" y="${-size / 2}" width="${size}" height="${size}" style="color:${KIND_COLORS[kind]}"/>`;
}

// 手持ちの欄などに置く、1つの駒の絵（それだけで完結した SVG）
export function pieceSvg(kind, owner, cls = '') {
    const r = 20;
    return `<svg class="piece-svg ${cls}" viewBox="-21 -21 42 42" aria-label="${KIND_NAMES[kind]}">${pieceShape(kind, owner, r)}</svg>`;
}
