/**
 * 絵（すべて自作の SVG。公式の画像は使っていない）
 * おばけと生き物は、丸い体と大きな目で、かわいくデフォルメする（こわい・気持ち悪い見た目にしない）。symbol としてページに一度だけ入れ、use で使い回す（viewBox 60×60）
 * 線のアイコン（ホーム・遊び方など）は viewBox 24×24 で、色は currentColor
 */

import { KINDS } from './kinds.js';

const INK = '#2b1d14';

// 大きな目（白目・黒目・光）
const eye = (cx, cy, r = 4.6) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fff" stroke="${INK}" stroke-width="1"/>
    <circle cx="${cx + r * 0.12}" cy="${cy + r * 0.18}" r="${r * 0.58}" fill="${INK}"/>
    <circle cx="${cx + r * 0.32}" cy="${cy - r * 0.12}" r="${r * 0.22}" fill="#fff"/>`;
const eyes = (x1, x2, cy, r) => eye(x1, cy, r) + eye(x2, cy, r);
// ほおの赤み
const blush = (x1, x2, cy) => `<ellipse cx="${x1}" cy="${cy}" rx="3" ry="1.8" fill="#ff8f8f" opacity=".75"/><ellipse cx="${x2}" cy="${cy}" rx="3" ry="1.8" fill="#ff8f8f" opacity=".75"/>`;
const smile = (cx, cy, w = 3) => `<path d="M${cx - w} ${cy}q${w} ${w * 0.9} ${w * 2} 0" fill="none" stroke="${INK}" stroke-width="1.3" stroke-linecap="round"/>`;
// ハリネズミの針（中心から、長い針と短い針を交互に n 本ずつ並べた形）
const spikes = (cx, cy, r1, r2, n) => {
    const pts = Array.from({ length: n * 2 }, (_, i) => {
        const a = (Math.PI * i) / n - Math.PI / 2;
        const r = i % 2 ? r2 : r1;
        return `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
    });
    return `<path d="M${pts.join("L")}z" fill="#8a5d3c" stroke="#4a2f1c" stroke-width="1.2" stroke-linejoin="round"/>`;
};
const shine = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".28"/>`;

const ART = {
    cockroach: `
        <path d="M14 33c-5 0-8 3-8 6 3 1 6-1 8-3M46 33c5 0 8 3 8 6-3 1-6-1-8-3" fill="#eef0ff" stroke="#4a4f7a" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M14 50V30c0-10 7-17 16-17s16 7 16 17v20q-2.7-4-5.3 0t-5.3 0-5.3 0-5.3 0-5.3 0-5.4 0z" fill="#fbfbff" stroke="#4a4f7a" stroke-width="1.2" stroke-linejoin="round"/>
        ${shine(21, 22, 3, 4.5)}
        ${eyes(24.5, 35.5, 30, 4.4)}${blush(20, 40, 36.5)}
        <path d="M27.5 36.5q2.5 3.6 5 0z" fill="#e77f8a" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round"/>`,
    rat: `
        <path d="M44 46c8 2 12-2 11-7" fill="none" stroke="#e7a3a8" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="17" cy="19" r="8.5" fill="#a9b2bd" stroke="#4d5560" stroke-width="1.2"/><circle cx="17" cy="19" r="5" fill="#f2b8bd"/>
        <circle cx="43" cy="19" r="8.5" fill="#a9b2bd" stroke="#4d5560" stroke-width="1.2"/><circle cx="43" cy="19" r="5" fill="#f2b8bd"/>
        <ellipse cx="30" cy="35" rx="16.5" ry="15" fill="#bcc4ce" stroke="#4d5560" stroke-width="1.2"/>
        ${shine(23, 28, 4, 3)}
        <ellipse cx="30" cy="42" rx="8" ry="5.5" fill="#e6eaef"/>
        ${eyes(24, 36, 32, 4.4)}${blush(19.5, 40.5, 39)}
        <ellipse cx="30" cy="39.5" rx="2.2" ry="1.7" fill="#e77f8a"/>
        <path d="M30 41v2" stroke="${INK}" stroke-width="1" stroke-linecap="round"/>${smile(27.5, 43, 1.25)}${smile(30, 43, 1.25)}
        <path d="M21 41l-8-1M21 43l-7 2M39 41l8-1M39 43l7 2" stroke="#4d5560" stroke-width=".9" stroke-linecap="round"/>`,
    bat: `
        <path d="M20 30C14 22 6 22 2 27c4 0 6 3 5 6 3-2 6-1 7 2 2-3 5-3 7-1z" fill="#6c4d99" stroke="#3a2758" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M40 30c6-8 14-8 18-3-4 0-6 3-5 6-3-2-6-1-7 2-2-3-5-3-7-1z" fill="#6c4d99" stroke="#3a2758" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M20 22l1-10 7 7M40 22l-1-10-7 7" fill="#8a6bbb" stroke="#3a2758" stroke-width="1.2" stroke-linejoin="round"/>
        <circle cx="30" cy="32" r="13" fill="#8a6bbb" stroke="#3a2758" stroke-width="1.2"/>
        ${shine(24, 26, 3.5, 2.5)}
        <ellipse cx="30" cy="38" rx="6.5" ry="5" fill="#b9a2dd"/>
        ${eyes(25, 35, 30, 4.4)}${blush(20.5, 39.5, 36)}${smile(28, 37, 2)}
        <path d="M27.4 38.4l.8 2 .8-1.8M30.8 38.6l.8 1.8.8-2" fill="#fff" stroke="#fff" stroke-width=".6" stroke-linejoin="round"/>
        <path d="M26 45l-1 4M34 45l1 4" stroke="#3a2758" stroke-width="2" stroke-linecap="round"/>`,
    fly: `
        <path d="M30 17c0-4 1-7 4-9" fill="none" stroke="#4d7a2a" stroke-width="3" stroke-linecap="round"/>
        <path d="M32 15c4-4 9-4 12-1-4 3-9 3-12 1z" fill="#79b94a" stroke="#3f6b22" stroke-width="1" stroke-linejoin="round"/>
        <ellipse cx="20" cy="36" rx="11" ry="15" fill="#f39a2e" stroke="#a8531a" stroke-width="1.2"/>
        <ellipse cx="40" cy="36" rx="11" ry="15" fill="#f39a2e" stroke="#a8531a" stroke-width="1.2"/>
        <ellipse cx="30" cy="36" rx="11" ry="16" fill="#f8ab45" stroke="#a8531a" stroke-width="1.2"/>
        ${shine(14, 31, 2.5, 5)}${shine(25, 27, 2.5, 4)}
        ${eyes(24.5, 35.5, 34, 4.4)}${blush(19, 41, 40)}${smile(28, 40, 2)}`,
    frog: `
        <circle cx="19" cy="22" r="8.5" fill="#7cc95a" stroke="#2f6b25" stroke-width="1.2"/>
        <circle cx="41" cy="22" r="8.5" fill="#7cc95a" stroke="#2f6b25" stroke-width="1.2"/>
        <ellipse cx="30" cy="37" rx="22" ry="15" fill="#7cc95a" stroke="#2f6b25" stroke-width="1.2"/>
        <ellipse cx="30" cy="43" rx="13" ry="7" fill="#d9f0b8"/>
        ${shine(17, 31, 4, 2.5)}
        ${eyes(19, 41, 22, 5)}${blush(15, 45, 36)}
        <path d="M21 36q9 7 18 0" fill="none" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>
        <circle cx="27" cy="31" r=".9" fill="#2f6b25"/><circle cx="33" cy="31" r=".9" fill="#2f6b25"/>`,
    scorpion: `
        <path d="M43 50c8 0 11-6 8-11" fill="none" stroke="#3d3a48" stroke-width="3.4" stroke-linecap="round"/>
        <ellipse cx="30" cy="47" rx="13" ry="7.5" fill="#3d3a48" stroke="#17151d" stroke-width="1.2"/>
        <path d="M15 25l2-14 10 8zM45 25l-2-14-10 8z" fill="#3d3a48" stroke="#17151d" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M18 21.5l1-6 5 3.8zM42 21.5l-1-6-5 3.8z" fill="#f2a3b3"/>
        <ellipse cx="30" cy="31" rx="16.5" ry="14" fill="#47434f" stroke="#17151d" stroke-width="1.2"/>
        ${shine(22, 24, 4, 2.5)}
        ${eyes(23.5, 36.5, 30, 4.8)}${blush(19, 41, 37)}
        <path d="M28.6 35.2h2.8L30 37z" fill="#f2a3b3"/>
        <path d="M27.3 37.6q1.35 1.4 2.7 0 1.35 1.4 2.7 0" fill="none" stroke="#f6efe6" stroke-width="1.1" stroke-linecap="round"/>
        <path d="M19 35l-8-1M19 37.5l-7 2M41 35l8-1M41 37.5l7 2" stroke="#d8d2e6" stroke-width=".9" stroke-linecap="round"/>`,
    stinkbug: `
        <path d="M16 17l3 9 7-5zM44 17l-3 9-7-5z" fill="#86593a" stroke="#4a2f1c" stroke-width="1.2" stroke-linejoin="round"/>
        <ellipse cx="30" cy="35" rx="17" ry="18" fill="#a8774d" stroke="#4a2f1c" stroke-width="1.2"/>
        <path d="M14 33c-3 6-2 12 3 16 1-6 1-11-3-16zM46 33c3 6 2 12-3 16-1-6-1-11 3-16z" fill="#86593a" stroke="#4a2f1c" stroke-width="1.1" stroke-linejoin="round"/>
        <ellipse cx="30" cy="43" rx="9.5" ry="8.5" fill="#f1dcb8"/>
        <path d="M25.5 41q1.2 1.5 2.4 0M32.1 41q1.2 1.5 2.4 0M28.8 46q1.2 1.5 2.4 0" fill="none" stroke="#c9a574" stroke-width="1" stroke-linecap="round"/>
        <circle cx="23.5" cy="28" r="7.2" fill="#f1dcb8"/><circle cx="36.5" cy="28" r="7.2" fill="#f1dcb8"/>
        ${eyes(23.5, 36.5, 28, 4.8)}${blush(17.5, 42.5, 34)}
        <path d="M28.2 32.5h3.6L30 36.5z" fill="#f2b33d" stroke="#a86a12" stroke-width=".8" stroke-linejoin="round"/>
        <path d="M25 52.5v2.5M27.5 52.5v2.5M32.5 52.5v2.5M35 52.5v2.5" stroke="#f2b33d" stroke-width="1.6" stroke-linecap="round"/>`,
    spider: `
        ${spikes(30, 33, 21, 15.5, 16)}
        <circle cx="19" cy="29" r="3.6" fill="#f4dcb6" stroke="#4a2f1c" stroke-width="1.1"/><circle cx="41" cy="29" r="3.6" fill="#f4dcb6" stroke="#4a2f1c" stroke-width="1.1"/>
        <ellipse cx="30" cy="40" rx="13.5" ry="11.5" fill="#f4dcb6" stroke="#4a2f1c" stroke-width="1.2"/>
        ${shine(23, 35, 3, 2)}
        ${eyes(24.5, 35.5, 38, 4)}${blush(19.5, 40.5, 44)}
        <ellipse cx="30" cy="43" rx="2" ry="1.6" fill="${INK}"/>${smile(28, 45.5, 2)}`

};

// 線のアイコン（24×24）
const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    log: '<path d="M5 6h14M5 12h14M5 18h9"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'
};

export function symbolsSvg() {
    const art = Object.entries(ART).map(([key, body]) => `<symbol id="k-${key}" viewBox="0 0 60 60">${body}</symbol>`).join('');
    const icons = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${art}${icons}</defs></svg>`;
}

// 単独の SVG（アイコンの画像を作るときに使う）
export const kindSvgBody = (kind) => ART[kind];

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// 絵だけ
export const critter = (kind, cls = '') => `<svg class="critter ${cls}" viewBox="0 0 60 60" aria-hidden="true"><use href="#k-${kind}"/></svg>`;

// 表のカード。cls で大きさや状態を変える
export function cardHtml(kind, { cls = '', attrs = '' } = {}) {
    const k = KINDS[kind];
    return `<div class="card face ${cls}" style="--kc:${k.color}" data-kind="${kind}" ${attrs}>
        <span class="art">${critter(kind)}</span>
        <span class="kind-name">${k.name}</span>
    </div>`;
}

// 伏せたカード（裏）
export const backHtml = (cls = '', attrs = '') => `<div class="card back ${cls}" ${attrs} aria-label="伏せたカード"><span class="emblem"></span></div>`;

// 種類の名前の札（言った種類に使う）
export const kindTag = (kind) => `<span class="kind-tag" style="--kc:${KINDS[kind].color}">${critter(kind)}${KINDS[kind].name}</span>`;
