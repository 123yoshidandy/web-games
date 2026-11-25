/**
 * カード・トークン・印の絵（自作の SVG と HTML）
 * 図柄は symbol としてページに一度だけ入れ、use で使い回す
 * 色と形の両方で見分けられるようにする（ダイヤ：宝石・金：延べ棒・銀：硬貨の山・布：反物・香辛料：袋・革：なめし革・ラクダ）
 */

import { NAMES } from './game.js';

const ICONS = {
    diamond: '<path d="M4 9.5 8 4.5h8l4 5-8 11z"/><path d="M4 9.5h16M8 4.5l2 5 2 11 2-11 2-5M10 9.5l2-5 2 5" fill="none" stroke="var(--line)" stroke-width="1" stroke-linejoin="round"/>',
    gold: '<path d="M6.5 8.5h11l3.5 9H3z"/><path d="M6.5 8.5 8 12.5h8l1.5-4M8 12.5 6.6 17.5M16 12.5l1.4 5" fill="none" stroke="var(--line)" stroke-width="1" stroke-linejoin="round"/>',
    silver: '<ellipse cx="12" cy="17" rx="7" ry="2.6"/><path d="M5 17v-3.2M19 17v-3.2" stroke="currentColor" stroke-width="2"/><ellipse cx="12" cy="13.6" rx="7" ry="2.6"/><path d="M5 13.6v-3.2M19 13.6v-3.2" stroke="currentColor" stroke-width="2"/><ellipse cx="12" cy="10.2" rx="7" ry="2.6"/><ellipse cx="12" cy="10.2" rx="4" ry="1.3" fill="none" stroke="var(--line)" stroke-width="1"/>',
    cloth: '<path d="M4 6c2.7-1.3 5.3 1.3 8 0s5.3-1.3 8 0v11c-2.7-1.3-5.3 1.3-8 0s-5.3-1.3-8 0z"/><path d="M4 10c2.7-1.3 5.3 1.3 8 0s5.3-1.3 8 0M4 13.6c2.7-1.3 5.3 1.3 8 0s5.3-1.3 8 0" fill="none" stroke="var(--line)" stroke-width="1"/>',
    spice: '<path d="M9 6.5h6l-1 2.2c3.3 1.4 5.2 4.2 5.2 7.3 0 2.8-2.9 4-7.2 4s-7.2-1.2-7.2-4c0-3.1 1.9-5.9 5.2-7.3z"/><path d="M8.6 4.2c1.2.8 5.6.8 6.8 0M9.6 8.7h4.8" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/><circle cx="10" cy="14.5" r=".9" fill="var(--line)"/><circle cx="13.5" cy="16.2" r=".9" fill="var(--line)"/><circle cx="12.6" cy="12.8" r=".9" fill="var(--line)"/>',
    leather: '<path d="M7 4.5c1.6 1 3.2 1.4 5 1.4s3.4-.4 5-1.4c.4 1.6 1.4 2.6 3 3-.9 1.8-.9 3.6 0 5.4-1.6.6-2.4 1.8-2.4 3.4.1 1.5-.5 2.7-1.8 3.5-1.1-.9-2.4-1.3-3.8-1.3s-2.7.4-3.8 1.3c-1.3-.8-1.9-2-1.8-3.5 0-1.6-.8-2.8-2.4-3.4.9-1.8.9-3.6 0-5.4 1.6-.4 2.6-1.4 3-3z"/><path d="M8.6 8.4c2.2.9 4.6.9 6.8 0M8.6 15c2.2-.9 4.6-.9 6.8 0" fill="none" stroke="var(--line)" stroke-width="1" stroke-dasharray="1.4 1.2"/>',
    camel: '<path d="M2.6 9.4c.4-1.4 1.5-2.1 2.7-1.8.9.2 1.4.9 1.5 1.9.2 1.7.4 3 1.4 3.7.6-2.5 1.8-4.2 3.4-4.2 1.4 0 2.1 1 2.6 2 .5-1.1 1.3-1.9 2.5-1.9 1.9 0 3.1 2 3.4 5.2.2 1.6.1 2.8-.6 3.7v3.6h-1.6l-.3-3.2-.7.1-.6 3.1h-1.6l.2-3.3c-2 .4-4.3.4-6.3 0l-.1 3.3H6.9l-.3-3.6-.5 3.6H4.6l.3-4.2c-.6-.8-.9-2-1-3.5-.1-1-.3-1.8-.8-2.2-.4.4-.8.3-.9-.2z"/><circle cx="4.2" cy="8.9" r=".5" fill="var(--line)"/>'
};

export const symbolsSvg = () => `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${
    Object.entries(ICONS).map(([type, shape]) => `<symbol id="icon-${type}" viewBox="0 0 24 24">${shape}</symbol>`).join('')
}<symbol id="icon-seal" viewBox="0 0 24 24"><path d="M12 2.5l2.1 1.6 2.6-.3 1 2.4 2.4 1-.3 2.6 1.6 2.1-1.6 2.1.3 2.6-2.4 1-1 2.4-2.6-.3-2.1 1.6-2.1-1.6-2.6.3-1-2.4-2.4-1 .3-2.6-1.6-2.1 1.6-2.1-.3-2.6 2.4-1 1-2.4 2.6.3z"/><circle cx="12" cy="12" r="5.2" fill="none" stroke="var(--line)" stroke-width="1.2"/><path d="M9.6 12.2l1.7 1.7 3.3-3.6" fill="none" stroke="var(--line)" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></symbol></svg>`;

export const icon = (type, cls = '') => `<svg class="icon icon-${type} ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${type}"/></svg>`;

// カードの表
export function cardHtml(type, { cls = '', attrs = '' } = {}) {
    return `<div class="card card-${type} ${cls}" data-type="${type}" ${attrs} role="img" aria-label="${NAMES[type]}">
        ${icon(type, 'card-icon')}<span class="card-name">${NAMES[type]}</span></div>`;
}

export const cardBackHtml = (cls = '') => `<div class="card back ${cls}" aria-hidden="true">${icon('camel', 'back-icon')}</div>`;

// 商品トークン（丸）。value が null なら伏せたボーナス
export const tokenHtml = (kind, value, cls = '') => `<span class="token token-${kind} ${cls}">${value ?? '?'}</span>`;

export const sealHtml = (on, cls = '') => `<svg class="seal ${on ? 'on' : ''} ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-seal"/></svg>`;
