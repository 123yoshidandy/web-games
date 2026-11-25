/**
 * カードの絵（自作の SVG と HTML）
 * カメレオンの図柄は symbol としてページに一度だけ入れ、use で使い回す
 * 色だけでなく、札に色の名前（赤・橙…）も小さく書いて見分けやすくする
 */

import { JOKER, PLUS2, LAST, COLOR_NAMES } from './game.js';

// 右を向いたカメレオン：頭のとさか、丸い目、巻いた尾、枝をつかむ足
const CHAMELEON = `<symbol id="chameleon" viewBox="0 0 24 24">
    <path d="M7.2 15.2c0-4 3.2-7.1 7.4-7.1 2.6 0 4.6 1 5.8 2.6l2 .6-1.2 1.7c-.3 2.3-2.4 3.9-5.3 3.9H9.3c-1.2 0-2.1-.7-2.1-1.7z"/>
    <path d="M15.8 8.4l1.8-2.2.7 2.6z"/>
    <path d="M7.6 15.4c-2.7 0-4.4-1.7-4.4-3.6 0-1.6 1.3-2.8 2.8-2.8 1.3 0 2.2 1 2.2 2 0 .9-.7 1.5-1.4 1.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M10.4 16.5 9.6 19.4M15.6 16.5l.8 2.9M3.5 19.6h17.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
    <circle cx="18.6" cy="11.2" r="1.5" fill="var(--eye, #fff)"/><circle cx="18.9" cy="11.2" r=".65" fill="var(--pupil, #222)"/>
    <path d="M10.5 10.8c1.4-.7 3-.8 4.4-.3M10.2 13.6c1.4-.5 2.9-.5 4.2 0" fill="none" stroke="var(--eye, #fff)" stroke-opacity=".45" stroke-width=".9" stroke-linecap="round"/>
</symbol>`;

export const symbolsSvg = () => `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${CHAMELEON}</svg>`;

export const chameleon = (cls = '') => `<svg class="chameleon ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#chameleon"/></svg>`;

export const cardLabel = (card) => (card === JOKER ? 'ジョーカー' : card === PLUS2 ? '+2' : card === LAST ? '最後のラウンド' : COLOR_NAMES[card]);

// カードの札（横長）
export function cardHtml(card, { cls = '', attrs = '' } = {}) {
    let body;
    if (card === PLUS2) body = '<span class="plus2-mark">+2</span>';
    else if (card === LAST) body = '<span class="last-mark">最後の<br>ラウンド</span>';
    else body = `${chameleon()}<span class="tile-name">${card === JOKER ? '★' : COLOR_NAMES[card]}</span>`;
    return `<div class="tile t-${card} ${cls}" ${attrs} role="img" aria-label="${cardLabel(card)}">${body}</div>`;
}

export const cardBackHtml = (cls = '') => `<div class="tile back ${cls}" aria-hidden="true">${chameleon()}</div>`;
