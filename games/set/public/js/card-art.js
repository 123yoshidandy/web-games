/**
 * カードの絵（SVG）。形は symbol として一度だけページに入れ、カードごとに use で使い回す
 * 色は、色覚の違いでも見分けやすい3色（朱・緑・青。明るさも変えてある）。「色の印」を付けると、隅に色ごとの記号も出す
 */

import { cardAttributes } from './game.js';

export const COLORS = ['#d55e00', '#008a63', '#2a5db0'];
const SHAPES = ['diamond', 'capsule', 'wave'];
const SHAPE_W = 26;
const SHAPE_H = 60;
const CARD_W = 150;
const CARD_H = 96;

// 形（30×64 の枠）としまの模様
export function cardDefs() {
    const stripes = COLORS.map((color, i) => `
        <pattern id="stripes-${i}" width="30" height="4.4" patternUnits="userSpaceOnUse">
            <rect width="30" height="4.4" fill="#fff"/><path d="M0 1.2H30" stroke="${color}" stroke-width="1.5"/>
        </pattern>`).join('');
    return `<defs>${stripes}
        <symbol id="shape-diamond" viewBox="0 0 30 64"><path d="M15 3 28 32 15 61 2 32Z"/></symbol>
        <symbol id="shape-capsule" viewBox="0 0 30 64"><rect x="3" y="3" width="24" height="58" rx="12"/></symbol>
        <symbol id="shape-wave" viewBox="0 0 30 64"><path d="M9 3.5c9-2.5 18 2 17.5 10-.4 6-4.6 9.6-3.6 15.8.9 5.4 5.6 8.8 4.6 17.2-1 8.6-9 13.3-17.5 13.2C4.4 59.6 2.6 55 3 51c.6-5.6 5-8.3 4.2-14.4C6.4 30 2.2 27.2 2.8 19.6 3.3 11.5 4.6 4.8 9 3.5Z"/></symbol>
        <symbol id="mark-0" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4"/></symbol>
        <symbol id="mark-1" viewBox="0 0 10 10"><path d="M5 1 9.3 9H.7Z"/></symbol>
        <symbol id="mark-2" viewBox="0 0 10 10"><rect x="1.2" y="1.2" width="7.6" height="7.6"/></symbol>
    </defs>`;
}

// カードの中身（svg 要素の文字列）。marks：色の印を付けるか
export function cardSvg(card, { marks = false } = {}) {
    const { number, shape, shading, color } = cardAttributes(card);
    const count = number + 1;
    const stroke = COLORS[color];
    const fill = shading === 0 ? stroke : shading === 1 ? `url(#stripes-${color})` : '#fff';
    const gap = 8;
    const total = count * SHAPE_W + (count - 1) * gap;
    const left = (CARD_W - total) / 2;
    const top = (CARD_H - SHAPE_H) / 2;
    const shapes = Array.from({ length: count }, (_, i) => `<use href="#shape-${SHAPES[shape]}" x="${left + i * (SHAPE_W + gap)}" y="${top}" width="${SHAPE_W}" height="${SHAPE_H}" fill="${fill}" stroke="${stroke}" stroke-width="2.6" stroke-linejoin="round"/>`).join('');
    const mark = marks ? `<use href="#mark-${color}" x="7" y="7" width="11" height="11" fill="${stroke}"/>` : '';
    return `<svg class="card-art" viewBox="0 0 ${CARD_W} ${CARD_H}" aria-hidden="true">${shapes}${mark}</svg>`;
}

// 読み上げ用の名前（例：2・しま・緑・カプセル）
export function cardLabel(card) {
    const { number, shape, shading, color } = cardAttributes(card);
    return `${number + 1}・${['塗り', 'しま', '白抜き'][shading]}・${['朱', '緑', '青'][color]}・${['ダイヤ', 'カプセル', 'なみ'][shape]}`;
}
