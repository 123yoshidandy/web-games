/**
 * 絵（すべて自作の SVG）
 * 盤は榧（かや）の色に黒い線と星。石は黒と白の碁石で、光と影のグラデーションで丸みを付ける
 * 石とアイコンは symbol として一度だけページに入れ、use で使い回す
 */

import { starPoints } from './rules.js';

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>',
    flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
    save: '<path d="M12 4v11"/><path d="M7 10l5 5 5-5"/><path d="M5 20h14"/>'
};

// 石（viewBox 0 0 100 100。中心 50,50、半径 47。下に薄い影）
const STONES = {
    black: `<ellipse cx="51" cy="53" rx="47" ry="46" fill="rgba(0,0,0,.35)"/>
        <circle cx="50" cy="50" r="47" fill="url(#g-black)"/>
        <ellipse cx="37" cy="31" rx="17" ry="10" fill="url(#g-black-hi)" transform="rotate(-30 37 31)"/>`,
    white: `<ellipse cx="51" cy="53" rx="47" ry="46" fill="rgba(0,0,0,.3)"/>
        <circle cx="50" cy="50" r="47" fill="url(#g-white)"/>
        <circle cx="50" cy="50" r="46.2" fill="none" stroke="rgba(110,104,92,.5)" stroke-width="1.6"/>
        <ellipse cx="37" cy="31" rx="16" ry="9" fill="url(#g-white-hi)" transform="rotate(-30 37 31)"/>`
};

const DEFS = `
    <radialGradient id="g-black" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#5d6064"/><stop offset=".45" stop-color="#232527"/><stop offset="1" stop-color="#070808"/></radialGradient>
    <radialGradient id="g-black-hi"><stop offset="0" stop-color="#fff" stop-opacity=".38"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <radialGradient id="g-white" cx=".36" cy=".3" r=".85"><stop offset="0" stop-color="#ffffff"/><stop offset=".55" stop-color="#efede6"/><stop offset="1" stop-color="#bdb8ab"/></radialGradient>
    <radialGradient id="g-white-hi"><stop offset="0" stop-color="#fff" stop-opacity=".95"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
    <linearGradient id="g-wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e6bf78"/><stop offset=".5" stop-color="#dcb066"/><stop offset="1" stop-color="#cf9f55"/></linearGradient>`;

export function symbolsSvg() {
    const lines = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    const stones = Object.entries(STONES).map(([key, body]) => `<symbol id="s-${key}" viewBox="0 0 100 100">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${DEFS}</defs>${lines}${stones}</svg>`;
}

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// 石1つ（color：1 黒・2 白）
export const stoneSvg = (color, cls = '') => `<svg class="stone ${cls}" viewBox="0 0 100 100" aria-hidden="true"><use href="#s-${color === 1 ? 'black' : 'white'}"/></svg>`;

// 盤の座標：線の交点 (列, 行) を viewBox の座標にする。縁は MARGIN
export const MARGIN = 0.75;
export const boardExtent = (size) => size - 1 + MARGIN * 2;
export const pointXY = (sq, size) => [MARGIN + (sq % size), MARGIN + Math.floor(sq / size)];

// 盤の地（木目・線・星）。石や印は別に重ねる
export function boardBaseSvg(size) {
    const ext = boardExtent(size);
    const end = MARGIN + size - 1;
    const lines = [];
    for (let i = 0; i < size; i++) {
        const v = (MARGIN + i).toFixed(2);
        lines.push(`M${MARGIN} ${v}H${end}`, `M${v} ${MARGIN}V${end}`);
    }
    const grain = [0.18, 0.37, 0.52, 0.71, 0.86].map((f, i) => `<path d="M0 ${(ext * f).toFixed(2)} Q${ext / 2} ${(ext * f + (i % 2 ? 0.5 : -0.4)).toFixed(2)} ${ext} ${(ext * f + 0.1).toFixed(2)}" stroke="rgba(150,96,40,.16)" stroke-width="${(0.12 + i * 0.03).toFixed(2)}" fill="none"/>`).join('');
    const stars = starPoints(size).map(sq => {
        const [x, y] = pointXY(sq, size);
        return `<circle cx="${x}" cy="${y}" r="${size === 19 ? 0.11 : 0.09}"/>`;
    }).join('');
    return `<rect width="${ext}" height="${ext}" rx="0.25" fill="url(#g-wood)"/>${grain}
        <path d="${lines.join('')}" stroke="#3a2a14" stroke-width="${size === 19 ? 0.045 : 0.035}" fill="none"/>
        <rect x="${MARGIN}" y="${MARGIN}" width="${size - 1}" height="${size - 1}" stroke="#3a2a14" stroke-width="${size === 19 ? 0.07 : 0.06}" fill="none"/>
        <g fill="#3a2a14">${stars}</g>`;
}

// 盤の上の石（use で symbol を置く）
export const stoneAt = (sq, size, color, cls = '') => {
    const [x, y] = pointXY(sq, size);
    return `<use href="#s-${color === 1 ? 'black' : 'white'}" class="${cls}" x="${(x - 0.48).toFixed(2)}" y="${(y - 0.48).toFixed(2)}" width="0.96" height="0.96"/>`;
};
