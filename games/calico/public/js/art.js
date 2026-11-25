/**
 * 絵（すべて自作の SVG）
 * パッチは、6色の上に白い模様を重ねる。模様は形で見分けられる（しま・シダ・水玉・花・四つ葉・つる）
 * 猫は丸い顔の図柄。毛の色と柄を猫ごとに変える。図柄は symbol として一度だけページに入れ、use で使い回す
 */

import { TILES, COLORS, PATTERNS, CATS, GOALS } from './data.js';

export const COLOR_INFO = {
    yellow: { name: '黄', hex: '#efbd45', deep: '#b9871a' },
    pink: { name: 'ピンク', hex: '#e5719b', deep: '#ab3f68' },
    purple: { name: '紫', hex: '#9175c6', deep: '#5f4597' },
    sky: { name: '水色', hex: '#55bcd3', deep: '#2b8399' },
    green: { name: '緑', hex: '#74b65a', deep: '#47812f' },
    navy: { name: '紺', hex: '#43529c', deep: '#27326a' }
};
export const PATTERN_INFO = {
    stripes: { name: 'しま' },
    ferns: { name: 'シダ' },
    dots: { name: '水玉' },
    flowers: { name: '花' },
    quatrefoil: { name: '四つ葉' },
    vines: { name: 'つる' }
};

// 六角の角（先の尖った向き）
export function hexPoints(cx, cy, size) {
    return Array.from({ length: 6 }, (_, i) => {
        const a = Math.PI / 180 * (60 * i - 30);
        return `${(cx + size * Math.cos(a)).toFixed(2)},${(cy + size * Math.sin(a)).toFixed(2)}`;
    }).join(' ');
}

// パッチ1枚（<g>）。patch：{ color, pattern }
export function patchSvg(patch, cx, cy, size, { cls = '', attrs = '' } = {}) {
    const m = size * 0.86;
    return `<g class="patch ${cls}" ${attrs}>
        <polygon points="${hexPoints(cx, cy, size * 0.96)}" fill="${COLOR_INFO[patch.color].hex}" class="patch-hex"/>
        <use href="#pt-${patch.pattern}" x="${cx - m}" y="${cy - m}" width="${2 * m}" height="${2 * m}"/>
    </g>`;
}

// パッチ1枚（単独の <svg>）
export function tileSvg(tileId, px = 48, extra = '') {
    if (tileId == null) return '';
    return `<svg class="tile-svg" viewBox="-9.2 -10.2 18.4 20.4" width="${px}" height="${(px * 20.4 / 18.4).toFixed(1)}" ${extra}>${patchSvg(TILES[tileId], 0, 0, 10)}</svg>`;
}

// 模様だけ（凡例・猫の札に使う。グレーの六角に白い模様）
export function patternSwatch(pattern, px = 18) {
    return `<svg class="swatch" viewBox="-10 -10 20 20" width="${px}" height="${px}" aria-label="${PATTERN_INFO[pattern].name}"><polygon points="${hexPoints(0, 0, 9.6)}" fill="#7d7a86"/><use href="#pt-${pattern}" x="-8.3" y="-8.3" width="16.6" height="16.6"/></svg>`;
}

// 色だけ
export function colorSwatch(color, px = 18) {
    return `<svg class="swatch" viewBox="-10 -10 20 20" width="${px}" height="${px}" aria-label="${COLOR_INFO[color].name}"><polygon points="${hexPoints(0, 0, 9.6)}" fill="${COLOR_INFO[color].hex}"/></svg>`;
}

export const catSvg = (catId, px = 30) => `<svg class="cat-svg" viewBox="-10 -10 20 20" width="${px}" height="${px}" aria-label="${CATS[catId].name}"><use href="#cat-${catId}" x="-10" y="-10" width="20" height="20"/></svg>`;
export const buttonSvg = (color, px = 18) => `<svg class="button-svg" viewBox="-10 -10 20 20" width="${px}" height="${px}"><use href="#btn-${color}" x="-10" y="-10" width="20" height="20"/></svg>`;

// 目標タイル（<g>）
export function goalSvg(goalId, cx, cy, size, { cls = '', status = null } = {}) {
    const g = GOALS[goalId];
    const fs = g.label.length >= 7 ? size * 0.29 : g.label.length > 3 ? size * 0.34 : size * 0.75;
    const mark = status?.points ? `<text x="${cx}" y="${cy + size * 0.62}" class="goal-got" font-size="${size * 0.34}">${status.points}</text>` : '';
    return `<g class="goal ${cls}">
        <polygon points="${hexPoints(cx, cy, size * 0.96)}" class="goal-hex"/>
        <polygon points="${hexPoints(cx, cy, size * 0.8)}" class="goal-stitch"/>
        <text x="${cx - size * 0.31}" y="${cy - size * 0.34}" class="goal-one" font-size="${size * 0.34}">${g.one}</text>
        <text x="${cx + size * 0.31}" y="${cy - size * 0.34}" class="goal-both" font-size="${size * 0.34}">${g.both}</text>
        <text x="${cx}" y="${cy + fs * 0.36}" class="goal-label" font-size="${fs}">${g.label}</text>${mark}
    </g>`;
}

// 単独の目標タイル
export const goalTileSvg = (goalId, px = 60) => `<svg class="goal-svg" viewBox="-9.2 -10.2 18.4 20.4" width="${px}" height="${(px * 20.4 / 18.4).toFixed(1)}">${goalSvg(goalId, 0, 0, 10)}</svg>`;

export const icon = (id) => `<svg class="ico" aria-hidden="true"><use href="#i-${id}"/></svg>`;

// 猫の顔。fur：毛、ear：耳の内側、marks：柄（[色, 形]）
function catFace({ fur, ear = '#f2b8b0', marks = '', eye = '#2b2420', muzzle = '#fff8ef', stroke = 'rgba(60,40,30,.35)' }) {
    return `<path d="M-7.6 -1.2 L-7.2 -9 L-2.6 -5.6 Q0 -6.4 2.6 -5.6 L7.2 -9 L7.6 -1.2 Q8.4 6.8 0 7.6 Q-8.4 6.8 -7.6 -1.2Z" fill="${fur}" stroke="${stroke}" stroke-width=".5"/>
        <path d="M-6.4 -3 L-6.2 -7.2 L-3.6 -5.2Z M6.4 -3 L6.2 -7.2 L3.6 -5.2Z" fill="${ear}"/>
        ${marks}
        <ellipse cx="0" cy="3.4" rx="3.6" ry="2.6" fill="${muzzle}"/>
        <ellipse cx="-3" cy="0.2" rx="1.25" ry="1.5" fill="${eye}"/><ellipse cx="3" cy="0.2" rx="1.25" ry="1.5" fill="${eye}"/>
        <circle cx="-2.6" cy="-0.3" r=".45" fill="#fff"/><circle cx="3.4" cy="-0.3" r=".45" fill="#fff"/>
        <path d="M-0.8 2.2 L0.8 2.2 L0 3.1Z" fill="#e58a8a"/>
        <path d="M0 3.1 Q-0.9 4.4 -1.9 3.8 M0 3.1 Q0.9 4.4 1.9 3.8" stroke="#6b4a3a" stroke-width=".45" fill="none" stroke-linecap="round"/>
        <path d="M-4.4 3 L-8.4 2.4 M-4.4 3.8 L-8.2 4.2 M4.4 3 L8.4 2.4 M4.4 3.8 L8.2 4.2" stroke="rgba(80,60,50,.45)" stroke-width=".35" stroke-linecap="round"/>
        <ellipse cx="-4.6" cy="2.2" rx="1.1" ry=".65" fill="#f3a4a0" opacity=".7"/><ellipse cx="4.6" cy="2.2" rx="1.1" ry=".65" fill="#f3a4a0" opacity=".7"/>`;
}

const CAT_LOOKS = {
    millie: { fur: '#fbf4ea', marks: '<path d="M-7.4 -2 L-7 -8.6 L-2.8 -5.4 Q-4 -2 -7.4 -2Z" fill="#e0913e"/><path d="M7.4 -1.6 L7.1 -8.6 L2.8 -5.4 Q3.6 -1.4 7.4 -1.6Z" fill="#3a302c"/>' },
    tibbit: { fur: '#eda55a', marks: '<path d="M-1.6 -5.8 L-1 -3.4 M0 -6 L0 -3.2 M1.6 -5.8 L1 -3.4" stroke="#c9752e" stroke-width=".8" stroke-linecap="round"/>' },
    coconut: { fur: '#8f8d93', ear: '#e8b6b2', marks: '<path d="M-1.4 -5.8 L-0.9 -3.6 M1.4 -5.8 L0.9 -3.6" stroke="#6c6a72" stroke-width=".8" stroke-linecap="round"/>' },
    cira: { fur: '#f4ead8', marks: '<ellipse cx="0" cy="2.4" rx="4.8" ry="3.8" fill="#c9b29a" opacity=".55"/>' },
    gwen: { fur: '#2f2b2e', ear: '#d9a3a6', eye: '#e7c45a', muzzle: '#fbf7f2', marks: '<path d="M-1.6 -6 Q0 -2 1.6 -6 L2.4 6.6 Q0 7.6 -2.4 6.6Z" fill="#fbf7f2"/>' },
    callie: { fur: '#fbf4ea', marks: '<path d="M-7.4 -2 L-7 -8.6 L-2.8 -5.4 Q-2 -1 -7.4 -2Z" fill="#3a302c"/><path d="M7.4 -1.6 L7.1 -8.6 L2.8 -5.4 Q2.4 -1 7.4 -1.6Z" fill="#e0913e"/><circle cx="4.4" cy="-3.2" r="1.4" fill="#3a302c"/>' },
    rumi: { fur: '#f1b56e', marks: '<path d="M-6.8 0 L-4.6 0.4 M-7 1.8 L-4.8 1.8 M6.8 0 L4.6 0.4 M7 1.8 L4.8 1.8" stroke="#cf8238" stroke-width=".8" stroke-linecap="round"/><path d="M0 -6 L0 -3.2" stroke="#cf8238" stroke-width=".9" stroke-linecap="round"/>' },
    tecolote: { fur: '#a98463', marks: '<path d="M-1.6 -5.8 L-1 -3.2 M0 -6 L0 -3 M1.6 -5.8 L1 -3.2 M-7 0.6 L-5 1 M7 0.6 L5 1" stroke="#6e4f36" stroke-width=".8" stroke-linecap="round"/>' },
    almond: { fur: '#f7efe2', ear: '#8a6a55', marks: '<ellipse cx="0" cy="1.2" rx="3.8" ry="4.4" fill="#9a7a62" opacity=".75"/>', muzzle: '#d8c3ae' },
    leo: { fur: '#262326', ear: '#d9a3a6', eye: '#9fc66a', muzzle: '#fbf7f2', marks: '<path d="M-2.8 1 Q0 -0.4 2.8 1 L3 6.8 Q0 7.8 -3 6.8Z" fill="#fbf7f2"/>' }
};

// ボタン（4つ穴）。虹のボタンは6色の扇
function buttonSymbol(color) {
    const holes = '<circle cx="-1.6" cy="-1.6" r="1" fill="rgba(0,0,0,.35)"/><circle cx="1.6" cy="-1.6" r="1" fill="rgba(0,0,0,.35)"/><circle cx="-1.6" cy="1.6" r="1" fill="rgba(0,0,0,.35)"/><circle cx="1.6" cy="1.6" r="1" fill="rgba(0,0,0,.35)"/>';
    if (color === 'rainbow') {
        const slices = COLORS.map((c, i) => {
            const a1 = (Math.PI * 2 * i) / 6 - Math.PI / 2;
            const a2 = (Math.PI * 2 * (i + 1)) / 6 - Math.PI / 2;
            return `<path d="M0 0 L${(8 * Math.cos(a1)).toFixed(2)} ${(8 * Math.sin(a1)).toFixed(2)} A8 8 0 0 1 ${(8 * Math.cos(a2)).toFixed(2)} ${(8 * Math.sin(a2)).toFixed(2)}Z" fill="${COLOR_INFO[c].hex}"/>`;
        }).join('');
        return `<symbol id="btn-rainbow" viewBox="-10 -10 20 20"><circle r="8.8" fill="#fff"/>${slices}<circle r="8" fill="none" stroke="rgba(0,0,0,.25)" stroke-width=".8"/>${holes}</symbol>`;
    }
    const c = COLOR_INFO[color];
    return `<symbol id="btn-${color}" viewBox="-10 -10 20 20"><circle r="8.6" fill="${c.hex}" stroke="${c.deep}" stroke-width="1.2"/><circle r="5.6" fill="none" stroke="rgba(255,255,255,.55)" stroke-width=".8"/>${holes}</symbol>`;
}

// 一度だけページに入れる図柄
export function symbolsSvg() {
    const W = 'rgba(255,255,255,.9)';
    const patterns = {
        stripes: `<g clip-path="url(#hexclip)" stroke="${W}" stroke-width="2.1"><path d="M-14 -6 L6 14 M-14 2 L-2 14 M-10 -10 L10 10 M-2 -10 L14 6 M6 -10 L14 -2"/></g>`,
        dots: `<g fill="${W}"><circle r="1.9"/><circle cx="-4.6" cy="0" r="1.6"/><circle cx="4.6" cy="0" r="1.6"/><circle cx="-2.3" cy="-4" r="1.6"/><circle cx="2.3" cy="-4" r="1.6"/><circle cx="-2.3" cy="4" r="1.6"/><circle cx="2.3" cy="4" r="1.6"/></g>`,
        flowers: `<g fill="${W}">${[0, 72, 144, 216, 288].map(a => `<ellipse cx="0" cy="-3.6" rx="2.2" ry="3.2" transform="rotate(${a})"/>`).join('')}</g><circle r="1.7" fill="rgba(0,0,0,.18)"/>`,
        quatrefoil: `<g fill="none" stroke="${W}" stroke-width="1.6"><path d="M0 -1.4 C-1.6 -7.6 -6.8 -4.6 -1.4 0 C-6.8 4.6 -1.6 7.6 0 1.4 C1.6 7.6 6.8 4.6 1.4 0 C6.8 -4.6 1.6 -7.6 0 -1.4Z"/></g><circle r="1.3" fill="${W}"/>`,
        ferns: `<g fill="${W}"><path d="M0 7.4 Q0.6 0 0 -7.4" stroke="${W}" stroke-width="1" fill="none"/>${[-5, -2.4, 0.2, 2.8].map((y, i) => `<ellipse cx="-2.4" cy="${y}" rx="${2.6 - i * 0.3}" ry="1" transform="rotate(-28 -2.4 ${y})"/><ellipse cx="2.4" cy="${y}" rx="${2.6 - i * 0.3}" ry="1" transform="rotate(28 2.4 ${y})"/>`).join('')}</g>`,
        vines: `<g fill="none" stroke="${W}" stroke-width="1.4" stroke-linecap="round"><path d="M-6 5 Q-6 -2 0 -2 Q4.4 -2 4.4 1.6 Q4.4 4 2 4 Q0 4 0 2.4"/><path d="M-3 -1 Q-4.6 -4.6 -2 -6.4"/></g><g fill="${W}"><ellipse cx="-1.8" cy="-6.2" rx="1.8" ry="1.1" transform="rotate(-30 -1.8 -6.2)"/><ellipse cx="-6.4" cy="1" rx="1.8" ry="1.1" transform="rotate(70 -6.4 1)"/><ellipse cx="5.8" cy="-3.4" rx="1.7" ry="1" transform="rotate(-50 5.8 -3.4)"/></g>`
    };
    const cats = Object.entries(CAT_LOOKS).map(([id, look]) => `<symbol id="cat-${id}" viewBox="-10 -10 20 20">${catFace(look)}</symbol>`).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
    <clipPath id="hexclip"><polygon points="${hexPoints(0, 0, 9.6)}"/></clipPath>
    ${PATTERNS.map(p => `<symbol id="pt-${p}" viewBox="-10 -10 20 20">${patterns[p]}</symbol>`).join('')}
    ${cats}
    ${[...COLORS, 'rainbow'].map(buttonSymbol).join('')}
    <symbol id="i-home" viewBox="0 0 24 24"><path d="M3 11 12 4l9 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/></symbol>
    <symbol id="i-help" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.8.4-1.1 1-1.1 1.8v.5"/><path d="M12 17.2v.1"/></symbol>
    <symbol id="i-log" viewBox="0 0 24 24"><path d="M5 5h14M5 10h14M5 15h10M5 20h7"/></symbol>
    <symbol id="i-check" viewBox="0 0 24 24"><path d="M5 12.5 10 17.5 19 7"/></symbol>
</defs></svg>`;
}
