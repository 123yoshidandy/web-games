/**
 * 絵（カードの折り紙の図柄・記号）。すべて自作の SVG
 * 図柄は symbol としてページに一度だけ入れ、use で使い回す
 * 図柄は currentColor で塗り、折り目は少し暗くする（use の中は CSS のセレクタが効かないので、属性で塗る）。カードの地の色は CSS で決める
 */

import { CARDS, TYPES, COLOR_NAMES, MULTIPLIERS } from './cards.js';

const FOLD = 'fill="rgba(0,0,0,.16)"';

// 折り紙の図柄（viewBox 0 0 48 48）
const FIGURES = {
    crab: `<path d="M13 25 18 18h12l5 7-5 7H18z"/><path ${FOLD} d="M18 18h12l-6 7z"/>
        <path d="M5 13 11 7l4 6-3 7zM43 13l-6-6-4 6 3 7z"/><path ${FOLD} d="M11 7l4 6-6 1zM37 7l-4 6 6 1z"/>
        <path d="M12 20l3 3M36 20l-3 3M20 18l-1-5M28 18l1-5M15 30l-6 5M18 32l-3 7M30 32l3 7M33 30l6 5" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
        <circle cx="19" cy="12" r="1.8"/><circle cx="29" cy="12" r="1.8"/>`,
    boat: `<path d="M4 27h40l-8 11H12z"/><path d="M12 27 24 7l12 20z"/><path ${FOLD} d="M24 7l12 20H24z"/><path ${FOLD} d="M24 27h20l-8 11H24z"/>`,
    fish: `<path d="M7 24 21 12l15 12-15 12z"/><path d="M35 24l9-9v18z"/><path ${FOLD} d="M21 12l15 12H21z"/><path ${FOLD} d="M35 24l9 9v-9z"/>
        <circle cx="15" cy="22" r="1.9" fill="rgba(0,0,0,.55)"/>`,
    swimmer: `<circle cx="31" cy="15" r="4.5"/><path d="M7 22 27 17l4 5-20 5z"/><path ${FOLD} d="M27 17l4 5-8 1z"/><path d="M34 21l9-6 1 4-8 6z"/>
        <path d="M3 33q5-4 10 0t10 0 10 0 10 0M7 40q5-4 10 0t10 0 10 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
    shark: `<path d="M5 27 16 20l18-1 9 6-8 5-17 2z"/><path d="M20 20 27 7l4 13z"/><path d="M5 27 1 18l3 9-3 9z"/>
        <path ${FOLD} d="M5 27h38l-8 3-17 2z"/><path ${FOLD} d="M27 7l4 13h-4z"/><circle cx="36" cy="23.5" r="1.6" fill="rgba(0,0,0,.55)"/>
        <path d="M3 40q5-4 10 0t10 0 10 0 10 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`,
    shell: `<path d="M24 40 5 21l4-8 7-5 8-2 8 2 7 5 4 8z"/><path ${FOLD} d="M24 40 9 13l7-5zM24 40l8-32 7 5z"/>
        <path d="M24 40 24 6" fill="none" stroke="rgba(0,0,0,.18)" stroke-width="1.2"/><path d="M19 40h10l-2 4h-6z"/>`,
    octopus: `<path d="M13 24 15 11l9-6 9 6 2 13z"/><path ${FOLD} d="M24 5l9 6 2 13H24z"/>
        <path d="M15 24q-6 6-3 14M20 25q-2 8 1 15M28 25q2 8-1 15M33 24q6 6 3 14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/>
        <circle cx="20" cy="17" r="1.8" fill="rgba(0,0,0,.55)"/><circle cx="28" cy="17" r="1.8" fill="rgba(0,0,0,.55)"/>`,
    penguin: `<path d="M16 42 13 25l4-15 7-5 7 5 4 15-3 17z"/><path ${FOLD} d="M16 42 13 25l4-15 3 14-1 18zM32 42l3-17-4-15-3 14 1 18z"/>
        <path d="M22 13l4 2-4 2z" fill="#f0a73a"/><circle cx="22" cy="11" r="1.5" fill="rgba(0,0,0,.55)"/><path d="M15 42h6l-3 3zM27 42h6l-3 3z"/>`,
    sailor: `<path d="M11 45 13 35l11-4 11 4 2 10z"/><path ${FOLD} d="M24 31l11 4 2 10H24z"/><path d="M19 32l5 8 5-8z" fill="rgba(0,0,0,.28)"/>
        <circle cx="24" cy="22" r="7.5"/><path ${FOLD} d="M24 14.5a7.5 7.5 0 0 1 0 15z"/>
        <path d="M14 15q10-9 20 0l1.5 2.5h-23z"/><path ${FOLD} d="M24 9.5q6 0 10 5.5l1.5 2.5H24z"/>
        <circle cx="21" cy="22" r="1.2" fill="rgba(0,0,0,.55)"/><circle cx="27" cy="22" r="1.2" fill="rgba(0,0,0,.55)"/>`,
    lighthouse: `<path d="M18 43 20 17h8l2 26z"/><path ${FOLD} d="M24 17h4l2 26h-6z"/><path d="M19 17h10l-2-6h-6z"/><path d="M17 11h14l-7-6z"/>
        <path d="M19.3 26h9.4l.4 5h-10.2zM18.7 35h10.6l.4 5h-11.4z" fill="rgba(0,0,0,.22)"/>
        <path d="M14 13 5 10M14 17l-9 2M34 13l9-3M34 17l9 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>`,
    shoal: `<g transform="translate(0 -1) scale(.55)"><path d="M7 24 21 12l15 12-15 12z"/><path d="M35 24l9-9v18z"/><path ${FOLD} d="M21 12l15 12H21z"/></g>
        <g transform="translate(20 10) scale(.55)"><path d="M7 24 21 12l15 12-15 12z"/><path d="M35 24l9-9v18z"/><path ${FOLD} d="M21 12l15 12H21z"/></g>
        <g transform="translate(6 21) scale(.55)"><path d="M7 24 21 12l15 12-15 12z"/><path d="M35 24l9-9v18z"/><path ${FOLD} d="M21 12l15 12H21z"/></g>`,
    colony: `<g transform="translate(-2 6) scale(.6)"><path d="M16 42 13 25l4-15 7-5 7 5 4 15-3 17z"/><path ${FOLD} d="M16 42 13 25l4-15 3 14-1 18z"/><path d="M22 13l4 2-4 2z" fill="#f0a73a"/><circle cx="22" cy="11" r="1.5" fill="rgba(0,0,0,.55)"/></g>
        <g transform="translate(20 6) scale(.6)"><path d="M16 42 13 25l4-15 7-5 7 5 4 15-3 17z"/><path ${FOLD} d="M16 42 13 25l4-15 3 14-1 18z"/><path d="M22 13l4 2-4 2z" fill="#f0a73a"/><circle cx="22" cy="11" r="1.5" fill="rgba(0,0,0,.55)"/></g>
        <g transform="translate(9 -1) scale(.6)"><path d="M16 42 13 25l4-15 7-5 7 5 4 15-3 17z"/><path ${FOLD} d="M16 42 13 25l4-15 3 14-1 18z"/><path d="M22 13l4 2-4 2z" fill="#f0a73a"/><circle cx="22" cy="11" r="1.5" fill="rgba(0,0,0,.55)"/></g>`,
    captain: `<path d="M11 45 13 35l11-4 11 4 2 10z"/><path ${FOLD} d="M24 31l11 4 2 10H24z"/><path d="M23 33h2v12h-2z" fill="rgba(0,0,0,.28)"/>
        <circle cx="24" cy="23" r="7.5"/><path ${FOLD} d="M24 15.5a7.5 7.5 0 0 1 0 15z"/>
        <path d="M12 9h24l-2 7H14z"/><path ${FOLD} d="M24 9h12l-2 7H24z"/><path d="M14 16h20l-3 3.5H17z" fill="rgba(0,0,0,.45)"/>
        <circle cx="24" cy="12.5" r="1.8" fill="#f0c04a"/>
        <circle cx="21" cy="24" r="1.2" fill="rgba(0,0,0,.55)"/><circle cx="27" cy="24" r="1.2" fill="rgba(0,0,0,.55)"/><path d="M18 27q6 7 12 0l-1 4q-5 4-10 0z"/>`,
    mermaid: `<circle cx="24" cy="8" r="4.5"/><path d="M19 14h10l1 10H18z"/><path ${FOLD} d="M24 14h5l1 10h-6z"/><path d="M18 24h12l-3 11-3 4-3-4z"/>
        <path ${FOLD} d="M24 24h6l-3 11-3 4z"/><path d="M24 38l-9 6 9-2 9 2z"/><path d="M19.5 6q-3 6 0 12" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>`
};

// 線の記号（viewBox 0 0 24 24、stroke で描く）
const ICONS = {
    home: '<path d="M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.2v.1"/>',
    // カニ：捨て札の山から1枚
    pile: '<rect x="5" y="9" width="11" height="12" rx="1.5"/><path d="M8 6h10.5A1.5 1.5 0 0 1 20 7.5V18"/><path d="M10.5 17v-5M8.5 14l2-2 2 2"/>',
    // ボート：もう1回
    again: '<path d="M19 12a7 7 0 1 1-2.1-5"/><path d="M17.5 3.5v4h-4"/>',
    // 魚：山札から1枚
    draw: '<rect x="6" y="4" width="12" height="16" rx="2"/><path d="M12 9v6M9 12h6"/>',
    // 泳ぐ人とサメ：取る
    steal: '<path d="M4 12h12M12 8l4 4-4 4"/><rect x="17" y="6" width="4" height="12" rx="1"/>',
    deck: '<rect x="5" y="5" width="12" height="15" rx="2"/><path d="M8 3h10a2 2 0 0 1 2 2v13"/>',
    cards: '<rect x="4" y="6" width="11" height="14" rx="2"/><path d="M9 3.5h9a2 2 0 0 1 2 2V17"/>',
    pair: '<rect x="3" y="6" width="9" height="13" rx="1.6"/><rect x="12" y="5" width="9" height="13" rx="1.6"/>',
    star: '<path d="m12 3.6 2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.3 7 19l1-5.6-4.1-3.9 5.6-.7z"/>'
};

export function symbolsSvg() {
    const fig = Object.entries(FIGURES).map(([type, body]) => `<symbol id="f-${type}" viewBox="0 0 48 48">${body}</symbol>`).join('');
    const ico = Object.entries(ICONS).map(([name, body]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${fig}${ico}</svg>`;
}

export const figure = (type, cls = '') => `<svg class="fig ${cls}" aria-hidden="true"><use href="#f-${type}"/></svg>`;
export const icon = (name, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const EFFECT_ICON = { crab: 'pile', boat: 'again', fish: 'draw', swimmer: 'steal', shark: 'steal' };

// カードの下の小さな記号：2枚組の効果、倍率の対象
function hintHtml(type) {
    if (EFFECT_ICON[type]) {
        const partner = type === 'swimmer' ? figure('shark', 'mini') : type === 'shark' ? figure('swimmer', 'mini') : '';
        return `<span class="hint">${partner}${icon(EFFECT_ICON[type])}</span>`;
    }
    const m = MULTIPLIERS[type];
    if (m) return `<span class="hint"><b>${m.each}×</b>${figure(m.of, 'mini')}</span>`;
    return '';
}

// カードの説明の文（読み上げと、詳しい表示）
export const CARD_TEXT = {
    crab: '2枚組で1点。出すと、捨て札の山を1つ選んで中を見て、1枚を手札に入れる',
    boat: '2枚組で1点。出すと、もう1回手番を行う',
    fish: '2枚組で1点。出すと、山札の上を1枚手札に入れる',
    swimmer: 'サメと組で1点。出すと、ほかの人の手札から1枚をランダムに取る',
    shark: '泳ぐ人と組で1点。出すと、ほかの人の手札から1枚をランダムに取る',
    shell: '1枚 0点・2枚 2点・3枚 4点・4枚 6点・5枚 8点・6枚 10点',
    octopus: '1枚 0点・2枚 3点・3枚 6点・4枚 9点・5枚 12点',
    penguin: '1枚 1点・2枚 3点・3枚 5点',
    sailor: '1枚 0点・2枚 5点',
    lighthouse: 'ボート1枚につき1点',
    shoal: '魚1枚につき1点',
    colony: 'ペンギン1枚につき2点',
    captain: '船乗り1枚につき3点',
    mermaid: '一番多い色の枚数が点（2枚目は2番目に多い色）。4枚そろえば、その場で勝ち'
};

export const cardName = (id) => TYPES[CARDS[id].type].name;
export const cardLabel = (id) => `${cardName(id)}（${COLOR_NAMES[CARDS[id].color]}）`;

// カードの表
export function cardHtml(id, { cls = '', attrs = '' } = {}) {
    const card = CARDS[id];
    return `<div class="card c-${card.color} t-${card.type} ${cls}" data-card="${id}" ${attrs} role="img" aria-label="${cardLabel(id)}。${CARD_TEXT[card.type]}">
        <span class="corner">${figure(card.type)}</span>${figure(card.type, 'main')}${hintHtml(card.type)}
    </div>`;
}

// カードの裏（山札・ほかの人の手札）
export function cardBackHtml({ cls = '', attrs = '', count = null } = {}) {
    const n = count === null ? '' : `<span class="count">${count}</span>`;
    return `<div class="card back ${cls}" ${attrs}>${figure('boat', 'back-fig')}${n}</div>`;
}
