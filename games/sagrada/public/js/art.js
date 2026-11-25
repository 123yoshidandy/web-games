/**
 * 絵（自作の SVG と CSS。ステンドグラス風：鉛の線で区切った、光を通す色ガラス）
 * 何度も使う図柄は symbol としてページに一度だけ入れ、use で使い回す
 */

import { COLOR_INFO, COLORS, PATTERNS } from './data.js';

const SYMBOLS = {
    home: '<path d="M3.5 11.5 L12 4 L20.5 11.5"/><path d="M6 10 v10 h12 v-10"/><path d="M10 20 v-5.5 h4 v5.5"/>',
    log: '<path d="M6 3.5 h9 l3.5 3.5 v13.5 h-12.5 Z"/><path d="M9 10 h6.5 M9 13.5 h6.5 M9 17 h4.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4 q0.4-2.6 2.6-2.6 q2.6 0 2.6 2.4 q0 1.6-1.8 2.4 q-1 0.5-1 1.9"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>',
    // 好意トークン（小さな宝石）
    token: '<path d="M12 3 L19 9 L12 21 L5 9 Z"/><path d="M5 9 H19 M9 9 L12 3 L15 9 L12 21"/>',
    // 道具（はさみ形のやっとこ）
    tool: '<path d="M8 3 L13 12 M16 3 L11 12"/><circle cx="8.5" cy="17" r="3.2"/><circle cx="15.5" cy="17" r="3.2"/><path d="M11 12 L9.6 14.2 M13 12 L14.4 14.2"/>',
    // 目標（バラ窓）
    target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3"/><path d="M12 3.5 V9 M12 15 V20.5 M3.5 12 H9 M15 12 H20.5 M6 6 L9.9 9.9 M14.1 14.1 L18 18 M18 6 L14.1 9.9 M9.9 14.1 L6 18"/>',
    check: '<path d="M5 12.5 L10 17.5 L19 7"/>'
};

export function symbolsSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${Object.entries(SYMBOLS).map(([id, body]) =>
        `<symbol id="i-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`).join('')}</svg>`;
}

export const icon = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

// 目の点の位置（3×3 の格子。0〜8）
const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const pipXY = (k) => [6 + (k % 3) * 6, 6 + Math.floor(k / 3) * 6];

export function pipsSvg(value, cls = 'pips') {
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${PIPS[value].map(k => {
        const [x, y] = pipXY(k);
        return `<circle cx="${x}" cy="${y}" r="2.1"/>`;
    }).join('')}</svg>`;
}

// ダイス
export function dieHtml(die, { cls = '', attrs = '' } = {}) {
    return `<div class="die c-${die.color} ${cls}" ${attrs} aria-label="${COLOR_INFO[die.color].name}の${die.value}">${pipsSvg(die.value)}</div>`;
}

// 窓のマスの制約（色の淡いガラスか、目の型押し）
export function cellFaceHtml(cell) {
    if (!cell) return '';
    if (cell.color) return '';
    return pipsSvg(cell.value, 'pips mark');
}

export const cellClass = (cell) => (cell ? (cell.color ? `r-${cell.color}` : 'r-value') : 'r-none');

// 窓（20マス）。marks：光らせるマスの集合、selected：選んだマス
export function windowHtml(window, patternId, { cls = '', marks = new Set(), selected = null, attrs = '' } = {}) {
    const pattern = PATTERNS[patternId];
    return `<div class="window ${cls}" ${attrs}>${pattern.cells.map((cell, i) => {
        const d = window[i];
        const c = `cell ${cellClass(cell)}${marks.has(i) ? ' can' : ''}${selected === i ? ' sel' : ''}`;
        return `<div class="${c}" data-cell="${i}">${d ? dieHtml(d) : cellFaceHtml(cell)}</div>`;
    }).join('')}</div>`;
}

// 難しさの点（好意トークンの数）
export const difficultyDots = (n) => `<span class="diff" aria-label="難しさ ${n}">${'●'.repeat(n)}</span>`;

// 色の小さな札（個人の目標）
export const colorChip = (color) => `<span class="chip c-${color}">${COLOR_INFO[color].name}</span>`;

// タイトルの絵：バラ窓
export function titleArtSvg() {
    const petals = 12;
    const ring = Array.from({ length: petals }, (_, k) => {
        const a = (k / petals) * Math.PI * 2;
        const color = COLOR_INFO[COLORS[k % 5]].hex;
        const x = 60 + Math.cos(a) * 34, y = 60 + Math.sin(a) * 34;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="13" fill="${color}" opacity="0.88"/>`;
    }).join('');
    const inner = Array.from({ length: 6 }, (_, k) => {
        const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
        const color = COLOR_INFO[COLORS[(k + 2) % 5]].hex;
        const x = 60 + Math.cos(a) * 16, y = 60 + Math.sin(a) * 16;
        return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="8" fill="${color}" opacity="0.9"/>`;
    }).join('');
    return `<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
        <defs><radialGradient id="glow" cx="50%" cy="45%" r="60%"><stop offset="0" stop-color="#fff6d8" stop-opacity="0.55"/><stop offset="1" stop-color="#fff6d8" stop-opacity="0"/></radialGradient></defs>
        <circle cx="60" cy="60" r="56" fill="#1d2133"/>
        ${ring}${inner}
        <circle cx="60" cy="60" r="7" fill="#e5b43a"/>
        <g fill="none" stroke="#14161f" stroke-width="2.4">
            <circle cx="60" cy="60" r="56"/><circle cx="60" cy="60" r="47"/><circle cx="60" cy="60" r="24"/><circle cx="60" cy="60" r="7"/>
            ${Array.from({ length: 12 }, (_, k) => { const a = (k / 12) * Math.PI * 2 + Math.PI / 12; return `<path d="M${(60 + Math.cos(a) * 24).toFixed(1)} ${(60 + Math.sin(a) * 24).toFixed(1)} L${(60 + Math.cos(a) * 56).toFixed(1)} ${(60 + Math.sin(a) * 56).toFixed(1)}"/>`; }).join('')}
        </g>
        <circle cx="60" cy="60" r="56" fill="url(#glow)"/>
    </svg>`;
}
