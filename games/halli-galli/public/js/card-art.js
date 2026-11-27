/**
 * カードとベルの絵（インライン SVG）。果物の図柄は symbol にして、カードでは use で使い回す
 * 果物：いちご（赤・種と葉）・バナナ（黄色の三日月）・ライム（緑の輪切り）・プラム（紫・筋と葉）
 * 数は、さいころの目のように並べる（色だけでなく形でも見分けられる）
 */

import { FRUITS, cardFruit, cardCount, cardLabel } from './game.js';

export { cardLabel };

// 果物の図柄（中心が 0,0、半径およそ 17）
const SYMBOLS = {
    strawberry: `
        <path d="M0 17C-9 13-15 4-15-4c0-6 6-8.5 15-6.5 9-2 15 .5 15 6.5C15 4 9 13 0 17z" fill="#e2393f" stroke="#a3222a" stroke-width="1.2"/>
        <g fill="#ffe6a6">
            <ellipse cx="-7" cy="-2" rx="1" ry="1.5"/><ellipse cx="0" cy="-3" rx="1" ry="1.5"/><ellipse cx="7" cy="-2" rx="1" ry="1.5"/>
            <ellipse cx="-4" cy="4" rx="1" ry="1.5"/><ellipse cx="4" cy="4" rx="1" ry="1.5"/><ellipse cx="0" cy="10" rx="1" ry="1.5"/>
            <ellipse cx="-9" cy="4" rx=".9" ry="1.3"/><ellipse cx="9" cy="4" rx=".9" ry="1.3"/>
        </g>
        <path d="M-11-9 -4-10.5 0-16 4-10.5 11-9 4.5-7.5 0-6 -4.5-7.5z" fill="#3b9a3c" stroke="#24692a" stroke-width=".8"/>`,
    banana: `
        <path d="M-12-13C-16 1-6 15 15 9c2-.6 2-3 0-3.4C1 8-6-2-7-12.5z" fill="#f7d43c" stroke="#b58f1f" stroke-width="1.2"/>
        <path d="M-9.5-11C-11 1-3 9 9 8" fill="none" stroke="#e2b52a" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M-12.6-12.6-13.6-16.4-8.2-15.6-7-12.4z" fill="#6f5a2c"/>
        <circle cx="16" cy="7.6" r="1.4" fill="#5a4626"/>`,
    lime: `
        <circle r="15.5" fill="#6fb83b" stroke="#3d7a1c" stroke-width="1.4"/>
        <circle r="12.4" fill="#e7f6bd"/>
        <circle r="11" fill="#bfe27a"/>
        <g stroke="#e7f6bd" stroke-width="1.5" stroke-linecap="round">
            <path d="M0-10.5V-1.5"/><path d="M7.4-7.4 1.1-1.1"/><path d="M10.5 0H1.5"/><path d="M7.4 7.4 1.1 1.1"/>
            <path d="M0 10.5V1.5"/><path d="M-7.4 7.4-1.1 1.1"/><path d="M-10.5 0H-1.5"/><path d="M-7.4-7.4-1.1-1.1"/>
        </g>
        <circle r="1.6" fill="#e7f6bd"/>`,
    plum: `
        <path d="M0-11C10-13 16-5 15 4 14 12 7 17 0 16-7 17-14 12-15 4-16-5-10-13 0-11z" fill="#7d3fa2" stroke="#4b1f66" stroke-width="1.2"/>
        <path d="M0-11C-3-3-3 7 0 16" fill="none" stroke="#5c2a7d" stroke-width="1.4"/>
        <ellipse cx="-7" cy="-2" rx="2.6" ry="5" fill="#fff" opacity=".28" transform="rotate(18 -7 -2)"/>
        <path d="M0-11 1.6-17" stroke="#6b4b28" stroke-width="1.6" stroke-linecap="round"/>
        <path d="M1.4-15C6-19 11-17 12-14 7-12 3-13 1.4-15z" fill="#4ea443" stroke="#2c6f2a" stroke-width=".8"/>`
};

// 数ごとの果物の位置（カードは 100×100）と大きさ
const LAYOUTS = {
    1: [[50, 50]],
    2: [[30, 30], [70, 70]],
    3: [[26, 26], [50, 50], [74, 74]],
    4: [[29, 29], [71, 29], [29, 71], [71, 71]],
    5: [[27, 27], [73, 27], [50, 50], [27, 73], [73, 73]]
};
const SIZES = { 1: 50, 2: 40, 3: 34, 4: 36, 5: 32 };

// 文書に1回だけ置く定義（果物の symbol と、ベルの金色）
export function cardDefs() {
    return FRUITS.map(name => `<symbol id="fruit-${name}" viewBox="-20 -20 40 40">${SYMBOLS[name]}</symbol>`).join('')
        + `<linearGradient id="bell-gold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffe9a3"/><stop offset=".45" stop-color="#f2c14e"/><stop offset="1" stop-color="#b8811f"/>
        </linearGradient>`;
}

// 表のカード
export function cardSvg(card) {
    const name = FRUITS[cardFruit(card)];
    const count = cardCount(card);
    const size = SIZES[count];
    const fruits = LAYOUTS[count].map(([x, y]) => `<use href="#fruit-${name}" x="${x - size / 2}" y="${y - size / 2}" width="${size}" height="${size}"/>`).join('');
    return `<svg class="card-svg" viewBox="0 0 100 100" aria-hidden="true"><rect x="2" y="2" width="96" height="96" rx="11" class="card-face"/>${fruits}</svg>`;
}

// 裏のカード（山札）
export function backSvg() {
    return `<svg class="card-svg" viewBox="0 0 100 100" aria-hidden="true">
        <rect x="2" y="2" width="96" height="96" rx="11" class="card-back"/>
        <rect x="11" y="11" width="78" height="78" rx="7" class="card-back-inner"/>
        <g transform="translate(50 50) scale(.9)"><use href="#fruit-strawberry" x="-30" y="-30" width="30" height="30"/><use href="#fruit-banana" x="0" y="-30" width="30" height="30"/>
        <use href="#fruit-lime" x="-30" y="0" width="30" height="30"/><use href="#fruit-plum" x="0" y="0" width="30" height="30"/></g>
    </svg>`;
}

// ベル（ボタンの中に描く）
export function bellSvg() {
    return `<svg class="bell-svg" viewBox="0 0 120 120" aria-hidden="true">
        <ellipse cx="60" cy="96" rx="48" ry="12" class="bell-base"/>
        <rect x="14" y="84" width="92" height="12" rx="6" class="bell-base"/>
        <path d="M20 86C20 50 34 30 60 30S100 50 100 86z" fill="url(#bell-gold)" stroke="#8a5d12" stroke-width="2"/>
        <path d="M32 74C33 54 42 41 56 38" fill="none" stroke="#fff6d6" stroke-width="5" stroke-linecap="round" opacity=".6"/>
        <rect x="54" y="16" width="12" height="16" rx="3" fill="#c9952e" stroke="#8a5d12" stroke-width="2"/>
        <ellipse cx="60" cy="15" rx="13" ry="6" fill="url(#bell-gold)" stroke="#8a5d12" stroke-width="2"/>
    </svg>`;
}
