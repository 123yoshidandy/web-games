/**
 * 牌の絵（SVG）
 * 34種と赤の5（3種）の図柄を symbol として一度だけページに入れ、牌は use で使い回す
 * 図柄の座標は 30×40 の枠で描く
 */

import { kindOf, isRed } from './tiles.js';

const INK = '#1d1d24';
const RED = '#c8282f';
const GREEN = '#17804a';
const BLUE = '#1f4fa6';
const SERIF = `'Hiragino Mincho ProN','Yu Mincho','YuMincho','Noto Serif JP','Noto Serif CJK JP',serif`;

const KANJI = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

const text = (x, y, size, color, body, weight = 700) =>
    `<text x="${x}" y="${y}" font-size="${size}" font-family="${SERIF}" font-weight="${weight}" fill="${color}" text-anchor="middle" dominant-baseline="central">${body}</text>`;

function manzu(n, red) {
    return text(15, 11.5, 15, red ? RED : INK, KANJI[n - 1]) + text(15, 28.5, 15, RED, '萬');
}

const dot = (x, y, r, color) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/><circle cx="${x}" cy="${y}" r="${(r * 0.58).toFixed(2)}" fill="#fffdf6"/><circle cx="${x}" cy="${y}" r="${(r * 0.3).toFixed(2)}" fill="${color}"/>`;

function pinzu(n, red) {
    const c = (color) => (red ? RED : color);
    switch (n) {
        case 1:
            return `<circle cx="15" cy="20" r="12" fill="${RED}"/><circle cx="15" cy="20" r="9.5" fill="#fffdf6"/>`
                + `<circle cx="15" cy="20" r="8" fill="${GREEN}"/><circle cx="15" cy="20" r="5.2" fill="#fffdf6"/><circle cx="15" cy="20" r="3" fill="${RED}"/>`;
        case 2: return dot(15, 10.5, 6.5, c(GREEN)) + dot(15, 29.5, 6.5, c(BLUE));
        case 3: return dot(7.5, 8, 5, c(BLUE)) + dot(15, 20, 5, c(RED)) + dot(22.5, 32, 5, c(GREEN));
        case 4: return dot(8.5, 10.5, 5.5, c(BLUE)) + dot(21.5, 10.5, 5.5, c(GREEN)) + dot(8.5, 29.5, 5.5, c(GREEN)) + dot(21.5, 29.5, 5.5, c(BLUE));
        case 5: return dot(8, 9, 5, c(BLUE)) + dot(22, 9, 5, c(GREEN)) + dot(15, 20, 5, RED) + dot(8, 31, 5, c(GREEN)) + dot(22, 31, 5, c(BLUE));
        case 6: return [9, 21].map(x => dot(x, 8, 4.6, c(GREEN)) + dot(x, 21.5, 4.6, RED) + dot(x, 32.5, 4.6, RED)).join('');
        case 7: return dot(6.5, 5.5, 3.9, c(GREEN)) + dot(15, 9, 3.9, c(GREEN)) + dot(23.5, 12.5, 3.9, c(GREEN))
            + [9, 21].map(x => dot(x, 23, 4.3, RED) + dot(x, 33.5, 4.3, RED)).join('');
        case 8: return [9, 21].map(x => [5.5, 15, 25, 34.5].map(y => dot(x, y, 4.3, c(BLUE))).join('')).join('');
        default: return [[8, BLUE], [20, RED], [32, GREEN]].map(([y, color]) => [6.5, 15, 23.5].map(x => dot(x, y, 4, c(color))).join('')).join('');
    }
}

const stick = (x, y, h, color) =>
    `<rect x="${x - 2.2}" y="${y - h / 2}" width="4.4" height="${h}" rx="2.2" fill="${color}"/>`
    + `<line x1="${x - 2.2}" y1="${y}" x2="${x + 2.2}" y2="${y}" stroke="#fffdf6" stroke-width="0.9"/>`
    + `<line x1="${x}" y1="${y - h / 2 + 1.5}" x2="${x}" y2="${y + h / 2 - 1.5}" stroke="#fffdf6" stroke-width="0.6" opacity="0.7"/>`;

function souzu(n, red) {
    const g = red ? RED : GREEN;
    switch (n) {
        case 1:
            // 鳥：胴・頭・尾羽
            return `<path d="M9 30 C 6 22, 9 14, 16 13 C 22 12.5, 24 18, 21 24 C 19 28, 14 31, 9 30 Z" fill="${GREEN}"/>`
                + `<circle cx="20" cy="10" r="4" fill="${RED}"/><path d="M23.5 9.5 L27 10.5 L23.5 11.8 Z" fill="${INK}"/>`
                + `<circle cx="21" cy="9.4" r="0.9" fill="#fffdf6"/>`
                + `<path d="M9 30 L5 36 M11 30.5 L9.5 37 M13.5 30 L14 36.5" stroke="${BLUE}" stroke-width="1.6" stroke-linecap="round"/>`
                + `<path d="M12 22 C 14 19, 17 19, 19 21" stroke="#fffdf6" stroke-width="1" fill="none"/>`;
        case 2: return stick(15, 10.5, 15, g) + stick(15, 29.5, 15, red ? RED : BLUE);
        case 3: return stick(15, 10.5, 15, g) + stick(9, 29.5, 15, red ? RED : BLUE) + stick(21, 29.5, 15, red ? RED : BLUE);
        case 4: return [9, 21].map(x => stick(x, 10.5, 15, g) + stick(x, 29.5, 15, red ? RED : BLUE)).join('');
        case 5: return [7, 23].map(x => stick(x, 9.5, 13, g) + stick(x, 30.5, 13, red ? RED : BLUE)).join('') + stick(15, 20, 13, RED);
        case 6: return [7, 15, 23].map(x => stick(x, 10.5, 15, g) + stick(x, 29.5, 15, red ? RED : BLUE)).join('');
        case 7: return stick(15, 6, 10, RED) + [7, 15, 23].map(x => stick(x, 19.5, 10, g) + stick(x, 32.5, 10, g)).join('');
        case 8: return [6, 12, 18, 24].map(x => stick(x, 10.5, 15, g) + stick(x, 29.5, 15, red ? RED : BLUE)).join('');
        default: return [7, 15, 23].map(x => [7, 20, 33].map(y => stick(x, y, 11, x === 15 ? RED : g)).join('')).join('');
    }
}

function honor(kind) {
    if (kind === 31) return `<rect x="5.5" y="7" width="19" height="26" rx="2" fill="none" stroke="${BLUE}" stroke-width="1.6"/><rect x="8" y="9.5" width="14" height="21" rx="1" fill="none" stroke="${BLUE}" stroke-width="0.8"/>`;
    if (kind === 32) return text(15, 20.5, 22, GREEN, '發');
    if (kind === 33) return text(15, 20.5, 23, RED, '中');
    return text(15, 20.5, 22, INK, ['東', '南', '西', '北'][kind - 27]);
}

function face(kind, red = false) {
    if (kind < 9) return manzu(kind + 1, red);
    if (kind < 18) return pinzu(kind - 8, red);
    if (kind < 27) return souzu(kind - 17, red);
    return honor(kind);
}

// ページに一度だけ入れる symbol の一覧
export function symbolsSvg() {
    const symbols = [];
    for (let k = 0; k < 34; k++) symbols.push(`<symbol id="tk${k}" viewBox="0 0 30 40">${face(k)}</symbol>`);
    [4, 13, 22].forEach(k => symbols.push(`<symbol id="tk${k}r" viewBox="0 0 30 40">${face(k, true)}</symbol>`));
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${symbols.join('')}</svg>`;
}

const symbolId = (id) => `tk${kindOf(id)}${isRed(id) ? 'r' : ''}`;

/**
 * 牌の要素の HTML
 * id：牌（null なら裏）。size：lg・md・sm・xs。side：横に倒す（立直の宣言牌・鳴いた牌）
 * cls：ほかのクラス。attrs：ほかの属性
 */
export function tileHtml(id, { size = 'md', side = false, cls = '', attrs = '' } = {}) {
    const classes = ['tile', size, side ? 'side' : '', id === null ? 'back' : '', cls].filter(Boolean).join(' ');
    if (id === null) return `<span class="${classes}" ${attrs}></span>`;
    return `<span class="${classes}" ${attrs}><svg viewBox="0 0 30 40" aria-hidden="true"><use href="#${symbolId(id)}"/></svg></span>`;
}

// 種類だけの牌（待ちの表示など）
export const kindTileHtml = (kind, options) => tileHtml(kind * 4 + 1, options);

// タイトルの絵：東南西北と中を少しずつずらして並べる
export function titleArtHtml() {
    const ids = [108, 112, 116, 120, 132].map(id => id + 1);
    return ids.map((id, i) => tileHtml(id, { size: 'lg', attrs: `style="transform: translateY(${Math.abs(i - 2) * 4}px) rotate(${(i - 2) * 6}deg)"` })).join('');
}
