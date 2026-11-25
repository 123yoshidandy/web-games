/**
 * 宝石・カード・貴族の絵（自作の SVG と HTML）
 * 宝石の図柄は symbol としてページに一度だけ入れ、use で使い回す
 * 色だけでなく形でも見分けられるようにする（白：ブリリアント・青：六角・緑：エメラルドカット・赤：トリリアント・黒：カボション・金：星）
 */

import { CARDS, NOBLES, COLORS, COLOR_NAMES } from './game.js';

const GEM_SHAPES = {
    white: '<path d="M4 9 8 4h8l4 5-8 12z"/><path class="facet" d="M4 9h16M8 4l2 5 2 12 2-12 2-5M10 9l2-5 2 5"/>',
    blue: '<path d="M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3z"/><path class="facet" d="M12 6.5l5 2.9v5.2l-5 2.9-5-2.9V9.4zM12 2.5v4M20.5 7.3l-3.5 2.1M20.5 16.7 17 14.6M12 21.5v-4M3.5 16.7 7 14.6M3.5 7.3 7 9.4"/>',
    green: '<path d="M7.5 3h9L21 7.5v9L16.5 21h-9L3 16.5v-9z"/><path class="facet" d="M8.5 7h7v10h-7zM7.5 3l1 4M16.5 3l-1 4M16.5 21l-1-4M7.5 21l1-4M3 7.5 8.5 7M21 7.5 15.5 7M21 16.5 15.5 17M3 16.5 8.5 17"/>',
    red: '<path d="M12 3.2c.9 0 1.6.5 2 1.2l7.2 12.6c.8 1.4-.2 3-1.8 3H4.6c-1.6 0-2.6-1.6-1.8-3L10 4.4c.4-.7 1.1-1.2 2-1.2z"/><path class="facet" d="M12 8.5l4.6 8H7.4zM12 3.2v5.3M21.2 17.5l-4.6-1M2.8 17.5l4.6-1"/>',
    black: '<circle cx="12" cy="12" r="9"/><path class="facet" d="M7.5 9.5a5.2 5.2 0 0 1 4-3.4"/>',
    gold: '<path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.5 6.6L12 17.1l-6 3.4 1.5-6.6-5-4.5 6.6-.7z"/><path class="facet" d="M12 7.5l1.4 3 3.3.4-2.5 2.2.7 3.3L12 14.7l-2.9 1.7.7-3.3-2.5-2.2 3.3-.4z"/>'
};

// ページに一度だけ入れる symbol の定義
export function gemSymbolsSvg() {
    // use の中身には文書のセレクタが届かないので、色は継承される CSS 変数（--facet・--gem-edge）で決める
    const facet = 'style="fill:none;stroke:var(--facet);stroke-width:1;stroke-linejoin:round"';
    const symbols = Object.entries(GEM_SHAPES)
        .map(([color, shape]) => `<symbol id="gem-${color}" viewBox="0 0 24 24">
            <g style="stroke:var(--gem-edge, none);stroke-width:1.2;stroke-linejoin:round">${shape.replaceAll('class="facet"', facet)}</g></symbol>`).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${symbols}</svg>`;
}

export const gemIcon = (color, cls = '') => `<svg class="gem gem-${color} ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#gem-${color}"/></svg>`;

// 宝石のチップ（丸い駒）。count を付けると数を重ねて出す
export function tokenChip(color, count = null, cls = '') {
    const num = count === null ? '' : `<span class="num">${count}</span>`;
    return `<span class="chip chip-${color} ${cls}" role="img" aria-label="${COLOR_NAMES[color]}${count ?? ''}">${gemIcon(color)}${num}</span>`;
}

const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };

// 発展カードの表。点数（左上）・ボーナスの宝石（右上）・コスト（左下）
export function cardHtml(cardId, { cls = '', attrs = '' } = {}) {
    const card = CARDS[cardId];
    const costs = COLORS.filter(c => card.cost[c] > 0)
        .map(c => `<span class="cost cost-${c}">${card.cost[c]}</span>`).join('');
    return `<div class="card card-${card.bonus} lv${card.level} ${cls}" data-card="${cardId}" ${attrs}
        role="img" aria-label="${COLOR_NAMES[card.bonus]}のカード ${card.points}点">
        <div class="card-band">
            <span class="pts">${card.points > 0 ? card.points : ''}</span>
            ${gemIcon(card.bonus, 'bonus')}
        </div>
        <div class="card-art">${gemIcon(card.bonus, 'watermark')}</div>
        <div class="costs">${costs}</div>
    </div>`;
}

// カードの裏（山札と、ほかの人が伏せて予約したカード）
export function cardBackHtml(level, { cls = '', attrs = '', count = null } = {}) {
    const num = count === null ? '' : `<span class="deck-count">${count}</span>`;
    return `<div class="card-back lv${level} ${cls}" ${attrs} role="img" aria-label="レベル${level}の山札">
        <span class="roman">${ROMAN[level]}</span>${num}</div>`;
}

// 貴族のタイル。3点と、必要なボーナスの色と数
export function nobleHtml(nobleId, { cls = '', attrs = '' } = {}) {
    const noble = NOBLES[nobleId];
    const req = COLORS.filter(c => noble.req[c] > 0)
        .map(c => `<span class="req req-${c}">${noble.req[c]}</span>`).join('');
    return `<div class="noble ${cls}" data-noble="${nobleId}" ${attrs} role="img" aria-label="貴族 ${noble.points}点">
        <svg class="crest" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 17h16l1.5-9-5 3.5L12 5l-4.5 6.5-5-3.5zM4 19.5h16"/></svg>
        <span class="noble-pts">${noble.points}</span>
        <div class="reqs">${req}</div>
    </div>`;
}
