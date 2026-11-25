/**
 * 絵（すべて自作の SVG。霧のヴィクトリア朝ロンドン）
 * 盤は 5×5 の格子で、1マスは 10×10 の座標。まん中の 3×3 が街区タイル、まわりが刑事の道
 */

import { SUSPECTS } from './data.js';

const SUSPECT = Object.fromEntries(SUSPECTS.map(s => [s.key, s]));

// 容疑者の帽子・髪の形（頭の上に重ねる）
const HATS = {
    lestrade: '<path d="M2.6 3.9h4.8M3.4 3.9c0-1.4.7-2.1 1.6-2.1s1.6.7 1.6 2.1" />',                      // 山高帽
    stealthy: '<path d="M2.7 4.6c0-2.2 1-3.2 2.3-3.2s2.3 1 2.3 3.2M2.4 4.4l-.4 1.4M7.6 4.4l.4 1.4" />',      // ボンネット
    bert: '<path d="M3 3.6h3.8l1.2.6M3.2 3.6c.2-1 .9-1.5 1.8-1.5s1.5.5 1.7 1.5" />',                         // ハンチング
    pizer: '<path d="M3.6 2v1.8M6.4 2v1.8M3.1 3.8h3.8M3.6 2h2.8" />',                                        // シルクハット
    smith: '<path d="M3.2 3.8c.3-.9.9-1.4 1.8-1.4s1.5.5 1.8 1.4M3.6 6.6c.6.4 2.2.4 2.8 0" />',                 // 口ひげ
    lane: '<path d="M2.8 3.8h4.4M3.5 3.8c0-1.6.6-2.2 1.5-2.2s1.5.6 1.5 2.2M5 1.6v-.6" />',                    // 鳥打ち帽
    madame: '<path d="M2.2 3.6h5.6M3 3.6c.4-1.1 1.1-1.6 2-1.6s1.6.5 2 1.6M6.6 2.2l1.2-1" />',                 // 羽根の帽子
    goodley: '<path d="M3.2 4V2.6c0-.8.8-1.3 1.8-1.3s1.8.5 1.8 1.3V4M2.8 4h4.4" />',                         // 巡査の帽子
    gull: '<path d="M3.2 3.4c.4-.8 1-1.1 1.8-1.1s1.4.3 1.8 1.1M3.4 6.8c.8.8 2.4.8 3.2 0M3.6 6.8V6M6.4 6.8V6" />' // ひげ
};

// 刑事の印
const DETECTIVE_GLYPH = {
    holmes: '<path d="M2.6 5.2h4.8M3.2 5.2c0-1.8.8-2.7 1.8-2.7s1.8.9 1.8 2.7M5 2.5v-.8M3.2 5.2l-.7.9M6.8 5.2l.7.9" />', // 鹿撃ち帽
    watson: '<path d="M2.6 5h4.8M3.4 5c0-1.5.7-2.3 1.6-2.3s1.6.8 1.6 2.3M4 6.6c.6.4 1.4.4 2 0" />',                      // 山高帽と口ひげ
    toby: '<path d="M3 6.8c0-1.6.8-2.6 2-2.6s2 1 2 2.6M3.4 4.6 2.6 3M6.6 4.6 7.4 3M4.4 6.2h.01M5.6 6.2h.01M4.8 7.2h.4" />' // 犬
};

const ICONS = {
    home: '<path d="M4 11.5 12 5l8 6.5M6.5 10v9h11v-9" />',
    log: '<path d="M7 6h11M7 12h11M7 18h11M4 6h.01M4 12h.01M4 18h.01" />',
    help: '<circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6M12 17h.01" />',
    rotate: '<path d="M19 12a7 7 0 1 1-2.1-5M19 4v4h-4" />',
    exchange: '<path d="M5 8h13l-3-3M19 16H6l3 3" />',
    alibi: '<rect x="6" y="3.5" width="12" height="17" rx="2" /><path d="M9 8h6M9 12h6M9 16h3" />',
    joker: '<path d="M12 3l2.6 5.6 6 .6-4.5 4 1.3 6-5.4-3.1-5.4 3.1 1.3-6-4.5-4 6-.6z" />',
    hourglass: '<path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9" />',
    eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12z" /><circle cx="12" cy="12" r="2.6" />'
};

export function symbolsSvg() {
    const hats = Object.entries(HATS).map(([k, d]) => `<symbol id="h-${k}" viewBox="0 0 10 10">${d}</symbol>`).join('');
    const dets = Object.entries(DETECTIVE_GLYPH).map(([k, d]) => `<symbol id="d-${k}" viewBox="0 0 10 10">${d}</symbol>`).join('');
    const icons = Object.entries(ICONS).map(([k, d]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${d}</symbol>`).join('');
    // 霧：盤の端ほど白く、まん中は澄ませる
    const fog = '<defs><radialGradient id="fog" cx="50%" cy="50%" r="72%"><stop offset="55%" stop-color="#dfe6ee" stop-opacity="0"/><stop offset="100%" stop-color="#dfe6ee" stop-opacity=".22"/></radialGradient></defs>';
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${fog}${hats}${dets}${icons}</svg>`;
}

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// 容疑者の肖像（中心 cx, cy、半径 r）
export function portrait(key, cx, cy, r, extra = '') {
    const s = SUSPECT[key];
    const size = r * 2;
    return `<g class="portrait ${extra}"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${s.color}"/>
        <circle class="head" cx="${cx}" cy="${cy - r * 0.08}" r="${r * 0.36}"/>
        <path class="body" d="M${cx - r * 0.7} ${cy + r * 0.86}c0-${r * 0.6} ${r * 0.3}-${r * 0.86} ${r * 0.7}-${r * 0.86}s${r * 0.7} ${r * 0.26} ${r * 0.7} ${r * 0.86}"/>
        <use class="hat" href="#h-${key}" x="${cx - r}" y="${cy - r}" width="${size}" height="${size}"/></g>`;
}

// 街区タイル（x, y は左上。wall は壁の辺 0〜3、なければ null）
export function districtShape(tile, x, y, wall, { seen = false, jack = false } = {}) {
    const w = 10;
    // 通り（十字）と、四隅の建物
    let g = `<rect class="cobble" x="0" y="0" width="${w}" height="${w}"/>`;
    g += '<path class="house" d="M0 0h3.4v3.4H0zM6.6 0H10v3.4H6.6zM0 6.6h3.4V10H0zM6.6 6.6H10V10H6.6z"/>';
    // 壁：その辺の通りの口をふさぐ建物
    const walls = ['M3.4 0h3.2v2.6H3.4z', 'M7.4 3.4H10v3.2H7.4z', 'M3.4 7.4h3.2V10H3.4z', 'M0 3.4h2.6v3.2H0z'];
    const edges = ['M3.4 .4h3.2', 'M9.6 3.4v3.2', 'M3.4 9.6h3.2', 'M.4 3.4v3.2'];
    if (wall !== null) g += `<path class="wall" d="${walls[wall]}"/><path class="wall-line" d="${edges[wall]}"/>`;
    g += '<path class="lamp" d="M3.6 3.6h.01M6.4 3.6h.01M3.6 6.4h.01M6.4 6.4h.01"/>';
    if (!tile.cleared) g += portrait(tile.suspect, 5, 5, 1.9, seen ? 'seen' : '');
    if (jack) g += '<rect class="jack-mark" x=".5" y=".5" width="9" height="9" rx="1.2"/>';
    return `<g class="district ${tile.cleared ? 'cleared' : ''}" transform="translate(${x} ${y})">${g}</g>`;
}

// 刑事（道のマスの中心 cx, cy。同じマスに何人いるかで少しずらす）
export function detectiveShape(key, cx, cy, extra = '') {
    return `<g class="detective ${key} ${extra}"><circle cx="${cx}" cy="${cy}" r="2.3"/><use href="#d-${key}" x="${cx - 2.1}" y="${cy - 2.1}" width="4.2" height="4.2"/></g>`;
}

// 行動タイルの面の絵
export function actionIcon(action) {
    if (action === 'holmes' || action === 'watson' || action === 'toby') {
        return `<svg class="act-ico det" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4.6"/><use href="#d-${action}" x="0.6" y="0.6" width="8.8" height="8.8"/></svg>`;
    }
    return icon(action);
}

export const portraitSvg = (key) => `<svg class="mini" viewBox="0 0 10 10" aria-hidden="true">${portrait(key, 5, 5, 4.6)}</svg>`;
