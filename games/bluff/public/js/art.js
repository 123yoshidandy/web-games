/**
 * 絵（自作の SVG）：ダイス（1〜5 の目と星）、カップ、タイトルの絵
 */

import { STAR } from './bids.js';

const SYMBOLS = {
    home: '<path d="M3.5 11.5 L12 4 L20.5 11.5"/><path d="M6 10 v10 h12 v-10"/><path d="M10 20 v-5.5 h4 v5.5"/>',
    log: '<path d="M6 3.5 h9 l3.5 3.5 v13.5 h-12.5 Z"/><path d="M9 10 h6.5 M9 13.5 h6.5 M9 17 h4.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4 q0.4-2.6 2.6-2.6 q2.6 0 2.6 2.4 q0 1.6-1.8 2.4 q-1 0.5-1 1.9"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>'
};

export function symbolsSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${Object.entries(SYMBOLS).map(([id, body]) =>
        `<symbol id="i-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`).join('')}</svg>`;
}

export const icon = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

const PIPS = { 1: [4], 2: [2, 6], 3: [2, 4, 6], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8] };
const STAR_PATH = 'M12 3.2 L14.4 9 L20.6 9.4 L15.8 13.3 L17.4 19.4 L12 16 L6.6 19.4 L8.2 13.3 L3.4 9.4 L9.6 9 Z';

// ダイスの面（value：1〜5、6 は星）
export function faceSvg(value) {
    if (value === STAR) return `<svg class="face" viewBox="0 0 24 24" aria-hidden="true"><path class="star" d="${STAR_PATH}"/></svg>`;
    return `<svg class="face" viewBox="0 0 24 24" aria-hidden="true">${PIPS[value].map(k => `<circle cx="${6 + (k % 3) * 6}" cy="${6 + Math.floor(k / 3) * 6}" r="2.2"/>`).join('')}</svg>`;
}

export const faceName = (value) => (value === STAR ? '星' : String(value));

export function dieHtml(value, { cls = '', attrs = '' } = {}) {
    return `<div class="die ${cls}" ${attrs} aria-label="${faceName(value)}">${faceSvg(value)}</div>`;
}

// 伏せたダイス（カップの中）
export const hiddenDie = (cls = '') => `<div class="die hidden ${cls}" aria-label="カップの中"></div>`;

// カップ（中の数を書く）
export function cupSvg(count) {
    return `<svg class="cup" viewBox="0 0 40 40" aria-hidden="true">
        <path d="M7 6 h26 l-4 29 h-18 Z" class="cup-body"/>
        <path d="M7 6 h26" class="cup-rim"/>
        <path d="M11 13 h18" class="cup-band"/>
        <text x="20" y="27" text-anchor="middle" class="cup-num">${count}</text>
    </svg>`;
}

// タイトルの絵：カップとこぼれたダイス
export function titleArtSvg() {
    const die = (x, y, r, value) => `<g transform="translate(${x} ${y}) rotate(${r})"><rect x="-13" y="-13" width="26" height="26" rx="5" fill="#f6efdc" stroke="#2b2116" stroke-width="1.4"/>
        ${value === STAR ? `<path transform="translate(-12 -12)" d="${STAR_PATH}" fill="#c43b2f"/>` : PIPS[value].map(k => `<circle cx="${-6 + (k % 3) * 6}" cy="${-6 + Math.floor(k / 3) * 6}" r="2.1" fill="#2b2116"/>`).join('')}</g>`;
    return `<svg viewBox="0 0 220 130" xmlns="http://www.w3.org/2000/svg">
        <ellipse cx="110" cy="112" rx="96" ry="12" fill="rgba(0,0,0,.25)"/>
        <g transform="translate(70 60) rotate(-18)">
            <path d="M-30 -42 h60 l-9 72 h-42 Z" fill="#7a4a2a" stroke="#3b2210" stroke-width="2"/>
            <path d="M-30 -42 h60" stroke="#c9944f" stroke-width="5" stroke-linecap="round"/>
            <path d="M-26 -24 h52" stroke="#c9944f" stroke-width="3"/>
        </g>
        ${die(128, 92, 12, 6)}${die(160, 98, -8, 5)}${die(188, 84, 20, 6)}${die(144, 64, -22, 3)}${die(178, 52, 6, 1)}
    </svg>`;
}
