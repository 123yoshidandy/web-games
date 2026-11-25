/**
 * 絵（すべて自作の SVG）
 * 芸者ごとの印（家紋のような花の図柄）は symbol としてページに一度だけ入れ、use で使い回す
 */

import { GEISHA, ACTION_NAMES } from './game.js';

// 芸者の印。viewBox は -50〜50。--line は印の中の線や芯の色
const petals = (count, path, extra = '') => Array.from({ length: count }, (_, i) => `<path d="${path}" transform="rotate(${(360 / count) * i})"/>`).join('') + extra;
const EMBLEMS = [
    // 椿：丸い花びら5枚と芯
    `${Array.from({ length: 5 }, (_, i) => {
        const a = (Math.PI * 2 * i) / 5 - Math.PI / 2;
        return `<circle cx="${(Math.cos(a) * 23).toFixed(1)}" cy="${(Math.sin(a) * 23).toFixed(1)}" r="19"/>`;
    }).join('')}<circle r="11" fill="var(--line)"/><circle r="5"/>`,
    // 山吹：細い花びら5枚
    petals(5, 'M0-5C-13-17-13-35 0-45C13-35 13-17 0-5Z', '<circle r="7" fill="var(--line)"/>'),
    // 柳：垂れた葉
    [-34, -12, 12, 34].map(r => `<path d="M0-44C9-24 9 4 0 30C-9 4-9-24 0-44Z" transform="rotate(${r} 0 -44) translate(0 6)"/>`).join('')
        + '<path d="M-30-44H30" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>',
    // 朝顔：丸い花と5本の筋
    `<circle r="42"/>${Array.from({ length: 5 }, (_, i) => `<path d="M0 0V-40" stroke="var(--line)" stroke-width="4" stroke-linecap="round" transform="rotate(${72 * i})"/>`).join('')}<circle r="10" fill="var(--line)"/>`,
    // 桔梗：とがった星形
    '<path d="M0-46L12-16 44-14 19 6 27 38 0 20-27 38-19 6-44-14-12-16Z" stroke="currentColor" stroke-width="6" stroke-linejoin="round"/>'
        + `${Array.from({ length: 5 }, (_, i) => `<path d="M0 0V-26" stroke="var(--line)" stroke-width="3" stroke-linecap="round" transform="rotate(${72 * i})"/>`).join('')}<circle r="6" fill="var(--line)"/>`,
    // 藤：垂れた房
    '<path d="M-26-44Q0-36 26-44" fill="none" stroke="currentColor" stroke-width="6" stroke-linecap="round"/>'
        + [[-24, -28], [-8, -30], [8, -30], [24, -28], [-16, -12], [0, -14], [16, -12], [-8, 4], [8, 4], [0, 20], [0, 36]]
            .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i < 4 ? 9.5 : i < 7 ? 9 : i < 9 ? 8.5 : i < 10 ? 8 : 6.5}"/>`).join(''),
    // 桜：先の割れた花びら5枚
    petals(5, 'M0-6C-15-14-18-34-7-44L0-37 7-44C18-34 15-14 0-6Z', '<circle r="6" fill="var(--line)"/>')
];

export function symbolsSvg() {
    const emblems = EMBLEMS.map((body, g) => `<symbol id="emblem-${g}" viewBox="-50 -50 100 100">${body}</symbol>`).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${emblems}</svg>`;
}

// use は外側の viewBox の原点から symbol を描くので、外側は 0〜100 にする
export const emblem = (g, cls = '') => `<svg class="emblem ${cls}" viewBox="0 0 100 100" aria-hidden="true"><use href="#emblem-${g}"/></svg>`;

// 品物のカード（手札・差し出したカード）
export function cardHtml(g, { cls = '', attrs = '' } = {}) {
    return `<div class="card item g${g} ${cls}" data-card="${g}" ${attrs} aria-label="${GEISHA[g].name}">
        ${emblem(g, 'card-emblem')}<span class="card-value">${GEISHA[g].value}</span><span class="card-name">${GEISHA[g].name}</span></div>`;
}

export function cardBackHtml(cls = '') {
    return `<div class="card back ${cls}"><svg class="back-icon" viewBox="0 0 100 100" aria-hidden="true"><use href="#emblem-6"/></svg></div>`;
}

// 芸者の札（列の中央）
export function geishaHtml(g, favorClass = '') {
    return `<div class="geisha g${g} ${favorClass}" aria-label="${GEISHA[g].name} ${GEISHA[g].value}点">
        <span class="geisha-value">${GEISHA[g].value}</span>${emblem(g, 'geisha-emblem')}<span class="geisha-name">${GEISHA[g].name}</span>
        <span class="marker" aria-hidden="true"></span></div>`;
}

// 列に置いたカード（細い札）
export const chipHtml = (g, cls = '') => `<div class="chip g${g} ${cls}">${emblem(g, 'chip-emblem')}</div>`;

// 行動の印
const ACTION_LETTERS = { secret: '秘', discard: '棄', gift: '贈', compete: '競' };
export function actionTokenHtml(action, { used = false, cls = '' } = {}) {
    return `<span class="action-token a-${action} ${used ? 'used' : ''} ${cls}" title="${ACTION_NAMES[action]}${used ? '（使用済み）' : ''}">${ACTION_LETTERS[action]}</span>`;
}

// 好意の印（得点の表などで使う）
export const markerHtml = (owner) => `<span class="marker-dot ${owner}" aria-hidden="true"></span>`;
