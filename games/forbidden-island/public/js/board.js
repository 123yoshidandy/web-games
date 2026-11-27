/**
 * 島の描画（6×6 のマスの DOM。角の4マスに宝の印）
 * 移動や補強の判定は、ビューから作った Game の写し（viewGame）で行い、ルールのコードを画面でも使う
 */

import Game from './game.js';
import { GRID, TILES, TREASURES, ROLE, FOOLS } from './data.js';

const escapeHtml = (text) => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ビューから、判定だけに使う Game の写しを作る（山札は持たない）
export function viewGame(v) {
    const g = Object.create(Game.prototype);
    g.cellOf = v.cellOf;
    g.tileAt = Array(GRID * GRID).fill(null);
    v.cellOf.forEach((cell, tile) => { g.tileAt[cell] = tile; });
    g.tiles = v.tiles;
    g.captured = v.captured;
    g.players = v.players;
    g.phase = v.phase;
    g.current = v.current;
    g.pilotUsed = v.pilotUsed;
    g.actionsLeft = v.actionsLeft;
    g.swimQueue = v.swimQueue;
    return g;
}

// 宝の印（自作の図形）
const SHAPES = [
    '<path d="M12 3l8 6-3 11H7L4 9z"/>',                                                   // 大地の石：五角の石
    '<path d="M12 3c3 0 4 2 4 4s-2 3-2 5 2 3 2 5-2 4-4 4-4-2-4-4 2-3 2-5-2-3-2-5 1-4 4-4z"/>', // 風の像：くびれた像
    '<path d="M12 2l6 9-6 11-6-11z"/>',                                                    // 炎の水晶：ひし形
    '<path d="M6 4h12l-2 7a4 4 0 0 1-8 0zM11 15h2v4h3v2H8v-2h3z"/>'                         // 海の聖杯：杯
];
export const treasureIcon = (k, cls = '') => `<svg class="ti ${cls}" viewBox="0 0 24 24" style="--tc:${TREASURES[k].color}" aria-hidden="true">${SHAPES[k]}</svg>`;
const heliIcon = '<svg class="ti heli-mark" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8 7v10M16 7v10M8 12h8"/></svg>';

export const pawnHtml = (role, cls = '') => `<span class="pawn ${cls}" style="--pc:${ROLE[role].color}"></span>`;

// 角のマスと、そこに置く宝
const CORNERS = { 0: 0, [GRID - 1]: 1, [GRID * (GRID - 1)]: 2, [GRID * GRID - 1]: 3 };

// opts: { targets: Set（光らせる場所）, chosen: Set（選んだ場所）, current（手番の人）, flash: Set（今めくられた場所） }
export function islandHtml(v, { targets = new Set(), chosen = new Set(), flash = new Set() } = {}) {
    const tileAt = Array(GRID * GRID).fill(null);
    v.cellOf.forEach((cell, tile) => { tileAt[cell] = tile; });
    const cells = [];
    for (let cell = 0; cell < GRID * GRID; cell++) {
        const pos = `grid-row:${Math.floor(cell / GRID) + 1};grid-column:${cell % GRID + 1}`;
        const tile = tileAt[cell];
        if (tile === null) {
            const k = CORNERS[cell];
            if (k !== undefined) {
                cells.push(`<div class="corner${v.captured[k] ? ' got' : ''}" style="${pos}" title="${TREASURES[k].name}${v.captured[k] ? '（獲得）' : ''}">${treasureIcon(k)}</div>`);
            }
            continue;
        }
        const t = TILES[tile];
        const state = ['dry', 'flooded', 'sunk'][v.tiles[tile]];
        if (state === 'sunk') {
            cells.push(`<div class="tile sunk" style="${pos}" data-tile="${tile}"></div>`);
            continue;
        }
        const pawns = v.players.filter(p => p.tile === tile)
            .map(p => pawnHtml(p.role, p.id === v.current ? 'cur' : '')).join('');
        const mark = t.treasure !== null ? treasureIcon(t.treasure, v.captured[t.treasure] ? 'done' : '') : tile === FOOLS ? heliIcon : '';
        const cls = ['tile', state, targets.has(tile) ? 'target' : '', chosen.has(tile) ? 'chosen' : '', flash.has(tile) ? 'flash' : '',
            t.treasure !== null ? 'temple' : '', tile === FOOLS ? 'fools' : ''].join(' ');
        cells.push(`<button type="button" class="${cls}" style="${pos}" data-tile="${tile}" aria-label="${escapeHtml(t.name)}${state === 'flooded' ? '（浸水）' : ''}">`
            + `${mark}<span class="tname">${escapeHtml(t.name)}</span><span class="pawns">${pawns}</span></button>`);
    }
    return cells.join('');
}

// タイトル画面の飾り：島の形だけを描く
export function titleArtHtml() {
    const cells = [];
    const land = new Set([2, 3, 7, 8, 9, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 25, 26, 27, 28, 32, 33]);
    const flooded = new Set([8, 15, 20, 26]);
    for (let cell = 0; cell < GRID * GRID; cell++) {
        if (!land.has(cell)) continue;
        cells.push(`<div class="tile ${flooded.has(cell) ? 'flooded' : 'dry'}" style="grid-row:${Math.floor(cell / GRID) + 1};grid-column:${cell % GRID + 1}"></div>`);
    }
    return `<div class="island art">${cells.join('')}</div>`;
}
