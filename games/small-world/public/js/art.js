/**
 * 絵（すべて自作の SVG）。ページに一度だけ入れ、use で使い回す
 * - 地形の模様（t-farm など）・特別な領域（s-magic など）・印（m-lair など）：中心を (0,0) にした小さな絵
 * - ボタンのアイコン（i-home など）：24×24 の線の絵
 */

import { TERRAINS } from './data.js';

export const HEX_R = 10;
export const HEX_W = Math.sqrt(3) * HEX_R;
export const HEX_POINTS = [0, 1, 2, 3, 4, 5].map(k => {
    const a = Math.PI / 180 * (60 * k - 90);
    return `${(HEX_R * Math.cos(a)).toFixed(2)},${(HEX_R * Math.sin(a)).toFixed(2)}`;
}).join(' ');

export const PLAYER_COLORS = ['#d8432f', '#2b63d6', '#f3efe4', '#8a4fc9', '#f08a24'];
export const PLAYER_TEXT = ['#ffffff', '#ffffff', '#2a2420', '#ffffff', '#2a1a05'];
export const PLAYER_LINES = ['#5e160d', '#0c2459', '#5a554a', '#3a1a5e', '#6a3606'];

const TERRAIN_ART = {
    farm: '<path d="M-6.5 3.5h13M-5.5 0h11M-4.5-3.5h9" stroke="#a88a32" stroke-width="1.1" stroke-linecap="round" fill="none"/>',
    forest: '<path d="M-3.2 4.5L0-6l3.2 10.5z" fill="#245229"/><path d="M1.6 5.5l2.7-8.5 2.7 8.5z" fill="#2f6634"/><path d="M-7 5.5l2.5-7.5 2.5 7.5z" fill="#2f6634"/>',
    hill: '<path d="M-7.5 4.5q3.6-8 7.2 0M-1.5 4.5q3.6-7 7.2 0" stroke="#6f8f35" stroke-width="1.3" fill="#93b453" stroke-linecap="round"/>',
    mountain: '<path d="M-7.5 5L-1.5-6 2 0l1.9-2.8L7.5 5z" fill="#6c6560"/><path d="M-1.5-6l-2.2 4.2 1.5-.6.9 1.2 1.7-1z" fill="#f4f2ee"/>',
    swamp: '<path d="M-6 4q2-1.2 4 0t4 0 4 0" stroke="#3f5a63" stroke-width="1" fill="none"/><path d="M-3 3V-3M0 3v-6.5M3 3v-4.5" stroke="#4a5a2e" stroke-width="1" stroke-linecap="round"/><ellipse cx="0" cy="-4.5" rx=".9" ry="2" fill="#6b4a2a"/><ellipse cx="-3" cy="-2.3" rx=".8" ry="1.7" fill="#6b4a2a"/>',
    sea: '<path d="M-6-2q1.5-1.6 3 0t3 0 3 0 3 0M-4.5 2.5q1.5-1.6 3 0t3 0 3 0" stroke="#d6efff" stroke-width="1" fill="none" stroke-linecap="round"/>',
    lake: '<path d="M-5-1q1.3-1.4 2.6 0t2.6 0 2.6 0 2.6 0M-3.5 2.5q1.3-1.4 2.6 0t2.6 0 2.6 0" stroke="#e4f4ff" stroke-width="1" fill="none" stroke-linecap="round"/>'
};

const SPECIAL_ART = {
    magic: '<circle r="4.6" fill="#5a2d82" stroke="#f0e2ff" stroke-width=".7"/><path d="M0-3.2l.9 2.2 2.3.1-1.8 1.4.7 2.3L0 1.6-2.1 2.8l.7-2.3-1.8-1.4 2.3-.1z" fill="#f6d8ff"/>',
    mine: '<circle r="4.6" fill="#5b4026" stroke="#f1e0c2" stroke-width=".7"/><path d="M-2.4 2.6l4.2-4.2M-2.8-1.3q2.4-2.4 5.2 0" stroke="#f1e0c2" stroke-width=".9" fill="none" stroke-linecap="round"/>',
    cavern: '<circle r="4.6" fill="#2d2622" stroke="#d6cfc8" stroke-width=".7"/><path d="M-2.8 2.6v-1.4a2.8 2.8 0 0 1 5.6 0v1.4z" fill="#0d0b0a" stroke="#d6cfc8" stroke-width=".6"/>'
};

// 領域の印（守りや、攻められない印）
const MARK_ART = {
    lair: '<path d="M-3.6 2.6q0-5 3.6-5t3.6 5z" fill="#5a4a3a" stroke="#1d1712" stroke-width=".6"/><path d="M-1.2 2.6v-1.2a1.2 1.2 0 0 1 2.4 0v1.2z" fill="#1d1712"/>',
    fort: '<path d="M-3 3V-1.6h-.8v-1.8h1.4v.9h1V-3.4h1.4v.9h1v-.9h1.4v1.8H3V3z" fill="#bdb6ad" stroke="#2a2622" stroke-width=".55"/>',
    camp: '<path d="M-3.6 2.8L0-3l3.6 5.8z" fill="#e08a3a" stroke="#4a2408" stroke-width=".55"/><path d="M0 2.8L-.9 .8h1.8z" fill="#4a2408"/>',
    hero: '<path d="M0-3.6l3.2 1.2V.2q0 2.4-3.2 3.6Q-3.2 2.6-3.2.2v-2.6z" fill="#f3c54a" stroke="#5a4005" stroke-width=".6"/>',
    hole: '<ellipse rx="3.6" ry="2.3" fill="#1d1510" stroke="#7fae4a" stroke-width=".9"/>',
    dragon: '<path d="M0-3.8q2.2 1.6 1.4 3.6 1.8-.6 2.2-2.2.9 3.6-1.6 5.6Q.4 4.6-1.9 3.2q-2.4-1.9-1.4-4.6.5 1.3 1.6 1.7Q-2.3-1.6 0-3.8z" fill="#d8432f" stroke="#4a0d06" stroke-width=".5"/>',
    lost: '<circle r="5.4" fill="#7a6a55" stroke="#2a2017" stroke-width=".9"/><path d="M-2 2.8V-1.2L0-3l2 1.8v4M-2 .6h4" stroke="#f1e6c8" stroke-width=".9" fill="none" stroke-linejoin="round"/>'
};

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    log: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6"/>',
    plus: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6M11 8v6"/>',
    minus: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    banner: '<path d="M6 3v18"/><path d="M6 4h12l-3 4 3 4H6"/>',
    dice: '<rect x="4" y="4" width="16" height="16" rx="3"/><circle cx="9" cy="9" r=".8"/><circle cx="15" cy="15" r=".8"/><circle cx="15" cy="9" r=".8"/><circle cx="9" cy="15" r=".8"/>',
    add: '<path d="M12 6v12M6 12h12"/>',
    sub: '<path d="M6 12h12"/>'
};

export function symbolsSvg() {
    const terrains = Object.entries(TERRAIN_ART).map(([id, art]) => `<g id="t-${id}">${art}</g>`).join('');
    const specials = Object.entries(SPECIAL_ART).map(([id, art]) => `<g id="s-${id}">${art}</g>`).join('');
    const marks = Object.entries(MARK_ART).map(([id, art]) => `<g id="m-${id}">${art}</g>`).join('');
    const icons = Object.entries(ICONS).map(([id, art]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${art}</symbol>`).join('');
    const coin = '<symbol id="i-coin" viewBox="-6 -6 12 12"><circle r="5.2" fill="#e9b949" stroke="#8a6416" stroke-width="1"/><circle r="3" fill="none" stroke="#b88a24" stroke-width=".8"/></symbol>';
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${terrains}${specials}${marks}${icons}${coin}</defs></svg>`;
}

export const icon = (id) => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;
export const coinIcon = (size = 14) => `<svg class="coin" width="${size}" height="${size}" aria-hidden="true"><use href="#i-coin"/></svg>`;

// 印を1つ、単独の SVG で（説明の文に使う）
export function markSvg(id, size = 18) {
    const group = id in SPECIAL_ART ? `s-${id}` : id in TERRAIN_ART ? `t-${id}` : `m-${id}`;
    return `<svg class="mk" width="${size}" height="${size}" viewBox="-6 -6 12 12" aria-hidden="true"><use href="#${group}"/></svg>`;
}

// 地形の六角形を1つ
export function terrainHex(t, size = 24) {
    return `<svg class="mk" width="${size}" height="${size}" viewBox="-10 -10.5 20 21" aria-hidden="true"><polygon points="${HEX_POINTS}" fill="${TERRAINS[t].color}"/><use href="#t-${t}"/></svg>`;
}

// プレイヤーの色の部隊の印（数つき）
export function tokenSvg(seat, count = '', declined = false, size = 20) {
    const fill = declined ? '#6a665f' : PLAYER_COLORS[seat];
    const text = declined ? '#ffffff' : PLAYER_TEXT[seat];
    return `<svg class="mk" width="${size}" height="${size}" viewBox="-7 -7 14 14" aria-hidden="true"><circle r="6" fill="${fill}" stroke="${declined ? PLAYER_COLORS[seat] : PLAYER_LINES[seat]}" stroke-width="${declined ? 1.6 : 1}"/>${count !== '' ? `<text y="2.6" text-anchor="middle" font-size="7.5" font-weight="800" fill="${text}">${count}</text>` : ''}</svg>`;
}
