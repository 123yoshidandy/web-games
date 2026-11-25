/**
 * 絵（すべて自作の SVG と CSS）
 * - 発電所カード：番号・燃料の種類の色の帯と、使う数のしるし・送電できる都市の数
 * - 資源のしるし（石炭・石油・ゴミ・ウラン）、地域とプレイヤーの色、ボタンのアイコン
 */

import { PLANT, STEP3, RESOURCE_NAMES, TYPE_NAMES } from './data.js';

export const REGION_COLORS = {
    green: '#4f9b4a', brown: '#9a6a3c', red: '#c9443b', yellow: '#d8b13a', blue: '#3f76c4', purple: '#8a58b8', turquoise: '#2fa3a0'
};
export const PLAYER_COLORS = ['#e8493d', '#3f86e8', '#45b85f', '#f0c430', '#b06ae0', '#f08a2c'];
export const RESOURCE_COLORS = { coal: '#7a5233', oil: '#2b2b30', garbage: '#d9b53c', uranium: '#d6403a' };
const TYPE_BAND = {
    coal: RESOURCE_COLORS.coal, oil: RESOURCE_COLORS.oil, garbage: RESOURCE_COLORS.garbage, uranium: RESOURCE_COLORS.uranium,
    hybrid: `linear-gradient(90deg, ${RESOURCE_COLORS.coal} 50%, ${RESOURCE_COLORS.oil} 50%)`, eco: '#4aa25a'
};

// 資源の小さなしるし（石炭は塊、石油は滴、ゴミは袋、ウランは三つ葉）
const RES_ICON = {
    coal: '<path d="M3 15l3-7 5-2 6 3 4 6-3 4H6z" fill="#7a5233" stroke="#3d2716" stroke-width="1.2"/>',
    oil: '<path d="M12 3c3 5 6 8 6 12a6 6 0 0 1-12 0c0-4 3-7 6-12z" fill="#2b2b30" stroke="#000" stroke-width="1"/>',
    garbage: '<path d="M7 9h10l-1 11H8zM9 9l1-3h4l1 3" fill="#d9b53c" stroke="#7a5f12" stroke-width="1.2"/>',
    uranium: '<circle cx="12" cy="12" r="9" fill="#d6403a"/><path d="M12 12l-4.5-7.8a9 9 0 0 1 9 0zM12 12l9 0a9 9 0 0 1-4.5 7.8zM12 12l-4.5 7.8a9 9 0 0 1-4.5-7.8z" fill="#ffe9b0"/><circle cx="12" cy="12" r="2" fill="#d6403a"/>'
};
export const resIcon = (type, size = 14) => `<svg class="res" width="${size}" height="${size}" viewBox="0 0 24 24" aria-label="${RESOURCE_NAMES[type]}">${RES_ICON[type]}</svg>`;
const WIND = '<svg class="res" width="14" height="14" viewBox="0 0 24 24" aria-label="風力"><path d="M12 12l1-9h-2zM12 12l7.8 4.5 1-1.7zM12 12l-7.8 4.5-1-1.7z" fill="#e9fff0"/><path d="M12 12v10" stroke="#e9fff0" stroke-width="1.6"/></svg>';
const HOUSE = '<svg class="hs" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 21V11l9-8 9 8v10z" fill="currentColor"/></svg>';

// 発電所カード
export function plantHtml(num, { cls = '', attrs = '', stored = null } = {}) {
    if (num === STEP3) return `<div class="plant step3 ${cls}" ${attrs}><b>段階3</b></div>`;
    const p = PLANT[num];
    // 燃料は「しるし（両用は石炭と石油の2つ）と使う数」で表す
    const icons = p.type === 'eco' ? WIND
        : `${p.type === 'hybrid' ? resIcon('coal', 11) + resIcon('oil', 11) : resIcon(p.type, 11)}<em>${p.need}</em>`;
    const store = stored ? `<span class="stored">${Object.entries(stored).filter(([, n]) => n > 0).map(([t, n]) => `${resIcon(t, 10)}${n}`).join('')}</span>` : '';
    return `<div class="plant ${cls}" data-plant="${num}" style="--band:${TYPE_BAND[p.type]}" title="${TYPE_NAMES[p.type]} ${p.need} → ${p.cities}都市" ${attrs}>
        <b class="num">${num}</b><span class="need">${icons}</span><span class="cities">${HOUSE}${p.cities}</span>${store}
    </div>`;
}

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    log: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6"/>',
    plus: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6M11 8v6"/>',
    minus: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-5-5M8 11h6"/>',
    fit: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    market: '<path d="M3 20h18M5 20V9l4-3 4 3v11M13 20v-7l4-3 3 2v8"/>'
};
export function symbolsSvg() {
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${Object.entries(ICONS).map(([id, art]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${art}</symbol>`).join('')}</defs></svg>`;
}
export const icon = (id) => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;
