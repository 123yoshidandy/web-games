/**
 * 絵（自作）：カードの表と、色（翡翠・剣・宝塔・星）の印、特別な4枚
 * カードの中身は、カードの幅に対する割合（cqw）で描くので、どの大きさでも同じ見た目になる
 */

import { MAHJONG, DOG, PHOENIX, DRAGON, suitOf, rankOf, rankLabel, cardName, SPECIAL_NAMES } from './cards.js';

export const SUIT_COLORS = ['#25945a', '#3b4a63', '#2a6cc0', '#d0412f'];

// 色の印（-10〜10 の座標）
const SUIT_ICONS = [
    // 翡翠：六角の宝石
    '<path d="M0 -9 8 -4.5v9L0 9l-8-4.5v-9z" fill="currentColor"/><path d="M0 -9v18M-8 -4.5 8 4.5M8 -4.5-8 4.5" stroke="#fff" stroke-opacity=".35" stroke-width="1"/>',
    // 剣：刃とつば
    '<path d="M0 -10 2.4 -6v10h-4.8v-10z" fill="currentColor"/><path d="M-6 4h12" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/><path d="M0 5v5" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"/>',
    // 宝塔：3段の屋根
    '<path d="M0 -10 4 -6.5h-8zM-6 -5h12l-2.5 3h-7zM-8 0h16l-3 3.4h-10zM-4.4 4h8.8v6h-8.8z" fill="currentColor"/>',
    // 星
    '<path d="M0 -9.5 2.8 -3.2 9.4 -2.6 4.4 1.8 5.9 8.6 0 5 -5.9 8.6 -4.4 1.8 -9.4 -2.6 -2.8 -3.2z" fill="currentColor"/>'
];

export const suitIcon = (suit, cls = 'suit') => `<svg class="${cls}" viewBox="-10.5 -10.5 21 21" aria-hidden="true" style="color:${SUIT_COLORS[suit]}">${SUIT_ICONS[suit]}</svg>`;

// 特別な4枚の絵
const SPECIAL_ART = {
    // 麻雀：雀と 1
    [MAHJONG]: '<circle cx="0" cy="1" r="7" fill="#e9a43a"/><circle cx="4" cy="-3.6" r="3.4" fill="#a3651c"/><circle cx="5.2" cy="-4.2" r=".8" fill="#fff"/><path d="M7.4 -3.4 10 -2.6 7.4 -2z" fill="#f2c94c"/><path d="M-6 3-10 7" stroke="#a3651c" stroke-width="2" stroke-linecap="round"/>',
    // 犬：顔
    [DOG]: '<ellipse cx="0" cy="1" rx="7" ry="6.4" fill="#c58b4e"/><path d="M-7 -4-8.6 4.4-4 0zM7 -4 8.6 4.4 4 0z" fill="#7d4f24"/><circle cx="-2.6" cy="-0.4" r="1.1" fill="#222"/><circle cx="2.6" cy="-0.4" r="1.1" fill="#222"/><ellipse cx="0" cy="3.6" rx="2" ry="1.4" fill="#222"/>',
    // 不死鳥：炎の羽
    [PHOENIX]: '<path d="M0 9C-7 5-9-2-4-9c0 5 2 6 4 7 2-1 4-2 4-7 5 7 3 14-4 18z" fill="#e8522f"/><path d="M0 7C-3 4-3 0 0-3c3 3 3 7 0 10z" fill="#ffc94a"/>',
    // 竜：とぐろと頭
    [DRAGON]: '<path d="M-7 6c-3-6 2-11 7-9 5 2 4 8-1 8s-4-5 0-5" fill="none" stroke="#2f9c62" stroke-width="2.6" stroke-linecap="round"/><path d="M3 -4 9 -8 8 -2z" fill="#2f9c62"/><circle cx="6.4" cy="-5.2" r=".9" fill="#ffd54a"/>'
};

const SPECIAL_BG = { [MAHJONG]: '#fff3d6', [DOG]: '#f1e6d6', [PHOENIX]: '#ffe4d6', [DRAGON]: '#e2f4e6' };

// カード1枚。cls と attrs は外の要素に付ける
export function cardHtml(card, { cls = '', attrs = '' } = {}) {
    if (card >= 52) {
        const name = SPECIAL_NAMES[card];
        return `<div class="card special s${card} ${cls}" ${attrs} style="--bg:${SPECIAL_BG[card]}" aria-label="${name}">
            <span class="c-rank">${card === MAHJONG ? '1' : card === DRAGON ? '竜' : card === PHOENIX ? '鳳' : '犬'}</span>
            <svg class="c-art" viewBox="-11 -11 22 22" aria-hidden="true">${SPECIAL_ART[card]}</svg>
            <span class="c-name">${name}</span></div>`;
    }
    const suit = suitOf(card);
    return `<div class="card ${cls}" ${attrs} style="--sc:${SUIT_COLORS[suit]}" aria-label="${cardName(card)}">
        <span class="c-rank">${rankLabel(rankOf(card))}</span>${suitIcon(suit, 'c-suit')}</div>`;
}

export const cardBackHtml = (cls = '') => `<div class="card back ${cls}"></div>`;
