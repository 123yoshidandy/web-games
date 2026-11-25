/**
 * 絵（すべて自作の SVG）
 * - 画家5人の作風を描き分ける。同じ画家のカードも、カードの番号から少しずつ変える
 *   ライト・メタル：金属の円と斜めの帯 / ヨーコ：やわらかい葉と曲線 / クリスティン・P：花と水玉のポップな絵
 *   カール・ギッター：格子の色面（Gitter は格子） / クリプト：羊皮紙の上の謎の記号
 * - 競りの種類のしるしと、ボタンのアイコン
 */

import { CARDS, ARTISTS, TYPES } from './cards.js';
import { createRandom } from './random.js';

const W = 60;
const H = 76;

function liteMetal(r) {
    const cx = 18 + r() * 24;
    const cy = 22 + r() * 30;
    const rings = [26, 19, 12, 6].map((rad, i) => `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${rad}" fill="${['#f4d36b', '#c9a227', '#f8e7a8', '#8a6a10'][i]}"/>`).join('');
    // 斜めの帯は、絵の枠の中に収まる平行四辺形で描く（回した長方形だと枠の外まで伸びる）
    const slope = -18 + r() * 36;
    const band = (y, h, fill) => `<polygon points="0,${(y - slope / 2).toFixed(1)} ${W},${(y + slope / 2).toFixed(1)} ${W},${(y + slope / 2 + h).toFixed(1)} 0,${(y - slope / 2 + h).toFixed(1)}" fill="${fill}"/>`;
    return `<rect width="${W}" height="${H}" fill="#3a3a40"/>${rings}
        ${band(30 + r() * 10, 7, '#d9dde3')}${band(46 + r() * 6, 3, '#9aa0a8')}
        <path d="M${(8 + r() * 10).toFixed(1)} 70 L${(40 + r() * 14).toFixed(1)} 8" stroke="#fff6d0" stroke-width="1.4"/>`;
}

function yoko(r) {
    const leaves = Array.from({ length: 4 }, () => {
        const x = 8 + r() * 44;
        const y = 12 + r() * 52;
        const a = (r() * 360).toFixed(0);
        const s = (0.7 + r() * 0.7).toFixed(2);
        const fill = ['#2f6430', '#5aa057', '#9fd08a', '#cfe8a8'][Math.floor(r() * 4)];
        return `<path d="M0 -12 Q9 0 0 12 Q-9 0 0 -12z" fill="${fill}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${a}) scale(${s})"/>`;
    }).join('');
    const wave = `<path d="M-4 ${(50 + r() * 10).toFixed(1)} Q 15 ${(30 + r() * 20).toFixed(1)} 30 ${(48 + r() * 8).toFixed(1)} T 64 ${(40 + r() * 16).toFixed(1)}" stroke="#2f6430" stroke-width="2" fill="none" stroke-linecap="round"/>`;
    return `<rect width="${W}" height="${H}" fill="#eef5df"/><circle cx="${(15 + r() * 30).toFixed(1)}" cy="${(14 + r() * 10).toFixed(1)}" r="9" fill="#f6e3a1"/>${wave}${leaves}`;
}

function christin(r) {
    const dots = Array.from({ length: 9 }, (_, i) => `<circle cx="${(4 + (i % 3) * 26 + r() * 6).toFixed(1)}" cy="${(6 + Math.floor(i / 3) * 30 + r() * 6).toFixed(1)}" r="3" fill="#ffd0dc"/>`).join('');
    const cx = 22 + r() * 16;
    const cy = 30 + r() * 16;
    const petals = Array.from({ length: 6 }, (_, k) => `<ellipse cx="${cx.toFixed(1)}" cy="${(cy - 10).toFixed(1)}" rx="5.5" ry="10" fill="${k % 2 ? '#f4a0b8' : '#fff1f4'}" transform="rotate(${k * 60} ${cx.toFixed(1)} ${cy.toFixed(1)})"/>`).join('');
    return `<rect width="${W}" height="${H}" fill="#d9577a"/>${dots}${petals}<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="6" fill="#f2c94c" stroke="#86283f" stroke-width="1.2"/>
        <path d="M${cx.toFixed(1)} ${(cy + 8).toFixed(1)} V74" stroke="#3b6b2a" stroke-width="2"/>`;
}

function karl(r) {
    const xs = [0, 14 + Math.floor(r() * 10), 34 + Math.floor(r() * 10), W];
    const ys = [0, 16 + Math.floor(r() * 12), 42 + Math.floor(r() * 12), H];
    const palette = ['#3f74c9', '#f4f1e8', '#f4f1e8', '#1f3f7a', '#f4f1e8', '#e8c547', '#f4f1e8', '#9cc0ef'];
    let cells = '';
    for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) {
            cells += `<rect x="${xs[i]}" y="${ys[j]}" width="${xs[i + 1] - xs[i]}" height="${ys[j + 1] - ys[j]}" fill="${palette[Math.floor(r() * palette.length)]}"/>`;
        }
    }
    const lines = [...xs.slice(1, 3).map(x => `<rect x="${x - 1.5}" y="0" width="3" height="${H}" fill="#151a26"/>`),
        ...ys.slice(1, 3).map(y => `<rect x="0" y="${y - 1.5}" width="${W}" height="3" fill="#151a26"/>`)].join('');
    return `${cells}${lines}`;
}

const GLYPHS = [
    'M-5 5 L0 -6 L5 5 Z', 'M-5 0 H5 M0 -5 V5', 'M-4 -4 L4 4 M4 -4 L-4 4', 'M-5 -3 Q0 -9 5 -3 Q0 3 -5 -3 M0 0 V6',
    'M-4 -5 V5 H4', 'M0 -6 A6 6 0 1 0 0.1 -6 M0 -2 V2', 'M-5 4 L-2 -4 L1 4 L4 -4', 'M-5 -5 H5 V5 H-5 Z M-2 -2 H2 V2 H-2 Z'
];

function krypto(r) {
    const glyphs = Array.from({ length: 6 }, (_, i) => {
        const x = 12 + (i % 2) * 36 + r() * 6 - 3;
        const y = 14 + Math.floor(i / 2) * 24 + r() * 4 - 2;
        return `<path d="${GLYPHS[Math.floor(r() * GLYPHS.length)]}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)}) scale(${(0.9 + r() * 0.5).toFixed(2)})" stroke="#4a3020" stroke-width="1.6" fill="none" stroke-linecap="round"/>`;
    }).join('');
    return `<rect width="${W}" height="${H}" fill="#e9d8b6"/><rect x="3" y="3" width="54" height="70" fill="none" stroke="#b48a5e" stroke-width="1.2" stroke-dasharray="3 2"/>
        <circle cx="${(20 + r() * 20).toFixed(1)}" cy="${(30 + r() * 16).toFixed(1)}" r="16" fill="#d7b98c" opacity=".7"/>${glyphs}`;
}

const STYLES = [liteMetal, yoko, christin, karl, krypto];

// カード1枚の絵（SVG の中身。番号ごとに同じ絵になる）
const paintingCache = new Map();
export function painting(cardId) {
    if (!paintingCache.has(cardId)) {
        const card = CARDS[cardId];
        paintingCache.set(cardId, STYLES[card.artist](createRandom(cardId * 7919 + 13)));
    }
    return paintingCache.get(cardId);
}

// 画家を表す小さな絵（盤の欄などに使う。各画家の最初のカードの絵）
export function artistMark(artist, size = 18) {
    const first = CARDS.find(c => c.artist === artist).id;
    return `<svg class="amark" width="${size}" height="${Math.round(size * H / W)}" viewBox="0 0 ${W} ${H}" aria-hidden="true">${painting(first)}</svg>`;
}

// 競りの種類のしるし（線で描いたアイコン、24×24）
const TYPE_ICONS = {
    open: '<path d="M7 19V9M7 9l-3 3M7 9l3 3M17 19V5M17 5l-3 3M17 5l3 3"/>',
    once: '<path d="M19 12a7 7 0 1 1-2.05-4.95"/><path d="M19 4v4h-4"/>',
    sealed: '<rect x="4" y="7" width="16" height="11" rx="2"/><path d="M4 8l8 6 8-6"/>',
    fixed: '<path d="M3 12l9-9h8v8l-9 9z"/><circle cx="16" cy="8" r="1.4"/>',
    double: '<rect x="3" y="7" width="11" height="14" rx="1.5"/><rect x="9" y="3" width="11" height="14" rx="1.5"/>'
};
export const typeIcon = (type, cls = 'ticon') => `<svg class="${cls}" viewBox="0 0 24 24" aria-label="${TYPES[type].name}">${TYPE_ICONS[type]}</svg>`;

// カード（絵・画家の色の枠・競りの種類）
export function cardHtml(cardId, { cls = '', attrs = '' } = {}) {
    const card = CARDS[cardId];
    const artist = ARTISTS[card.artist];
    return `<div class="card ${cls}" style="--c:${artist.color};--d:${artist.deep}" data-card="${cardId}" ${attrs}>
        <svg class="paint" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice" aria-hidden="true">${painting(cardId)}</svg>
        <span class="ctype">${typeIcon(card.type)}</span>
        <span class="cname">${artist.short}</span>
    </div>`;
}

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>',
    log: '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6"/>'
};
export function symbolsSvg() {
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${Object.entries(ICONS).map(([id, art]) => `<symbol id="i-${id}" viewBox="0 0 24 24">${art}</symbol>`).join('')}</defs></svg>`;
}
