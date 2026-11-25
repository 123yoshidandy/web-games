/**
 * 絵（すべて自作の SVG。公式の画像は使っていない）
 * 札の絵は symbol としてページに一度だけ入れ、use で使い回す（viewBox 48×48）
 * 線のアイコン（ホーム・遊び方など）は viewBox 24×24 で、色は currentColor
 */

import { CARDS } from './cards.js';

const RICE = '#fbf8f0';
const RICE_LINE = '#c9bfa8';
const NORI = '#24302b';

// にぎり（ネタの色と模様だけを変える）
const nigiri = (top, stripe) => `
    <ellipse cx="24" cy="36" rx="17" ry="7" fill="#000" opacity=".12"/>
    <path d="M8 30c0-6 7-9 16-9s16 3 16 9-7 7-16 7-16-1-16-7z" fill="${RICE}" stroke="${RICE_LINE}" stroke-width="1.2"/>
    <path d="M5 26c1-8 9-13 19-13s18 5 19 13c-5 3-12 4-19 4S10 29 5 26z" fill="${top}"/>
    ${stripe}`;

// 巻き寿司（1つ分。x だけずらす）
const roll = (x, y) => `
    <circle cx="${x}" cy="${y}" r="8.5" fill="${NORI}"/>
    <circle cx="${x}" cy="${y}" r="6.3" fill="${RICE}"/>
    <circle cx="${x}" cy="${y}" r="2.6" fill="#e2463c"/>
    <circle cx="${x + 2.2}" cy="${y - 1.6}" r="1.4" fill="#5fae55"/>`;

const ART = {
    tempura: `
        <ellipse cx="24" cy="40" rx="18" ry="4" fill="#000" opacity=".12"/>
        <path d="M30 10l8-6 2 2-5 8z" fill="#e8673a"/>
        <path d="M33 12c-6 2-17 12-22 22-2 5 2 8 6 6 10-5 18-15 21-22z" fill="#eab95a" stroke="#b9842c" stroke-width="1.2"/>
        <path d="M16 30l3 3M20 26l3 3M24 22l3 3M28 18l3 3" stroke="#c99140" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M10 40c-1 2 1 3 3 2" stroke="#e8673a" stroke-width="2" fill="none"/>`,
    sashimi: `
        <ellipse cx="24" cy="38" rx="19" ry="5" fill="#000" opacity=".12"/>
        <path d="M6 32c4-10 12-14 18-14s12 4 18 14z" fill="#f5f5f0" stroke="#c8c8bc" stroke-width="1"/>
        <path d="M9 30c3-7 8-10 12-10 3 0 5 3 5 10z" fill="#e2463c"/>
        <path d="M18 31c2-8 6-12 10-12s6 4 6 12z" fill="#ef6a4f"/>
        <path d="M27 31c1-6 4-9 7-9s5 3 5 9z" fill="#f08b5c"/>
        <path d="M13 26l3-3M22 26l3-4M31 27l2-3" stroke="#fff" stroke-width="1.2" opacity=".7"/>
        <path d="M38 12c2 3 2 7-1 9" stroke="#5fae55" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    dumpling: `
        <ellipse cx="24" cy="38" rx="18" ry="4.5" fill="#000" opacity=".12"/>
        <path d="M6 32c0-10 8-18 18-18s18 8 18 18c-6 4-12 5-18 5S12 36 6 32z" fill="#f3e2c0" stroke="#b9975a" stroke-width="1.4"/>
        <path d="M10 22c3 2 4 0 6-3 2 3 4 4 6 1 2 3 4 3 6 0 2 3 4 4 6 1 1 1 2 2 4 2" fill="none" stroke="#b9975a" stroke-width="1.4"/>
        <path d="M8 32c6 3 26 3 32 0" stroke="#d9a050" stroke-width="2.2" fill="none"/>`,
    maki1: roll(24, 26),
    maki2: roll(15, 26) + roll(33, 26),
    maki3: roll(13, 31) + roll(35, 31) + roll(24, 15),
    egg: nigiri('#f3cf44', `<rect x="21" y="12" width="6" height="21" rx="1" fill="${NORI}"/>`),
    salmon: nigiri('#f08b5c', '<path d="M11 21c4-3 7-4 10-4M18 24c5-4 10-5 13-5M27 26c4-3 8-4 11-3" stroke="#fde3cf" stroke-width="1.6" fill="none" stroke-linecap="round"/>'),
    squid: nigiri('#f1efe8', '<path d="M10 22c4 1 8 1 10 0M20 23c4 1 8 1 10 0M30 22c3 1 6 1 8 0" stroke="#cfcac0" stroke-width="1.4" fill="none" stroke-linecap="round"/><circle cx="34" cy="18" r="1.4" fill="#e2463c"/>'),
    wasabi: `
        <ellipse cx="24" cy="38" rx="15" ry="4" fill="#000" opacity=".12"/>
        <path d="M10 36c-2-6 2-10 6-11-1-6 4-10 8-9 3-5 10-4 11 1 5 1 7 6 4 10 4 3 2 9-3 9H14c-2 0-3 0-4 0z" fill="#8cc63f" stroke="#5b8a24" stroke-width="1.4"/>
        <path d="M17 30c2-2 4-2 6 0M26 26c2-2 4-2 6 0" stroke="#5b8a24" stroke-width="1.2" fill="none"/>`,
    pudding: `
        <ellipse cx="24" cy="41" rx="17" ry="3.6" fill="#000" opacity=".12"/>
        <path d="M6 40h36" stroke="#b9c3cc" stroke-width="3" stroke-linecap="round"/>
        <path d="M12 39l4-22h16l4 22z" fill="#f6d36b" stroke="#c9952c" stroke-width="1.2"/>
        <path d="M16 17c0-4 4-6 8-6s8 2 8 6c0 2-2 3-4 3-1 0-1 2-4 2s-3-2-4-2c-2 0-4-1-4-3z" fill="#7a4419"/>
        <circle cx="24" cy="9" r="2.6" fill="#e2463c"/>`,
    chopsticks: `
        <path d="M10 42L34 6" stroke="#b97a3e" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M17 44L41 10" stroke="#b97a3e" stroke-width="3.4" stroke-linecap="round"/>
        <path d="M28 15l5 3M35 19l5 3" stroke="#8a5a2a" stroke-width="2"/>
        <rect x="6" y="38" width="16" height="6" rx="3" fill="#e2463c" transform="rotate(-20 14 41)"/>`
};

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    log: '<path d="M5 6h14M5 12h14M5 18h9"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>'
};

export function symbolsSvg() {
    const art = Object.entries(ART).map(([key, body]) => `<symbol id="s-${key}" viewBox="0 0 48 48">${body}</symbol>`).join('');
    const icons = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${art}${icons}</defs></svg>`;
}

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const artSvg = (type) => `<svg class="art" viewBox="0 0 48 48" aria-hidden="true"><use href="#s-${type}"/></svg>`;

// 札の右上の印（巻き寿司の数・にぎりの点）
const badge = (type) => {
    const c = CARDS[type];
    if (c.maki) return `<span class="badge">${'●'.repeat(c.maki)}</span>`;
    if (c.nigiri) return `<span class="badge">${c.nigiri}</span>`;
    return '';
};

// 手札の札
export function cardHtml(type, { cls = '', attrs = '' } = {}) {
    const c = CARDS[type];
    return `<div class="card ${cls}" style="--cc:${c.color}" data-card="${type}" ${attrs}>
        ${badge(type)}${artSvg(type)}<span class="name">${c.label ?? c.name}</span>
    </div>`;
}

// 場の札（小さく。わさびの上のにぎりは、にぎりの札に緑の縁）
export function miniHtml(entry, cls = '') {
    if (entry.type === 'wasabi' && entry.nigiri) {
        const c = CARDS[entry.nigiri];
        return `<span class="mini on-wasabi ${cls}" style="--cc:${c.color}" title="わさびと${c.name}">${artSvg(entry.nigiri)}</span>`;
    }
    const c = CARDS[entry.type];
    return `<span class="mini ${cls}" style="--cc:${c.color}" title="${c.name}">${artSvg(entry.type)}${c.maki ? `<i class="dots">${c.maki}</i>` : ''}</span>`;
}
