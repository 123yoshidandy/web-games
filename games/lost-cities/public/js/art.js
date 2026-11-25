/**
 * カードと探検の絵（自作の SVG と HTML）
 * 図柄は symbol としてページに一度だけ入れ、use で使い回す
 * 色だけでなく地形の図柄でも見分けられるようにする（黄：砂漠・青：海・白：雪山・緑：密林・赤：火山）
 */

import { CARDS, COLOR_NAMES } from './game.js';

const ICONS = {
    yellow: '<circle cx="16.5" cy="7" r="3"/><path d="M2 19c3-4.5 6.5-5.5 10-3.5 2.6-2.4 6.2-2.6 10 .3V21H2z"/>',
    blue: '<path d="M2 9.5c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.6 5-.6v3.2c-1.5-1-2.5-.6-5 .6s-5 2-7.5 0-5-2-7.5 0z"/><path d="M2 16c2.5-2 5-2 7.5 0s5 2 7.5 0 3.5-1.6 5-.6v3.2c-1.5-1-2.5-.6-5 .6s-5 2-7.5 0-5-2-7.5 0z"/>',
    white: '<path d="M1.5 20 8.5 7l3.5 6 3-4.5 7.5 11.5z"/><path d="M8.5 7 6.3 11.1l2.2-1.1 1.6 1.4zM15 8.5l-1.5 2.3 1.5-.6 1.3.8z" fill="var(--snow, #fff)"/>',
    green: '<path d="M12 21v-8M12 13C8.5 13 5 10.5 4 5.5c4.5-.2 7.7 2.2 8 7.5zM12 13c.3-5.3 3.5-7.7 8-7.5-1 5-4.5 7.5-8 7.5z"/><path d="M12 21v-8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
    red: '<path d="M2 21 8 10h8l6 11z"/><path d="M10.5 10 12 7.5l1.5 2.5M12 2.5v2.5M8.6 4.3l1.4 1.9M15.4 4.3 14 6.2" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/>',
    wager: '<path d="M2.5 10.5 6 7l3 1.5 3-1.5 3 1.5 3-1.5 3.5 3.5-3 3.2-1.4-.8-2.3 2.6c-.6.6-1.5.6-2.1 0l-.4-.4-.6.6c-.6.6-1.5.6-2.1 0l-.5-.5-.4.3c-.6.5-1.5.5-2-.1L5.5 14z"/><path d="M9 8.5l-2.4 2.8c-.4.5.1 1.3.8 1.1l3.6-1.8 3.4 3.2" fill="none" stroke="var(--line, rgba(0,0,0,.35))" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>'
};

export const symbolsSvg = () => `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${
    Object.entries(ICONS).map(([name, shape]) => `<symbol id="icon-${name}" viewBox="0 0 24 24">${shape}</symbol>`).join('')
}</svg>`;

export const icon = (name, cls = '') => `<svg class="icon icon-${name} ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${name}"/></svg>`;

export const cardLabel = (id) => `${COLOR_NAMES[CARDS[id].color]}${CARDS[id].value === 0 ? 'の握手' : CARDS[id].value}`;

// カードの表：左上に数字（握手なら握手の図柄）、真ん中に地形
export function cardHtml(id, { cls = '', attrs = '' } = {}) {
    const { color, value } = CARDS[id];
    const corner = value === 0 ? icon('wager', 'corner-wager') : `<span class="corner">${value}</span>`;
    const center = value === 0 ? icon('wager', 'center-icon') : icon(color, 'center-icon');
    return `<div class="card c-${color} ${value === 0 ? 'wager' : ''} ${cls}" data-card="${id}" ${attrs} role="img" aria-label="${cardLabel(id)}">
        ${corner}${center}${value === 0 ? '' : `<span class="big">${value}</span>`}</div>`;
}

// 探検に並べる小さな札
export function chipHtml(id) {
    const { color, value } = CARDS[id];
    return `<span class="chip c-${color}" data-card="${id}">${value === 0 ? icon('wager') : value}</span>`;
}

export const cardBackHtml = (cls = '') => `<div class="card back ${cls}" aria-hidden="true"><span class="back-mark">LC</span></div>`;
