/**
 * 絵（すべて自作の SVG。公式の画像は使っていない）
 * 和紙の盤に墨の線。駒は藍と朱の丸い駒で、師匠は「師」、弟子は「弟」。動物の絵（animal-art.js）は墨絵風
 * カードは和紙の地に、左に動きの図（5×5）、右に動物の絵と名前。印の色（藍・朱）を右下に置く
 */

import { CARDS } from './rules.js';
import { ANIMAL_ART, INK_DEFS } from './animal-art.js';

export const SEAT_FILL = ['#2f5596', '#c0432c'];
export const SEAT_NAME = ['藍', '朱'];

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    log: '<path d="M5 6h14M5 12h14M5 18h9"/>'
};

export function symbolsSvg() {
    const lines = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    const animals = Object.entries(ANIMAL_ART).map(([key, body]) => `<symbol id="a-${key}" viewBox="0 0 100 100">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${INK_DEFS}
        <radialGradient id="g-piece" cx=".38" cy=".3" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></radialGradient>
        ${lines}${animals}</defs></svg>`;
}

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// 駒（seat：0 藍・1 朱、master：師匠か）
export function pieceSvg(seat, master) {
    const r = master ? 44 : 37;
    return `<svg class="piece ${master ? 'master' : ''}" viewBox="0 0 100 100" aria-hidden="true">
        <circle cx="50" cy="53" r="${r}" fill="rgba(0,0,0,.35)"/>
        <circle cx="50" cy="49" r="${r}" fill="${SEAT_FILL[seat]}" stroke="#1a1612" stroke-width="3"/>
        <circle cx="50" cy="49" r="${r}" fill="url(#g-piece)"/>
        ${master ? `<circle cx="50" cy="49" r="${r - 7}" fill="none" stroke="#e6c46a" stroke-width="3"/>` : ''}
        <text x="50" y="${master ? 63 : 61}" text-anchor="middle" class="piece-char" font-size="${master ? 40 : 33}">${master ? '師' : '弟'}</text></svg>`;
}

// 神殿の門（盤の上の印）
export const templeSvg = () => `<svg class="temple" viewBox="0 0 100 100" aria-hidden="true">
    <path d="M14 30 Q50 20 86 30 L84 37 Q50 28 16 37Z" /><path d="M22 44 H78" /><path d="M30 34 V88 M70 34 V88" /></svg>`;

// 動きの図（5×5。真ん中が駒、色の付いたマスが行ける先。持ち主から見た向き）
export function gridSvg(card, { cls = '' } = {}) {
    const cells = [];
    const moves = CARDS[card].moves;
    for (let r = 0; r < 5; r++) {
        for (let c = 0; c < 5; c++) {
            const dx = c - 2;
            const dy = 2 - r;
            const center = dx === 0 && dy === 0;
            const on = moves.some(([x, y]) => x === dx && y === dy);
            cells.push(`<rect x="${c * 20 + 1}" y="${r * 20 + 1}" width="18" height="18" rx="2" class="${center ? 'g-center' : on ? `g-on ${CARDS[card].stamp}` : 'g-off'}"/>`);
        }
    }
    return `<svg class="grid ${cls}" viewBox="0 0 100 100" aria-hidden="true">${cells.join('')}</svg>`;
}

// カード1枚（attrs：ボタンの属性。flip：相手の向きに回す）
export function cardHtml(card, { cls = '', flip = false, tag = 'div', attrs = '' } = {}) {
    const c = CARDS[card];
    return `<${tag} class="card ${flip ? 'flip' : ''} ${cls}" data-card="${card}" ${attrs} aria-label="${c.name}（${c.reading}）">
        <span class="card-in">${gridSvg(card)}
            <span class="card-side"><svg class="animal" viewBox="0 0 100 100" aria-hidden="true"><use href="#a-${card}"/></svg>
            <span class="card-name">${c.name}</span></span>
            <span class="stamp ${c.stamp}" aria-hidden="true"></span></span></${tag}>`;
}
