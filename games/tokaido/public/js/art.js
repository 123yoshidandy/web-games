/**
 * 絵（自作の SVG。浮世絵の淡い色合いを意識した、線と面の簡単な図柄）
 * 何度も使う図柄は symbol としてページに一度だけ入れ、use で使い回す
 */

import { SPACE_TYPES, SOUVENIRS, SOUVENIR_KINDS, DISHES, dishOf, ENCOUNTERS, encounterKind, springValue, TRAVELERS, PANORAMAS } from './data.js';

// マスの色（淡い藍・緑・黄土・朱など）
export const SPACE_COLORS = {
    inn: '#b8574a',
    village: '#a8774c',
    farm: '#b8973f',
    temple: '#7f5f86',
    encounter: '#b06a7e',
    spring: '#5f9598',
    paddy: '#8f9a45',
    mountain: '#5f7a5b',
    sea: '#4f739a'
};

export const SOUVENIR_COLORS = { small: '#4f739a', food: '#a8774c', clothing: '#7f5f86', art: '#b8574a' };

// 線の図柄（viewBox 0 0 24 24、線は currentColor）
const SYMBOLS = {
    // マス
    village: '<path d="M3 10 L12 4 L21 10"/><path d="M5 10 v10 h14 v-10"/><path d="M8 11 v5 M12 11 v5 M16 11 v5"/>',
    farm: '<circle cx="12" cy="12" r="7.5"/><rect x="9.6" y="9.6" width="4.8" height="4.8"/>',
    temple: '<path d="M2.5 8 Q12 3 21.5 8"/><path d="M5 8 v3 h14 v-3"/><path d="M4 14 Q12 10.5 20 14"/><path d="M6.5 14 v6 M17.5 14 v6 M4 20 h16"/>',
    encounter: '<circle cx="8.5" cy="7.5" r="2.6"/><path d="M3.5 19 q0-6.5 5-6.5 t5 6.5"/><circle cx="16" cy="9" r="2.3"/><path d="M13.6 14.2 q1-1.6 2.4-1.6 q4.5 0 4.5 6.4"/>',
    spring: '<path d="M4 14 q8 7 16 0"/><path d="M3 14 h18"/><path d="M8 11 q-1.6-2 0-4 q1.6-2 0-4"/><path d="M12 11 q-1.6-2 0-4 q1.6-2 0-4"/><path d="M16 11 q-1.6-2 0-4 q1.6-2 0-4"/>',
    paddy: '<path d="M3 19 h18 M4 15 h16"/><path d="M8 15 v-6 q0-3 -2-4.5 M8 10 q1.5-3 4-3.5"/><path d="M15 15 v-7 q0-2.5 2-4 M15 9 q-1.5-2.5 -3.6-3"/>',
    mountain: '<path d="M2 19 L10 6 L13 10 L15.5 8 L22 19 Z"/><path d="M7.6 10 L10 6 L12.4 9.4 L11 10.6 L9.6 9.4 Z" fill="currentColor"/>',
    sea: '<path d="M2 17 q3-3 6 0 t6 0 t6 0"/><path d="M4 12.5 q2.5-5.5 7.5-5.5 q-3.5 2 -2 4.5 q1.6 2 4.5 0.5"/><path d="M15 9 q2-2 4.5-1"/>',
    inn: '<path d="M8 4 h8 M8 20 h8"/><path d="M8.5 4.5 q-3.5 7.5 0 15 h7 q3.5-7.5 0-15 Z"/><path d="M6 9 h12 M5.6 12 h12.8 M6 15 h12"/><path d="M12 1.5 v2.5 M12 20 v2.5"/>',
    // 札・お金
    coin: '<circle cx="12" cy="12" r="8"/><rect x="9.8" y="9.8" width="4.4" height="4.4"/>',
    meal: '<path d="M3.5 12 h17 q-1 7 -8.5 7 t-8.5 -7 Z"/><path d="M9 9 q-1-2 0-4 M13 9 q-1-2 0-4"/><path d="M16 3 L21 10 M18 3 L22 9"/>',
    souvenir: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M4 13 h16 M12 9 v11"/><path d="M12 9 q-5-6 -6-1 q2 1.5 6 1 q4 0.5 6-1 q-1-5 -6 1"/>',
    // 画面のボタン
    home: '<path d="M3.5 11.5 L12 4 L20.5 11.5"/><path d="M6 10 v10 h12 v-10"/><path d="M10 20 v-5.5 h4 v5.5"/>',
    log: '<path d="M6 3.5 h9 l3.5 3.5 v13.5 h-12.5 Z"/><path d="M9 10 h6.5 M9 13.5 h6.5 M9 17 h4.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.6 9.4 q0.4-2.6 2.6-2.6 q2.6 0 2.6 2.4 q0 1.6-1.8 2.4 q-1 0.5-1 1.9"/><circle cx="12" cy="17" r="0.6" fill="currentColor"/>',
    check: '<path d="M5 12.5 L10 17.5 L19 7"/>'
};

export function symbolsSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">${Object.entries(SYMBOLS).map(([id, body]) =>
        `<symbol id="i-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`).join('')}</svg>`;
}

export const icon = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

// 小さな丸いマスの印（遊び方・持ち物で使う）
export function spaceBadge(type) {
    return `<span class="badge" style="--c:${SPACE_COLORS[type]}" title="${SPACE_TYPES[type].name}">${icon(type)}</span>`;
}

// 土産の札
export function souvenirCard(id, { cls = '', attrs = '' } = {}) {
    const s = SOUVENIRS[id];
    return `<div class="card souvenir ${cls}" style="--c:${SOUVENIR_COLORS[s.kind]}" ${attrs}>
        <span class="price">${s.price}<small>文</small></span>${icon('souvenir')}
        <span class="name">${s.name}</span><span class="kind">${SOUVENIR_KINDS[s.kind].name}</span></div>`;
}

// 食事の札
export function mealCard(card, { cls = '', attrs = '', price, free = false } = {}) {
    const d = DISHES[dishOf(card)];
    return `<div class="card meal ${cls}" ${attrs}>
        <span class="price">${price === 0 && free ? 'ただ' : `${price ?? d.price}<small>文</small>`}</span>${icon('meal')}
        <span class="name">${d.name}</span><span class="kind">6点</span></div>`;
}

// 出会いの札
export function encounterCard(card, { cls = '', attrs = '' } = {}) {
    const e = ENCOUNTERS[encounterKind(card)];
    return `<div class="card encounter ${cls}" ${attrs}>${icon('encounter')}
        <span class="name">${e.name}</span><span class="kind">${e.text}</span></div>`;
}

// 景色の札（kind の value 枚目）
export function panoramaCard(kind, value, { cls = '', attrs = '' } = {}) {
    return `<div class="card panorama ${cls}" style="--c:${SPACE_COLORS[kind]}" ${attrs}>
        <span class="price">${value ?? ''}</span>${icon(kind)}
        <span class="name">${PANORAMAS[kind].name}の景色</span></div>`;
}

export const springCard = (card) => `<div class="card spring">${icon('spring')}<span class="name">温泉</span><span class="kind">${springValue(card)}点</span></div>`;

// 旅人の札
export function travelerCard(id, { cls = '', attrs = '', color } = {}) {
    const t = TRAVELERS[id];
    return `<div class="traveler ${cls}" ${attrs} ${color ? `style="--pc:${color}"` : ''}>
        <div class="t-head"><span class="t-role">${t.role}</span><span class="t-name">${t.name}</span><span class="t-coins">${t.coins}<small>文</small></span></div>
        <div class="t-text">${t.text}</div></div>`;
}

// タイトルの絵：富士と波と街道（淡い色の面）
export function titleArtSvg() {
    return `<svg viewBox="0 0 320 150" xmlns="http://www.w3.org/2000/svg">
        <defs><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f3dccb"/><stop offset="1" stop-color="#efe6d2" stop-opacity="0"/></linearGradient></defs>
        <rect width="320" height="150" fill="url(#sky)"/>
        <circle cx="250" cy="38" r="17" fill="#d9826e" opacity="0.75"/>
        <path d="M60 118 L150 26 L240 118 Z" fill="#7d93ad"/>
        <path d="M128 49 L150 26 L172 49 L163 56 L155 49 L147 57 L138 50 Z" fill="#f7f1e3"/>
        <path d="M0 116 Q40 100 80 112 T160 110 T240 112 T320 106 V150 H0 Z" fill="#8f9a45" opacity="0.55"/>
        <path d="M0 128 q20-14 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 V150 H0 Z" fill="#4f739a" opacity="0.8"/>
        <path d="M0 128 q20-14 40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0 t40 0" fill="none" stroke="#f7f1e3" stroke-width="1.4" opacity="0.8"/>
        <path d="M18 112 Q90 92 170 100 T310 88" fill="none" stroke="#a8774c" stroke-width="3" stroke-dasharray="2 6" stroke-linecap="round"/>
        <g transform="translate(268 76)" fill="none" stroke="#b8574a" stroke-width="1.6"><path d="M-6 -12 h12 M-6 12 h12"/><path d="M-5 -11 q-4 11 0 22 h10 q4-11 0-22 Z" fill="#f3dccb"/><path d="M-8 -4 h16 M-8 4 h16"/></g>
    </svg>`;
}
