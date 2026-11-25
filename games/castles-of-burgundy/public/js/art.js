/**
 * 絵（すべて自作の SVG。公式の画像は使っていない）
 * タイルの絵柄（art-data.js）は symbol としてページに一度だけ入れ、use で使い回す
 * タイルは頂点が上の六角形。色は種類の色で、上に絵柄と（家畜の頭数・知識の番号の）札を重ねる
 */

import { TILE_ART, ICON_ART } from './art-data.js';
import { TILES, KINDS, GOODS, KNOWLEDGE } from './data.js';

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    log: '<path d="M5 6h14M5 12h14M5 18h9"/>'
};

export function symbolsSvg() {
    const tiles = Object.entries(TILE_ART).map(([key, body]) => `<symbol id="t-${key}" viewBox="0 0 60 52">${body}</symbol>`).join('');
    const icons = Object.entries(ICON_ART).map(([key, body]) => `<symbol id="n-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    const lines = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${tiles}${icons}${lines}</defs></svg>`;
}

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const resIcon = (name) => `<svg class="res-ico" viewBox="0 0 24 24" aria-hidden="true"><use href="#n-${name}"/></svg>`;

// タイルの絵柄の名前
export const artKey = (id) => {
    const t = TILES[id];
    // 知識のタイルは、修道院の絵柄（20周年版では修道院と呼ぶ）
    return t.building ?? t.animal ?? (t.kind === 'knowledge' ? 'monastery' : t.kind);
};

// タイルの札（家畜の頭数・知識の番号）
export const tileTag = (id) => {
    const t = TILES[id];
    if (t.animal) return String(t.count);
    if (t.knowledge) return String(t.knowledge);
    return '';
};

// 六角形のタイル（HTML）
export function hexHtml(id, { cls = '', attrs = '', badge = '' } = {}) {
    const t = TILES[id];
    const tag = tileTag(id);
    return `<div class="hex ${cls}" style="--c:${KINDS[t.kind].hex}" data-tile="${id}" ${attrs}>
        <svg class="hex-art" viewBox="0 0 60 52" aria-hidden="true"><use href="#t-${artKey(id)}"/></svg>
        ${tag ? `<span class="hex-tag ${t.knowledge ? 'k' : ''}">${tag}</span>` : ''}
        ${badge ? `<span class="hex-badge">${badge}</span>` : ''}
    </div>`;
}

// 空いたマス（種類の色を薄く）
export const emptyHexHtml = (kind, { cls = '', attrs = '', label = '' } = {}) => `<div class="hex empty ${cls}" style="--c:${KINDS[kind].hex}" ${attrs}>${label ? `<span class="hex-label">${label}</span>` : ''}</div>`;

// ダイスの目（点）
const PIPS = { 1: [[2, 2]], 2: [[1, 1], [3, 3]], 3: [[1, 1], [2, 2], [3, 3]], 4: [[1, 1], [3, 1], [1, 3], [3, 3]], 5: [[1, 1], [3, 1], [2, 2], [1, 3], [3, 3]], 6: [[1, 1], [3, 1], [1, 2], [3, 2], [1, 3], [3, 3]] };
export function dieSvg(value, cls = '') {
    const pips = (PIPS[value] ?? []).map(([x, y]) => `<circle cx="${x * 6}" cy="${y * 6}" r="2.1"/>`).join('');
    return `<svg class="die-face ${cls}" viewBox="0 0 24 24" aria-label="${value}"><rect x="1" y="1" width="22" height="22" rx="5"/>${pips}</svg>`;
}

// 商品（色の四角と枚数）
export const goodsHtml = (die, count, { cls = '', attrs = '' } = {}) => `<span class="goods ${cls}" style="--g:${GOODS[die].hex}" ${attrs}>${dieSvg(die, 'g-die')}${count > 1 ? `<b>${count}</b>` : ''}</span>`;

export const knowledgeText = (k) => KNOWLEDGE[k].text;
