/**
 * 絵（すべて自作の SVG。公式の画像は使わない）
 * 線で描く 24×24 のアイコンを symbol としてページに 1 度だけ入れ、use で使い回す
 */

import { CARDS, ELEMENTS, POKEMON } from './data.js';

// 線のアイコン（stroke: currentColor）
const LINE = {
    home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v9h12v-9"/><path d="M10 19v-5h4v5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><path d="M12 17.2v.1"/>',
    log: '<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.1M4 12h.1M4 18h.1"/>',
    close: '<path d="M6 6l12 12M18 6 6 18"/>',
    deck: '<rect x="5" y="4" width="11" height="15" rx="2"/><path d="M8 20h9a2 2 0 0 0 2-2V7"/>',
    hand: '<rect x="4" y="6" width="9" height="13" rx="1.5" transform="rotate(-10 8 12)"/><rect x="11" y="5" width="9" height="13" rx="1.5" transform="rotate(8 15 11)"/>',
    swap: '<path d="M5 9h13l-3-3"/><path d="M19 15H6l3 3"/>',
    up: '<path d="M12 19V6"/><path d="m6 11 6-6 6 6"/>',
    // 役割
    leader: '<path d="M12 3 19 6v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="m12 8 1.3 2.7 3 .4-2.2 2 .6 2.9L12 14.6 9.3 16l.6-2.9-2.2-2 3-.4z"/>',
    trainer: '<path d="M4 15c0-5 3.6-8 8-8s8 3 8 8"/><path d="M2.5 15.5h19"/><path d="M12 7v8"/><circle cx="12" cy="11" r="1.6"/>',
    challenger: '<path d="M6 21V4"/><path d="M6 4h11l-2.5 4L17 12H6"/>',
    rocket: '<path d="M3 10c2-2 5-2.5 9-2.5s7 .5 9 2.5c-.5 3-2.5 5-5 5-1.8 0-2.8-1.3-4-1.3s-2.2 1.3-4 1.3c-2.5 0-4.5-2-5-5z"/><path d="M8 11.3h.1M16 11.3h.1"/>',
    unknown: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14"/><path d="M12 17.2v.1"/>',
    out: '<circle cx="12" cy="12" r="9"/><path d="m8 8 8 8M16 8l-8 8"/>',
    // おてんき
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>',
    rain: '<path d="M7 15a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8a3.5 3.5 0 0 1 .5 7z"/><path d="m8 18-1 2.5M12.5 18l-1 2.5M17 18l-1 2.5"/>',
    sand: '<path d="M3 8h11a3 3 0 1 0-3-3"/><path d="M3 13h15a3 3 0 1 1-3 3"/><path d="M3 18h7"/>',
    snow: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/><path d="m9.5 4.5 2.5 2 2.5-2M9.5 19.5l2.5-2 2.5 2"/>',
    // カード
    kurae: '<path d="m12 2.5 1.8 5.3 5.4-2.3-2.4 5.2 5 2.4-5.3 1.6 1.8 5.4-5.3-2.6L12 21.5l-1.4-4.6-5.3 2.6 1.8-5.4L1.7 12.5l5-2.4-2.4-5.2 5.4 2.3z"/>',
    yokete: '<path d="M4 7h9M2 12h10M4 17h9"/><path d="M14 5c4 1.5 6 4 6 7s-2 5.5-6 7"/>',
    potion: '<path d="M9 3h6M10 3v3h4V3"/><rect x="6" y="6" width="12" height="15" rx="3"/><path d="M12 10v7M8.5 13.5h7"/>',
    revive: '<path d="M12 3 19 9.5 12 21 5 9.5z"/><path d="M5 9.5h14M9 9.5 12 3l3 6.5L12 21z"/>',
    nugget: '<circle cx="12" cy="12" r="8"/><path d="M8.5 9.5a4 4 0 0 1 3-2.5"/>',
    fullHeal: '<path d="M10 3h4v3h-4z"/><path d="M8 6h8l1 3v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9z"/><path d="M10 14h4M12 12v4"/>',
    rareCandy: '<rect x="8" y="8" width="8" height="8" rx="2.5" transform="rotate(45 12 12)"/><path d="m4 4 3 1.5L5.5 7zM20 20l-3-1.5 1.5-1.5z"/>',
    lifeOrb: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3.5 2.5"/>',
    choiceBand: '<path d="M3 10c3-2 15-2 18 0v4c-3 2-15 2-18 0z"/><path d="M17 14l2 6M19 13.5l3 4.5"/>',
    rockyHelmet: '<path d="M4 15a8 8 0 0 1 16 0v2H4z"/><path d="m7 9-2-2M12 7V4M17 9l2-2"/>',
    poisonBarb: '<path d="M12 3v12"/><path d="m8 7 4-4 4 4"/><circle cx="12" cy="18.5" r="2.5"/>',
    flameOrb: '<circle cx="12" cy="13" r="7"/><path d="M12 16.5c-1.8 0-3-1.2-3-2.8 0-2 3-4.2 3-6.2 1.5 1.5 3 3.5 3 5.6 0 2-1.2 3.4-3 3.4z"/>',
    lightBall: '<circle cx="12" cy="12" r="8"/><path d="m13 6-4 7h4l-2 5"/>',
    leftovers: '<path d="M5 13a7 7 0 0 0 14 0z"/><path d="M12 13V8c0-2 1.5-3 3-3"/>',
    kingsRock: '<path d="m4 18 1.5-10 4.5 4 2-6 2 6 4.5-4L20 18z"/><path d="M4 21h16"/>',
    brightPowder: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4"/><path d="m12 8 1.2 2.8L16 12l-2.8 1.2L12 16l-1.2-2.8L8 12l2.8-1.2z"/>',
    blunderPolicy: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7M8.5 12h7M8.5 16h4"/>',
    stealthCloak: '<path d="M12 3c-3 0-5 2-5 5v3l-3 9h16l-3-9V8c0-3-2-5-5-5z"/><path d="M9.5 10.5h5"/>',
    mewtwo: '<circle cx="12" cy="12" r="3"/><path d="M12 3a9 9 0 1 1-9 9"/><path d="M12 7a5 5 0 1 1-5 5"/>',
    moltres: '<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-4.4 6.5-8 6.5-12 2.5 2.5 6.5 6.8 6.5 11.5 0 3.7-2.6 6.5-6.5 6.5z"/><path d="M12 21c-1.6 0-2.8-1.2-2.8-2.8 0-2 2.8-3.5 2.8-5.5 1.3 1.3 2.8 3 2.8 5 0 2-1.3 3.3-2.8 3.3z"/>',
    zapdos: '<path d="m13.5 2-8 12h6l-1 8 8-12h-6z"/>',
    mew: '<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z"/>',
    berries: '<circle cx="8.5" cy="15" r="4.5"/><circle cx="16" cy="13" r="4"/><path d="M8.5 10.5 11 5l5 4"/>',
    mrMime: '<path d="M8 13V6a1.5 1.5 0 0 1 3 0v6M11 11V4.5a1.5 1.5 0 0 1 3 0V11M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.5 0-4-1.5-5.5-4L4 13.5a1.5 1.5 0 0 1 2.5-1.5L8 13.5"/>',
    farfetchd: '<path d="M4 20 18 6"/><path d="M14 4c3 0 6 3 6 6l-4 .5-.5-4z"/>',
    jigglypuff: '<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>',
    rival: '<path d="m4 4 7 7M4 4h3.5M4 4v3.5"/><path d="m20 4-7 7M20 4h-3.5M20 4v3.5"/><path d="m8 15-4 4M16 15l4 4M7 13l4 4M17 13l-4 4"/>',
    articuno: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6z"/><path d="M12 8v9M8.5 10.5l7 4M8.5 14.5l7-4"/>',
    // 属性（ポケモンの絵）
    grass: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14z"/><path d="M5 19 13 11"/>',
    fire: '<path d="M12 21c-4 0-6.5-2.6-6.5-6 0-4.4 6.5-8 6.5-12 2.5 2.5 6.5 6.8 6.5 11.5 0 3.7-2.6 6.5-6.5 6.5z"/>',
    water: '<path d="M12 3c3.5 4.5 6 8 6 11a6 6 0 0 1-12 0c0-3 2.5-6.5 6-11z"/>',
    flying: '<path d="M3 13c4-1 6-4 7-8 1 4 2 5 4 6 2-2 4-3 7-3-2 3-3 6-7 8-3 1.5-7 .5-11-3z"/>',
    poison: '<circle cx="10" cy="14" r="6"/><circle cx="17" cy="7" r="3"/><circle cx="19" cy="15" r="1.6"/>',
    fighting: '<path d="M7 11V6.5a1.5 1.5 0 0 1 3 0V10M10 9V5.5a1.5 1.5 0 0 1 3 0V10M13 9.5V6.5a1.5 1.5 0 0 1 3 0v3.5M16 10V8.5a1.5 1.5 0 0 1 3 0V14c0 4-2.5 6.5-6.5 6.5S6 18 6 14v-2.5a1.5 1.5 0 0 1 3 0"/>',
    ghost: '<path d="M5 21V11a7 7 0 0 1 14 0v10l-2.3-1.8L14.3 21 12 19.2 9.7 21l-2.4-1.8z"/><path d="M9.5 11h.1M14.5 11h.1"/>',
    electric: '<path d="m13.5 2-8 12h6l-1 8 8-12h-6z"/>',
    ground: '<path d="M2 19 8.5 8l4 6 2.5-3.5L22 19z"/>',
    normal: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/>',
    ice: '<path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"/>',
    psychic: '<path d="M12 12a2 2 0 1 1 2 2 4 4 0 1 1-4-4 6 6 0 1 1 6 6 8 8 0 1 1-8-8"/>',
    rock: '<path d="m4 15 3-8 6-3 6 5 1 7-6 4-7-1z"/><path d="m7 7 4 5 8-3M11 12l-1 8"/>'
};

export function spritesMarkup() {
    return Object.entries(LINE).map(([id, body]) => `<symbol id="i-${id}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</symbol>`).join('');
}

export const icon = (id, cls = 'icon') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

// カードの絵：種類ごとの色の地に、カードのアイコン
export const CARD_COLORS = { attack: '#d9483b', dodge: '#3f86d6', tool: '#3a9a6a', item: '#8a63c9', event: '#d99a2b' };

export function cardArt(key) {
    return `<span class="card-art" style="--card:${CARD_COLORS[CARDS[key].kind]}">${icon(key, 'card-icon')}</span>`;
}

// ポケモンの絵：属性の色の地に、属性の記号
export function monArt(id, cls = 'mon-art') {
    const el = POKEMON[id].element;
    return `<span class="${cls}" style="--el:${ELEMENTS[el].color}">${icon(el, 'mon-icon')}</span>`;
}

// タイトルの絵：4 つの役割の札と、？
export function titleArt() {
    const roles = [['leader', '#e2b33b'], ['trainer', '#4f9fd6'], ['challenger', '#5fb46b'], ['rocket', '#d9483b']];
    return `<div class="title-roles">${roles.map(([r, c], i) => `<span class="title-role" style="--c:${c};--i:${i}">${icon(r, 'title-role-icon')}</span>`).join('')}</div>`;
}
