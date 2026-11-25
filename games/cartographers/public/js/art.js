/**
 * 地形・形・カードの絵（自作の SVG と HTML）
 * 地形の図柄は symbol としてページに一度だけ入れ、use で使い回す。色だけでなく図柄でも見分けられるようにする
 */

import { TERRAIN_NAMES } from './game.js';
import { normalize, sizeOf } from './shapes.js';

const ICONS = {
    forest: '<path d="M12 3 6 11h3l-4 6h5v4h4v-4h5l-4-6h3z"/>',
    village: '<path d="M4 20V11l8-6 8 6v9h-5v-5h-6v5z"/>',
    farm: '<path d="M12 21V9M12 9c-3 0-4-2-4-5 3 0 4 2 4 5zm0 0c3 0 4-2 4-5-3 0-4 2-4 5zm0 5c-3 0-4-2-4-5 3 0 4 2 4 5zm0 0c3 0 4-2 4-5-3 0-4 2-4 5z"/>',
    water: '<path d="M3 9c3-2 6 2 9 0s6-2 9 0M3 14c3-2 6 2 9 0s6-2 9 0M3 19c3-2 6 2 9 0s6-2 9 0"/>',
    monster: '<path d="M6 4l2 5M18 4l-2 5M5 10c0 6 3 10 7 10s7-4 7-10c-2-1-4-1-7-1s-5 0-7 1z"/><path d="M9 13h.01M15 13h.01M9.5 17h5"/>',
    mountain: '<path d="M2 20 9 7l4 6 2-3 7 10z"/><path d="M7.5 10l1.5 1.5L10.5 10"/>',
    ruins: '<path d="M4 20h16M6 20V9h3v11M15 20V9h3v11M5 9h14l-1-3H6z"/>',
    coin: '<circle cx="12" cy="12" r="8"/><path d="M12 7v10M9.5 9.5c0-1 1-1.5 2.5-1.5s2.5.6 2.5 1.6c0 2.4-5 1.4-5 3.9 0 1 1 1.5 2.5 1.5s2.5-.5 2.5-1.5"/>',
    rotate: '<path d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4"/>',
    flip: '<path d="M12 3v18M8 7l-5 5 5 5zM16 7l5 5-5 5z"/>',
    clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3 2"/>',
    star: '<path d="M12 3l2.6 5.6 6.1.7-4.6 4.1 1.3 6L12 16.4 6.6 19.4l1.3-6L3.3 9.3l6.1-.7z"/>'
};

export function symbolsSvg() {
    const symbols = Object.entries(ICONS).map(([name, shape]) => `<symbol id="icon-${name}" viewBox="0 0 24 24">${shape}</symbol>`).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${symbols}</svg>`;
}

export const icon = (name, cls = '') => `<svg class="icon icon-${name} ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#icon-${name}"/></svg>`;

// 形の小さな絵。terrain の色で塗る。coin なら右上にコインの印
export function shapeHtml(cells, terrain, { coin = false, cls = '' } = {}) {
    const norm = normalize(cells);
    const [h, w] = sizeOf(norm);
    const set = new Set(norm.map(([r, c]) => `${r},${c}`));
    const grid = Array.from({ length: h * w }, (_, i) => {
        const on = set.has(`${Math.floor(i / w)},${i % w}`);
        return `<span class="${on ? `sq t-${terrain}` : 'sq off'}"></span>`;
    }).join('');
    return `<span class="shape ${cls}" style="--w:${w};--h:${h}" role="img" aria-label="${TERRAIN_NAMES[terrain]}の形${coin ? '（コイン）' : ''}">
        <span class="shape-grid">${grid}</span>${coin ? `<span class="coin-mark">${icon('coin')}</span>` : ''}</span>`;
}

export const terrainChip = (terrain) => `<span class="tchip t-${terrain}">${icon(terrain)}</span>`;
