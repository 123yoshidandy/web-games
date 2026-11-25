/**
 * 絵（すべて自作の SVG。公式の画像は使っていない）
 * タイルの絵柄（art-data.js）は symbol としてページに一度だけ入れ、use で使い回す
 * タイルは角丸の正方形（背景は種類の色）、太陽駒は数字の入った円盤
 */

import { TILE_ART, ICON_ART } from './art-data.js';
import { TILES } from './data.js';

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    log: '<path d="M5 6h14M5 12h14M5 18h9"/>'
};

export function symbolsSvg() {
    const tiles = Object.entries(TILE_ART).map(([key, body]) => `<symbol id="t-${key}" viewBox="0 0 48 48">${body}</symbol>`).join('');
    const icons = Object.entries(ICON_ART).map(([key, body]) => `<symbol id="n-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    const lines = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${tiles}${icons}${lines}</defs></svg>`;
}

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// タイル（count が2以上なら枚数の札）
export function tileHtml(type, { cls = '', attrs = '', count = 0 } = {}) {
    return `<span class="tile ${cls}" style="--bg:${TILES[type].bg}" data-type="${type}" title="${TILES[type].name}" ${attrs}>
        <svg viewBox="0 0 48 48" aria-hidden="true"><use href="#t-${type}"/></svg>${count > 1 ? `<b>${count}</b>` : ''}</span>`;
}

// 太陽駒（down：裏向き。値が分からないときは null）
export function sunHtml(value, { cls = '', attrs = '', down = false } = {}) {
    return `<span class="sun ${down ? 'down' : ''} ${cls}" ${attrs}>${value ?? '?'}</span>`;
}
