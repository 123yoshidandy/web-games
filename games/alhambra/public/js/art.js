/**
 * 建物タイル・お金のカードの絵（自作の SVG と HTML）
 * 建物は種類ごとの色と図柄に加え、種類の順（1〜6）を点の数でも示す。城壁は辺の太い線で描く
 */

import { TILES, TYPES, TYPE_NAMES, CURRENCY_NAMES, FOUNTAIN } from './game.js';

const BUILDING_ICONS = {
    pavilion: '<path d="M4 20h16M6 20v-7M18 20v-7M4 13h16L12 6z"/><path d="M12 6V4"/>',
    seraglio: '<path d="M3 20h18M5 20v-8h14v8M5 12l7-5 7 5M10 20v-4h4v4"/>',
    arcades: '<path d="M3 20h18M4 20v-9h16v9M7 20v-4a2 2 0 0 1 4 0v4M13 20v-4a2 2 0 0 1 4 0v4M4 11l8-5 8 5"/>',
    chambers: '<path d="M4 20h16M5 20V9h14v11M5 9l7-4 7 4M9 13h2M13 13h2M9 16h2M13 16h2"/>',
    garden: '<path d="M12 21v-6M8 21c0-4 1-6 4-6s4 2 4 6M6 13a6 6 0 0 1 12 0c-2 1-4 2-6 2s-4-1-6-2zM12 7V4"/>',
    tower: '<path d="M8 21V8h8v13M7 8h10V5h-2v1.5h-2V5h-2v1.5H9V5H7zM11 21v-4h2v4M11 11h2"/>',
    fountain: '<path d="M4 17h16M6 17c0 2 2 4 6 4s6-2 6-4M12 17V9M9 9h6M12 9c-2-2-2-4 0-6 2 2 2 4 0 6"/>',
    coin: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4.5"/>'
};

export function symbolsSvg() {
    const symbols = Object.entries(BUILDING_ICONS).map(([name, shape]) => `<symbol id="b-${name}" viewBox="0 0 24 24">${shape}</symbol>`).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${symbols}</svg>`;
}

export const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#b-${name}"/></svg>`;

// 建物タイル。cost：値段を出すか
export function tileHtml(tile, { cls = '', attrs = '', cost = true } = {}) {
    if (tile === FOUNTAIN) {
        return `<div class="tile fountain ${cls}" ${attrs} role="img" aria-label="噴水">${icon('fountain', 'bicon')}</div>`;
    }
    const t = TILES[tile];
    const walls = ['n', 'e', 's', 'w'].filter(d => t.walls[d]).map(d => `w-${d}`).join(' ');
    const rank = TYPES.indexOf(t.type) + 1;
    const dots = `<span class="dots">${'<i></i>'.repeat(rank)}</span>`;
    return `<div class="tile b-${t.type} ${walls} ${cls}" data-tile="${tile}" ${attrs} role="img" aria-label="${TYPE_NAMES[t.type]} ${t.cost}">
        ${icon(t.type, 'bicon')}${dots}${cost ? `<span class="tcost">${t.cost}</span>` : ''}</div>`;
}

// お金のカード
export function moneyHtml(card, { cls = '', attrs = '' } = {}) {
    return `<div class="money m-${card.currency} ${cls}" ${attrs} role="img" aria-label="${CURRENCY_NAMES[card.currency]}${card.value}">
        <span class="mval">${card.value}</span></div>`;
}

export const coinHtml = (currency, cls = '') => `<span class="coin m-${currency} ${cls}" aria-label="${CURRENCY_NAMES[currency]}">${icon('coin')}</span>`;
