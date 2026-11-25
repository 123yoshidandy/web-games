/**
 * カードの絵（自作の SVG と HTML）。DOM に依存しない（文字列を返すだけ）
 */

import { CARDS } from './cards.js';

// 値ごとの色（帯と数字の丸）
export const CARD_COLORS = ['#5b6170', '#8a6d3b', '#7b4fa0', '#3f6fa8', '#4f9a7a', '#c0703a', '#2f8f9a', '#b8424c', '#6a5acd', '#d4a017'];

// カードに書く短い効果（手札の大きさでも読める長さ）
export const SHORT_TEXT = [
    '終わりに自分だけなら +1',
    '手札を当てれば脱落',
    '相手の手札を見る',
    '比べて小さい方が脱落',
    '次の番まで守られる',
    '捨てて引き直させる',
    '2枚引いて1枚残す',
    '手札を交換する',
    '将軍・魔術師と一緒なら出す',
    '捨てたら脱落'
];

// 値ごとの図柄（線の絵。24×24）
const EMBLEMS = [
    // スパイ：仮面
    '<path d="M3 9c3-2 6-2 9 0 3-2 6-2 9 0-1 4-3 6-5 6s-3-2-4-3c-1 1-2 3-4 3s-4-2-5-6z"/><circle cx="8" cy="10.5" r="1.3"/><circle cx="16" cy="10.5" r="1.3"/>',
    // 兵士：槍
    '<path d="M12 2l3 5h-2v15h-2V7H9z"/><path d="M8 18h8"/>',
    // 道化：鈴の帽子
    '<path d="M4 16c1-6 4-10 8-10s7 4 8 10"/><path d="M4 16l-1 3M20 16l1 3M12 6V3"/><circle cx="3" cy="20" r="1.2"/><circle cx="21" cy="20" r="1.2"/><circle cx="12" cy="2.5" r="1.2"/><path d="M5 16h14"/>',
    // 騎士：交差した 2 本の剣
    '<path d="M5 19L17 5l2-1-1 2L5 19"/><path d="M19 19L7 5 5 4l1 2 13 13"/><path d="M4 15l5 5M20 15l-5 5"/>',
    // 僧侶：盾と十字
    '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/><path d="M12 8v8M9 11h6"/>',
    // 魔術師：星の杖
    '<path d="M6 21L15 9"/><path d="M17 3l1.2 2.6 2.8.4-2 2 .5 2.8L17 9.5 14.5 10.8l.5-2.8-2-2 2.8-.4z"/>',
    // 宰相：巻物
    '<path d="M6 4h11a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7"/><path d="M6 4a2 2 0 0 0-2 2v1h4V6a2 2 0 0 0-2-2zM7 20a2 2 0 0 1-2-2v-1h4v1a2 2 0 0 1-2 2z"/><path d="M10 9h6M10 12h6M10 15h4"/>',
    // 将軍：王冠
    '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/><path d="M5 19h14"/>',
    // 大臣：羽根ペン
    '<path d="M20 3C12 5 7 11 5 19"/><path d="M20 3c-1 6-5 10-11 12"/><path d="M4 21l2-3"/>',
    // 姫：手紙とハート
    '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 7l9 6 9-6"/><path d="M12 17c-2-1.5-3-2.5-3-3.6a1.5 1.5 0 0 1 3-.6 1.5 1.5 0 0 1 3 .6c0 1.1-1 2.1-3 3.6z"/>'
];

export function emblemSvg(value, cls = 'emblem') {
    return `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true">${EMBLEMS[value]}</svg>`;
}

// カードの表（size：'hand' 大きい / 'mid' 中 / 'mini' 数字だけの小さい札）
export function cardFace(value, { size = 'hand', extra = '' } = {}) {
    const card = CARDS[value];
    const color = CARD_COLORS[value];
    if (size === 'mini') {
        return `<span class="mini-card ${extra}" style="--card-color:${color}" title="${card.name}">${value}</span>`;
    }
    return `<div class="card card-${size} ${extra}" style="--card-color:${color}" data-value="${value}">
        <div class="card-head"><span class="card-value">${value}</span><span class="card-name">${card.name}</span></div>
        ${emblemSvg(value)}
        ${size === 'hand' ? `<div class="card-text">${SHORT_TEXT[value]}</div>` : ''}
    </div>`;
}

// カードの裏
export function cardBack(extra = '') {
    return `<div class="card card-back ${extra}"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20c-5-3.5-8-6.5-8-10a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 10c0 3.5-3 6.5-8 10z"/></svg></div>`;
}
