/**
 * 絵（すべて自作の SVG）
 * 氏族の色ごとに形の違う印を付け、色だけに頼らず見分けられるようにする
 * 印は symbol としてページに一度だけ入れ、use で使い回す
 */

import { isClan, isTactic, TACTIC_NAMES, COLOR_NAMES } from './game.js';
import { colorOf, valueOf } from './formation.js';

// 氏族の印（viewBox 0〜100）：赤 円・橙 三角・黄 四角・緑 ひし形・青 星・紫 六角
const SHAPES = [
    '<circle cx="50" cy="50" r="38"/>',
    '<path d="M50 10 92 86H8Z"/>',
    '<rect x="16" y="16" width="68" height="68" rx="6"/>',
    '<path d="M50 6 92 50 50 94 8 50Z"/>',
    '<path d="M50 6 61 38 95 38 67 58 78 92 50 71 22 92 33 58 5 38 39 38Z"/>',
    '<path d="M50 6 89 28V72L50 94 11 72V28Z"/>'
];
// 戦術カードの印（1文字）
export const TACTIC_MARKS = {
    joker1: 'J', joker2: 'J', spy: '密', shield: '盾', blind: '盲', mud: '泥',
    recruiter: '募', strategist: '策', banshee: '妖', traitor: '裏'
};

export function symbolsSvg() {
    const shapes = SHAPES.map((body, c) => `<symbol id="clan-${c}" viewBox="0 0 100 100">${body}</symbol>`).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${shapes}</svg>`;
}

export const shape = (c, cls = '') => `<svg class="shape ${cls}" viewBox="0 0 100 100" aria-hidden="true"><use href="#clan-${c}"/></svg>`;

// 手札のカード
export function cardHtml(card, { cls = '', attrs = '' } = {}) {
    if (isTactic(card)) {
        return `<div class="card tactic ${cls}" data-card="${card}" ${attrs} aria-label="${TACTIC_NAMES[card]}">
            <span class="t-mark">${TACTIC_MARKS[card]}</span><span class="t-name">${TACTIC_NAMES[card]}</span></div>`;
    }
    const c = colorOf(card);
    const v = valueOf(card);
    return `<div class="card clan c${c} ${cls}" data-card="${card}" ${attrs} aria-label="${COLOR_NAMES[c]}${v}">
        <span class="v">${v}</span>${shape(c, 'card-shape')}</div>`;
}

// 石の上のカード（細い札）。entry：{ card, c, v }
export function chipHtml(entry, { cls = '', attrs = '' } = {}) {
    const wild = isClan(entry.card) ? '' : `<span class="wild-mark">${TACTIC_MARKS[entry.card]}</span>`;
    return `<div class="chip c${entry.c} ${wild ? 'wild' : ''} ${cls}" ${attrs}>${shape(entry.c, 'chip-shape')}<b>${entry.v}</b>${wild}</div>`;
}

export const cardBackHtml = (kind = 'clan', cls = '') => `<div class="card back ${kind} ${cls}"><span>${kind === 'tactic' ? '戦' : ''}</span></div>`;
