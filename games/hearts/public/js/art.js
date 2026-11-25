/**
 * トランプの絵（自作の SVG と HTML）
 * スートの記号は symbol としてページに一度だけ入れ、use で使い回す
 * ハート・ダイヤは赤、スペード・クラブは濃い紺
 */

import { suitOf, QUEEN } from './game.js';

const SUIT_PATHS = {
    H: '<path d="M12 21.2s-8.6-5.4-8.6-11.4A4.6 4.6 0 0 1 12 7.3a4.6 4.6 0 0 1 8.6 2.5c0 6-8.6 11.4-8.6 11.4z"/>',
    D: '<path d="M12 2.2 19.6 12 12 21.8 4.4 12z"/>',
    S: '<path d="M12 2.4C8.2 7 3.6 9.6 3.6 13.6a4.1 4.1 0 0 0 7.1 2.8L9.4 21.8h5.2l-1.3-5.4a4.1 4.1 0 0 0 7.1-2.8c0-4-4.6-6.6-8.4-11.2z"/>',
    C: '<circle cx="12" cy="7.4" r="4.2"/><circle cx="7" cy="13.4" r="4.2"/><circle cx="17" cy="13.4" r="4.2"/><path d="M12 11.5 9.6 21.8h4.8z"/><circle cx="12" cy="12.6" r="2"/>'
};

export const SUIT_NAMES = { C: 'クラブ', D: 'ダイヤ', S: 'スペード', H: 'ハート' };
export const rankLabel = (card) => (card[0] === 'T' ? '10' : card[0]);
export const cardName = (card) => `${SUIT_NAMES[suitOf(card)]}の${rankLabel(card)}`;

export const symbolsSvg = () => `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${Object.entries(SUIT_PATHS).map(([suit, path]) => `<symbol id="suit-${suit}" viewBox="0 0 24 24">${path}</symbol>`).join('')}</svg>`;

export const suitIcon = (suit, cls = '') => `<svg class="suit ${suit === 'H' || suit === 'D' ? 'red' : 'black'} ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#suit-${suit}"/></svg>`;

// カードの表。左上にランクとスート、真ん中に大きくスート（絵札は大きく文字）
export function cardHtml(card, { cls = '', attrs = '' } = {}) {
    const suit = suitOf(card);
    const rank = rankLabel(card);
    const face = 'JQK'.includes(card[0]);
    const color = suit === 'H' || suit === 'D' ? 'red' : 'black';
    return `<div class="card ${color} ${card === QUEEN ? 'queen' : ''} ${cls}" data-card="${card}" ${attrs} role="img" aria-label="${cardName(card)}">
        <span class="corner"><b>${rank}</b>${suitIcon(suit)}</span>
        ${face ? `<span class="face">${rank}</span>${suitIcon(suit, 'pip small')}` : suitIcon(suit, 'pip')}
    </div>`;
}

export const backHtml = (cls = '') => `<div class="card back ${cls}" aria-hidden="true"></div>`;
