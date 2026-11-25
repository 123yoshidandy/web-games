/**
 * 絵（アイコンは自作の SVG、駒は CSS の五角形に漢字を書く）
 * アイコンは symbol として一度だけページに入れ、use で使い回す
 */

import { pieceChar } from './notation.js';
import { PROMOTE } from './rules.js';

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".8" fill="currentColor"/><circle cx="4" cy="12" r=".8" fill="currentColor"/><circle cx="4" cy="18" r=".8" fill="currentColor"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>'
};

export function symbolsSvg() {
    const lines = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true">${lines}</svg>`;
}

// 駒1つ。flipped：相手向き（逆さ）に描く。成った駒は赤い字
export function pieceHtml(side, type, { flipped = false, cls = '' } = {}) {
    const promoted = type > PROMOTE;
    return `<span class="piece${promoted ? ' promoted' : ''}${flipped ? ' flipped' : ''}${cls ? ` ${cls}` : ''}"><span class="kanji">${pieceChar(side, type)}</span></span>`;
}
