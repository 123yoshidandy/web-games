/**
 * 絵（すべて自作の SVG。公式の画像は使っていない）
 * 虫は丸い体と大きな目で、かわいくデフォルメする。symbol としてページに一度だけ入れ、use で使い回す（viewBox 60×60）
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
const shine = (cx, cy, rx, ry) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#fff" opacity=".28"/>`;

const ART = {
    cockroach: `
        <path d="M24 13C20 6 14 4 9 5M36 13c4-7 10-9 15-8" fill="none" stroke="#5b331c" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M17 32l-6-3M16 39l-7 1M18 46l-5 4M43 32l6-3M44 39l7 1M42 46l5 4" stroke="#5b331c" stroke-width="2.6" stroke-linecap="round"/>
        <ellipse cx="30" cy="39" rx="14" ry="15" fill="#a8653a" stroke="#5b331c" stroke-width="1.2"/>
        <path d="M30 27v26" stroke="#5b331c" stroke-width="1.1" opacity=".55"/>
        ${shine(24, 36, 3, 6)}
        <circle cx="30" cy="22" r="10.5" fill="#c98551" stroke="#5b331c" stroke-width="1.2"/>
        ${eyes(25.6, 34.4, 21, 4.2)}${blush(21.5, 38.5, 26)}${smile(28.2, 27, 1.8)}`,
    rat: `
        <path d="M44 46c8 2 12-2 11-7" fill="none" stroke="#e7a3a8" stroke-width="2.4" stroke-linecap="round"/>
        <circle cx="17" cy="19" r="8.5" fill="#a9b2bd" stroke="#4d5560" stroke-width="1.2"/><circle cx="17" cy="19" r="5" fill="#f2b8bd"/>
        <circle cx="43" cy="19" r="8.5" fill="#a9b2bd" stroke="#4d5560" stroke-width="1.2"/><circle cx="43" cy="19" r="5" fill="#f2b8bd"/>
        <ellipse cx="30" cy="35" rx="16.5" ry="15" fill="#bcc4ce" stroke="#4d5560" stroke-width="1.2"/>
        ${shine(23, 28, 4, 3)}
        <ellipse cx="30" cy="42" rx="8" ry="5.5" fill="#e6eaef"/>
        ${eyes(24, 36, 32, 4.4)}${blush(19.5, 40.5, 39)}
        <ellipse cx="30" cy="39.5" rx="2.2" ry="1.7" fill="#e77f8a"/>
        <path d="M30 41v2"stroke="${INK}" stroke-width="1" stroke-linecap="round"/>${smile(27.5, 43, 1.25)}${smile(30, 43, 1.25)}
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
        <ellipse cx="18" cy="20" rx="9" ry="13" transform="rotate(-35 18 20)" fill="#dff4ff" stroke="#6aa6c9" stroke-width="1.2" opacity=".95"/>
        <ellipse cx="42" cy="20" rx="9" ry="13" transform="rotate(35 42 20)" fill="#dff4ff" stroke="#6aa6c9" stroke-width="1.2" opacity=".95"/>
        <path d="M19 44l-6 4M21 49l-4 6M41 44l6 4M39 49l4 6" stroke="#2c3e57" stroke-width="2.2" stroke-linecap="round"/>
        <ellipse cx="30" cy="38" rx="13" ry="14" fill="#4e6b8f" stroke="#253650" stroke-width="1.2"/>
        <path d="M18.5 41c7 3 16 3 23 0M20 47c6 2.6 14 2.6 20 0" fill="none" stroke="#7fa2cc" stroke-width="2.2" stroke-linecap="round"/>
        ${shine(24, 31, 3.5, 2.5)}
        ${eyes(23.5, 36.5, 33, 5.6)}${blush(20, 40, 40.5)}${smile(28, 39, 2)}`,
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
        <path d="M40 44c9-2 13-10 11-18-1-6-6-9-10-7" fill="none" stroke="#b5611c" stroke-width="7" stroke-linecap="round"/>
        <path d="M40 44c9-2 13-10 11-18-1-6-6-9-10-7" fill="none" stroke="#f0a24a" stroke-width="4.4" stroke-linecap="round" stroke-dasharray="4.5 1.2"/>
        <path d="M41 19c-4-1-7 1-7 4 3 0 5-1 7-4z" fill="#f6d27a" stroke="#b5611c" stroke-width="1.1" stroke-linejoin="round"/>
        <path d="M19 40l-6 4M20 45l-5 6M37 46l3 6" stroke="#b5611c" stroke-width="2.2" stroke-linecap="round"/>
        <path d="M18 33c-6 0-9-4-9-9" fill="none" stroke="#b5611c" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M8 26c-4-2-4-8 0-9 1 3 3 3 4 1 3 3 1 8-4 8z" fill="#f0a24a" stroke="#b5611c" stroke-width="1.1" stroke-linejoin="round"/>
        <ellipse cx="28" cy="38" rx="13" ry="11" fill="#f0a24a" stroke="#b5611c" stroke-width="1.2"/>
        ${shine(23, 33, 3.5, 2.2)}
        ${eyes(23.5, 32.5, 36, 4)}${blush(19.5, 36.5, 42)}${smile(26.2, 42, 1.8)}`,
    stinkbug: `
        <path d="M25 14c-3-5-7-7-11-6M35 14c3-5 7-7 11-6" fill="none" stroke="#5c6a1c" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M16 30l-6-2M15 38l-7 1M17 46l-5 4M44 30l6-2M45 38l7 1M43 46l5 4" stroke="#5c6a1c" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M30 17c9 0 17 4 17 13 0 12-8 22-17 26-9-4-17-14-17-26 0-9 8-13 17-13z" fill="#a9c23f" stroke="#5c6a1c" stroke-width="1.2" stroke-linejoin="round"/>
        <path d="M22 41l8 11 8-11" fill="#93ab2f" stroke="#5c6a1c" stroke-width="1" stroke-linejoin="round" opacity=".8"/>
        <ellipse cx="30" cy="16" rx="6" ry="4.5" fill="#8fa82e" stroke="#5c6a1c" stroke-width="1.2"/>
        ${shine(22, 24, 3.5, 2.2)}
        ${eyes(25, 35, 29, 4.4)}${blush(20.5, 39.5, 35)}${smile(28, 35, 2)}`,
    spider: `
        <path d="M19 28c-6-5-10-5-15-1M18 33c-6-2-10 0-13 4M19 38c-5 1-8 4-10 9M22 42c-3 3-4 7-4 11
                 M41 28c6-5 10-5 15-1M42 33c6-2 10 0 13 4M41 38c5 1 8 4 10 9M38 42c3 3 4 7 4 11"
              fill="none" stroke="#3a2b47" stroke-width="2.6" stroke-linecap="round"/>
        <circle cx="30" cy="34" r="14" fill="#5a4570" stroke="#2c2036" stroke-width="1.2"/>
        <path d="M24 22c2-3 4-4 6-4s4 1 6 4" fill="none" stroke="#2c2036" stroke-width="1.2" stroke-linecap="round"/>
        ${shine(24, 27, 3.5, 2.5)}
        ${eyes(24.5, 35.5, 33, 5)}${blush(20, 40, 40)}${smile(28, 40, 2)}
        <circle cx="30" cy="26" r="1.3" fill="#2c2036"/>`
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

// 虫の絵だけ
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

// 虫の名前の札（言った虫に使う）
export const kindTag = (kind) => `<span class="kind-tag" style="--kc:${KINDS[kind].color}">${critter(kind)}${KINDS[kind].name}</span>`;
