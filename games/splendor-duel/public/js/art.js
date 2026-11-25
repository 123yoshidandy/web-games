/**
 * トークン・カード・王族のカード・特権の巻物の絵（自作の SVG と HTML）
 * トークンの図柄は symbol としてページに一度だけ入れ、use で使い回す
 * 色だけでなく形でも見分けられるようにする（白：ブリリアント・青：六角・緑：エメラルドカット・赤：トリリアント・黒：カボション・
 * パール：真珠・金：星）
 */

import { CARDS, ROYALS, COLOR_NAMES, ABILITY_NAMES, GEM_AND_PEARL } from './game.js';

const GEM_SHAPES = {
    white: '<path d="M4 9 8 4h8l4 5-8 12z"/><path class="facet" d="M4 9h16M8 4l2 5 2 12 2-12 2-5M10 9l2-5 2 5"/>',
    blue: '<path d="M12 2.5 20.5 7.3v9.4L12 21.5l-8.5-4.8V7.3z"/><path class="facet" d="M12 6.5l5 2.9v5.2l-5 2.9-5-2.9V9.4zM12 2.5v4M20.5 7.3l-3.5 2.1M20.5 16.7 17 14.6M12 21.5v-4M3.5 16.7 7 14.6M3.5 7.3 7 9.4"/>',
    green: '<path d="M7.5 3h9L21 7.5v9L16.5 21h-9L3 16.5v-9z"/><path class="facet" d="M8.5 7h7v10h-7zM7.5 3l1 4M16.5 3l-1 4M16.5 21l-1-4M7.5 21l1-4M3 7.5 8.5 7M21 7.5 15.5 7M21 16.5 15.5 17M3 16.5 8.5 17"/>',
    red: '<path d="M12 3.2c.9 0 1.6.5 2 1.2l7.2 12.6c.8 1.4-.2 3-1.8 3H4.6c-1.6 0-2.6-1.6-1.8-3L10 4.4c.4-.7 1.1-1.2 2-1.2z"/><path class="facet" d="M12 8.5l4.6 8H7.4zM12 3.2v5.3M21.2 17.5l-4.6-1M2.8 17.5l4.6-1"/>',
    black: '<circle cx="12" cy="12" r="9"/><path class="facet" d="M7.5 9.5a5.2 5.2 0 0 1 4-3.4"/>',
    pearl: '<circle cx="12" cy="12" r="8.5"/><path class="facet" d="M8 9.5a4.6 4.6 0 0 1 3.6-2.6M15.5 15.8a4.6 4.6 0 0 1-2.2 1.3"/>',
    gold: '<path d="M12 2.5l2.9 6.2 6.6.7-5 4.5 1.5 6.6L12 17.1l-6 3.4 1.5-6.6-5-4.5 6.6-.7z"/><path class="facet" d="M12 7.5l1.4 3 3.3.4-2.5 2.2.7 3.3L12 14.7l-2.9 1.7.7-3.3-2.5-2.2 3.3-.4z"/>'
};

// 線で描くアイコン（能力・王冠・巻物）
const LINE_ICONS = {
    turn: '<path d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4"/>',
    token: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
    privilege: '<path d="M7 4h11a2 2 0 0 1 0 4h-1v10a2 2 0 0 1-2 2H6a2 2 0 0 1 0-4h1zM7 16h8M10 8h4M10 11h4"/>',
    steal: '<path d="M4 12h12M12 7l5 5-5 5M20 5v14"/>',
    crown: '<path d="M4 17h16l1.5-9-5 3.5L12 5l-4.5 6.5-5-3.5zM4 19.5h16"/>',
    wild: '<path d="M12 3l8 9-8 9-8-9z"/><path d="M4 12h16M12 3v18"/>',
    bag: '<path d="M8 7h8l3 4v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-7zM9 7 7.5 3.5h9L15 7"/>'
};

// ページに一度だけ入れる symbol の定義
export function symbolsSvg() {
    // use の中身には文書のセレクタが届かないので、色は継承される CSS 変数（--facet・--gem-edge）で決める
    const facet = 'style="fill:none;stroke:var(--facet);stroke-width:1;stroke-linejoin:round"';
    const gems = Object.entries(GEM_SHAPES)
        .map(([color, shape]) => `<symbol id="gem-${color}" viewBox="0 0 24 24">
            <g style="stroke:var(--gem-edge, none);stroke-width:1.2;stroke-linejoin:round">${shape.replaceAll('class="facet"', facet)}</g></symbol>`).join('');
    const icons = Object.entries(LINE_ICONS)
        .map(([name, shape]) => `<symbol id="icon-${name}" viewBox="0 0 24 24">${shape}</symbol>`).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${gems}${icons}</svg>`;
}

export const gemIcon = (color, cls = '') => `<svg class="gem gem-${color} ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#gem-${color}"/></svg>`;
export const lineIcon = (name, cls = '') => `<svg class="line-icon icon-${name} ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${name}"/></svg>`;

// トークン（丸い駒）。count を付けると数を重ねて出す
export function tokenChip(color, count = null, cls = '') {
    const num = count === null ? '' : `<span class="num">${count}</span>`;
    return `<span class="chip chip-${color} ${cls}" role="img" aria-label="${COLOR_NAMES[color]}${count ?? ''}">${gemIcon(color)}${num}</span>`;
}

// 特権の巻物
export const scrollIcon = (cls = '') => `<span class="scroll ${cls}">${lineIcon('privilege')}</span>`;

const ROMAN = { 1: 'I', 2: 'II', 3: 'III' };

// 色なしのカードの、どの色にもなる宝石の印
const wildGem = () => `<svg class="gem wild-gem" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3 20.5 12H3.5z" style="fill:#e05a62"/><path d="M12 3 20.5 12H12z" style="fill:#4f86e0"/>
    <path d="M3.5 12H12v9z" style="fill:#36a868"/><path d="M12 12h8.5L12 21z" style="fill:#5a5766"/>
    <path d="M12 3 20.5 12 12 21 3.5 12z" style="fill:none;stroke:rgba(0,0,0,.35);stroke-width:1"/></svg>`;

// 宝石のカードの表。点数・王冠・能力（上の帯）、ボーナスの宝石（右上）、コスト（左下）
// color：持っているカードで、色なしのカードが写した色
export function cardHtml(cardId, { cls = '', attrs = '', color = null } = {}) {
    const card = CARDS[cardId];
    const shown = card.color === 'wild' && color ? color : card.color;
    const costs = GEM_AND_PEARL.filter(c => card.cost[c] > 0)
        .map(c => `<span class="cost cost-${c}">${card.cost[c]}</span>`).join('');
    const crowns = card.crowns > 0 ? `<span class="crowns">${lineIcon('crown')}${card.crowns > 1 ? `<b>${card.crowns}</b>` : ''}</span>` : '';
    const ability = card.ability ? `<span class="ability">${lineIcon(card.ability)}</span>` : '';
    let bonus = '';
    if (shown === 'wild') bonus = wildGem();
    else if (shown) bonus = gemIcon(shown, 'bonus') + (card.bonus > 1 ? gemIcon(shown, 'bonus second') : '');
    const label = `${shown === 'wild' ? '色なし' : shown ? COLOR_NAMES[shown] : 'ボーナスなし'}のカード ${card.points}点${card.crowns ? ` 王冠${card.crowns}` : ''}${card.ability ? ` ${ABILITY_NAMES[card.ability]}` : ''}`;
    return `<div class="card card-${shown ?? 'none'} lv${card.level} ${card.bonus > 1 ? 'double' : ''} ${cls}" data-card="${cardId}" ${attrs}
        role="img" aria-label="${label}">
        <div class="card-band">
            <span class="pts">${card.points > 0 ? card.points : ''}</span>${crowns}${ability}
            <span class="bonus-gems">${bonus}</span>
        </div>
        <div class="card-art">${shown && shown !== 'wild' ? gemIcon(shown, 'watermark') : ''}</div>
        <div class="costs">${costs}</div>
    </div>`;
}

// カードの裏（山札と、相手が伏せて予約したカード）
export function cardBackHtml(level, { cls = '', attrs = '', count = null } = {}) {
    const num = count === null ? '' : `<span class="deck-count">${count}</span>`;
    return `<div class="card-back lv${level} ${cls}" ${attrs} role="img" aria-label="${level}段目の山札">
        <span class="roman">${ROMAN[level]}</span>${num}</div>`;
}

// 王族のカード。点と能力
export function royalHtml(royalId, { cls = '', attrs = '' } = {}) {
    const royal = ROYALS[royalId];
    const ability = royal.ability ? lineIcon(royal.ability, 'royal-ability') : '';
    return `<div class="royal ${cls}" data-royal="${royalId}" ${attrs} role="img"
        aria-label="王族のカード ${royal.points}点${royal.ability ? ` ${ABILITY_NAMES[royal.ability]}` : ''}">
        ${lineIcon('crown', 'royal-crest')}
        <span class="royal-pts">${royal.points}</span>${ability}
    </div>`;
}
