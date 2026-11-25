/**
 * 色とカードの見た目（地図・手札・説明で同じ描き方を使う）
 */

import { CARDS, ITEM_NAMES, SUIT_NAMES, EFFECT_TEXT, QUESTS } from './data.js';

export const SUIT_COLORS = { fox: '#d0432f', rabbit: '#d9b22c', mouse: '#ee9440', bird: '#4f98cc' };
export const FACTION_COLORS = { marquise: '#c9611b', eyrie: '#2c5cae', alliance: '#3b8f4e', vagabond: '#4a4f57' };
const SUIT_MARK = { fox: '狐', rabbit: '兎', mouse: '鼠', bird: '鳥' };

export const suitIcon = (suit) => SUIT_MARK[suit];

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

// 印の小さな丸（中に漢字1字）
export function suitDot(suit) {
    return `<span class="suit-dot s-${suit}" title="${SUIT_NAMES[suit]}">${SUIT_MARK[suit]}</span>`;
}

export function costHtml(cost) {
    if (!cost) return '';
    return cost.map(s => (s === 'any' ? '<span class="suit-dot s-any" title="どれでも">？</span>' : suitDot(s))).join('');
}

// カードの下の一言（アイテムと得点、または効果の種類）
export function cardFoot(card) {
    if (card.item) return ITEM_NAMES[card.item];
    if (card.kind === 'ambush') return '待ち伏せ';
    if (card.kind === 'dominance') return '支配';
    if (card.kind === 'favor') return '恩寵';
    return '効果';
}

export function cardText(card) {
    if (card.item) return `工作すると、${ITEM_NAMES[card.item]}を作って${card.vp}点`;
    if (card.kind === 'ambush') return EFFECT_TEXT.ambush;
    if (card.kind === 'dominance') return EFFECT_TEXT.dominance;
    if (card.kind === 'favor') return `${SUIT_NAMES[card.suit]}の空き地にいる、ほかの陣営の駒をすべて除く（建物・トークンは1つ1点）`;
    return EFFECT_TEXT[card.effect] ?? '';
}

export function cardHtml(id, { cls = '', attrs = '' } = {}) {
    const card = CARDS[id];
    return `<div class="card s-${card.suit} ${cls}" data-card="${id}" ${attrs}>
        <div class="c-band">${SUIT_MARK[card.suit]}${card.item ? `<span class="c-vp">${card.vp}点</span>` : ''}</div>
        <div class="c-name">${escapeHtml(card.name)}</div>
        <div class="c-cost">${costHtml(card.cost)}</div>
        <div class="c-foot">${cardFoot(card)}</div>
    </div>`;
}

export function questHtml(id) {
    const q = QUESTS[id];
    return `<span class="quest">${suitDot(q.suit)}<b>${escapeHtml(q.name)}</b><small>${q.items.map(i => ITEM_NAMES[i]).join('・')}</small></span>`;
}

// 陣営の紋（タイトルとアイコンで使う）
export function emblemSvg(faction, size = 40) {
    const color = FACTION_COLORS[faction];
    const shapes = {
        marquise: `<path d="M9 31 L9 11 L15.5 17 Q20 15.5 24.5 17 L31 11 L31 31 Q20 36 9 31 Z" fill="#fff"/><circle cx="16" cy="24" r="1.8" fill="${color}"/><circle cx="24" cy="24" r="1.8" fill="${color}"/>`,
        eyrie: '<path d="M6 22 Q20 4 34 22 Q26 18 20 26 Q14 18 6 22 Z" fill="#fff"/>',
        alliance: '<path d="M20 6 Q32 16 20 34 Q8 16 20 6 Z M20 12 L20 30" fill="#fff" stroke="' + color + '" stroke-width="2"/>',
        vagabond: '<circle cx="20" cy="13" r="6" fill="#fff"/><path d="M9 33 Q9 20 20 20 Q31 20 31 33 Z" fill="#fff"/>'
    };
    return `<svg class="emblem" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="19" fill="${color}"/>${shapes[faction]}</svg>`;
}
