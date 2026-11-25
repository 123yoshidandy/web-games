/**
 * 絵（すべて自作の SVG）。ページに一度だけ入れ、use で使い回す
 * - 地形の六角形（t-G など）：中心を (0,0)、頂点までを 10 とする尖った頭の六角形に、地形の模様を重ねたもの
 * - 場所のしるし（l-oracle など）：線で描いたアイコン
 * - 家（house）と、ボタンのアイコン（i-home など）
 */

import { TERRAINS } from './boards.js';

export const HEX_R = 10;
export const HEX_W = Math.sqrt(3) * HEX_R;
export const HEX_POINTS = [0, 1, 2, 3, 4, 5].map(k => {
    const a = Math.PI / 180 * (60 * k - 90);
    return `${(HEX_R * Math.cos(a)).toFixed(2)},${(HEX_R * Math.sin(a)).toFixed(2)}`;
}).join(' ');

export const PLAYER_COLORS = ['#d8432f', '#2b63d6', '#f3efe4', '#26262e'];
export const PLAYER_LINES = ['#5e160d', '#0c2459', '#5a554a', '#e8e4da'];

const TERRAIN_ART = {
    G: '<path d="M-5 4l1-3.2 1 3.2M1.5 -.5l1-3.2 1 3.2M-1 -4.5l.8-2.4.8 2.4" stroke="#6f9a37" stroke-width="1" fill="none" stroke-linecap="round"/>',
    F: '<g><circle cx="-4" cy="-2" r="1.3" fill="#fff8e8"/><circle cx="3" cy="-4" r="1.3" fill="#d9577a"/><circle cx="0" cy="2" r="1.3" fill="#d9577a"/><circle cx="4.5" cy="3" r="1.3" fill="#fff8e8"/><circle cx="-3.5" cy="4.5" r="1.1" fill="#8a5fc4"/></g>',
    T: '<path d="M-3 4.5L0-6l3 10.5z" fill="#2b5a32"/><path d="M1.5 5.5l2.6-8.5 2.6 8.5z" fill="#376b3b"/><path d="M-6.8 5.5l2.4-7.5 2.4 7.5z" fill="#376b3b"/>',
    C: '<path d="M-8 -2.5q4-2 8 0t8 0M-8 2q4-2 8 0t8 0M-6 6q3-1.6 6 0t6 0" stroke="#9a5530" stroke-width="1" fill="none"/>',
    D: '<path d="M-7 3q3-4.5 6-1.5t7-1M-4 -3q2-2.2 4-.6" stroke="#c4a35e" stroke-width="1" fill="none" stroke-linecap="round"/>',
    W: '<path d="M-6 -2q1.5-1.6 3 0t3 0 3 0 3 0M-4.5 2.5q1.5-1.6 3 0t3 0 3 0" stroke="#d6efff" stroke-width="1" fill="none" stroke-linecap="round"/>',
    M: '<path d="M-7 5L-1.5-5.5 2 0l1.8-2.6L7.5 5z" fill="#6c6864"/><path d="M-1.5-5.5l-2.1 4 1.4-.6.9 1.2 1.6-1z" fill="#f4f2ee"/>',
    K: '<path d="M-5.5 5.5V-1.5h1.6v-2h1.6v2h1.5v-2h1.6v2h1.5v-2h1.6v2h1.6v7z" fill="#6f5f93"/><path d="M-1.3 5.5v-3a1.3 1.3 0 0 1 2.6 0v3z" fill="#3b3156"/><path d="M0-3.5v-3.4l2.6 1-2.6 1" fill="#e9b949" stroke="#3b3156" stroke-width=".4"/>',
    L: ''
};

const LOCATION_ART = {
    oracle: '<circle cx="0" cy="-1.6" r="3.6"/><path d="M-4.2 5.2h8.4l-1.6-2.6h-5.2z"/><path d="M-1.4-3q.8-1 2-.8" stroke-width=".8"/>',
    farm: '<path d="M0 6V-5.5M0-3.2l-2.6-2M0-3.2l2.6-2M0 0l-2.6-2M0 0l2.6-2M0 3.2l-2.6-2M0 3.2l2.6-2"/>',
    oasis: '<path d="M.2 5.5q1.2-4.5-.2-8.6M0-3.1q-3-2.4-5.6-.3M0-3.1q3-2.4 5.6-.3M0-3.1q-1-3-3.4-3.6M0-3.1q1-3 3.4-3.6M-5.5 5.6h11"/>',
    tower: '<path d="M-2.6 6V-2.6h5.2V6M-3.6-2.6v-3.3h1.5v1.3h1.4v-1.3h1.4v1.3h1.4v-1.3h1.5v3.3zM-.9 6V3.2h1.8V6"/>',
    tavern: '<path d="M-4.2-2.6h6.2v8h-6.2zM2 -.6h2.2v3.8H2M-4.2-2.6q1.5-2.2 3.1-.2q1.6-2 3.1.2"/>',
    barn: '<path d="M-5.2 6V-.8L0-5.2l5.2 4.4V6zM-2.3 6V1.2h4.6V6M-2.3 1.2l4.6 4.8M2.3 1.2L-2.3 6"/>',
    harbor: '<circle cx="0" cy="-5" r="1.4"/><path d="M0-3.6V5.6M-4.3 2q.6 3.6 4.3 3.6T4.3 2M-2.4-1.4h4.8"/>',
    paddock: '<path d="M-3.6 5.4V-.6a3.6 3.6 0 0 1 7.2 0v6" stroke-width="2.1"/><path d="M-3.6 1.6h0M3.6 1.6h0M-3.2-2.6h0M3.2-2.6h0" stroke="#f1e6c8" stroke-width="1"/>'
};

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    log: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/>',
    plus: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6M11 8v6"/>',
    minus: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    crown: '<path d="M3 18h18M4 15l-1-9 5 4 4-6 4 6 5-4-1 9z"/>'
};

// ページに一度だけ入れる SVG
export function symbolsSvg() {
    const terrains = Object.entries(TERRAINS).map(([t, info]) => `<g id="t-${t}"><polygon points="${HEX_POINTS}" fill="${info.color}"/>${TERRAIN_ART[t]}</g>`).join('');
    const locations = Object.entries(LOCATION_ART).map(([id, art]) => `<g id="l-${id}" fill="none" stroke="#5b4426" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round">${art}</g>`).join('');
    const icons = Object.entries(ICONS).map(([id, art]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${art}</symbol>`).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${terrains}${locations}
        <path id="house" d="M-4.2 4.2V-.8L0-4.6 4.2-.8v5z"/>${icons}</defs></svg>`;
}

export const icon = (id) => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;

// 地形の六角形を1つ、単独の SVG で（手札のカードや遊び方の図に使う）
export function terrainHex(t, size = 28) {
    return `<svg class="thex" width="${size}" height="${size}" viewBox="-10 -10.5 20 21" aria-hidden="true"><use href="#t-${t}"/></svg>`;
}

// 場所のしるしを、羊皮紙の六角形の上に
export function locationHex(id, size = 28) {
    return `<svg class="thex" width="${size}" height="${size}" viewBox="-10 -10.5 20 21" aria-hidden="true"><use href="#t-L"/><use href="#l-${id}" transform="scale(1.05)"/></svg>`;
}

// 家を1軒（プレイヤーの色）
export function houseSvg(seat, size = 16) {
    return `<svg class="hs" width="${size}" height="${size}" viewBox="-5.5 -5.5 11 11" aria-hidden="true"><use href="#house" fill="${PLAYER_COLORS[seat]}" stroke="${PLAYER_LINES[seat]}" stroke-width=".9"/></svg>`;
}
