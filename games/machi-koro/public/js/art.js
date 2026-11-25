/**
 * 絵（すべて自作の SVG。公式の画像は使っていない）
 * 施設とランドマークの図柄は symbol としてページに一度だけ入れ、use で使い回す（viewBox 48×48）
 * 線のアイコン（ホーム・遊び方など）は viewBox 24×24 で、色は currentColor
 */

import { ESTABLISHMENTS, LANDMARKS, rollText } from './cards.js';

// 図柄（48×48）
const ART = {
    wheat: `
        <path d="M24 44V14" stroke="#9a7a2c" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M15 44c2-8 5-12 9-14M33 44c-2-8-5-12-9-14" stroke="#9a7a2c" stroke-width="2" fill="none" stroke-linecap="round"/>
        ${[0, 1, 2, 3].map(i => `<ellipse cx="20" cy="${16 + i * 6}" rx="3.2" ry="4.6" transform="rotate(-28 20 ${16 + i * 6})" fill="#f2c443"/>
        <ellipse cx="28" cy="${16 + i * 6}" rx="3.2" ry="4.6" transform="rotate(28 28 ${16 + i * 6})" fill="#e8b22e"/>`).join('')}
        <ellipse cx="24" cy="10" rx="3" ry="5" fill="#f2c443"/>`,
    ranch: `
        <path d="M9 17c-4-1-6-5-4-7 3 0 6 2 7 4zM39 17c4-1 6-5 4-7-3 0-6 2-7 4z" fill="#f4f1ea" stroke="#3d3a36" stroke-width="1.5"/>
        <path d="M12 15c0-5 5-8 12-8s12 3 12 8v12c0 6-5 11-12 11s-12-5-12-11z" fill="#f8f6f1" stroke="#3d3a36" stroke-width="1.6"/>
        <path d="M14 13c3-1 6 1 6 4s-4 5-6 4zM31 22c3 0 5 2 4 5-2 0-4-2-4-5z" fill="#3d3a36"/>
        <circle cx="19" cy="22" r="1.8" fill="#3d3a36"/><circle cx="29" cy="22" r="1.8" fill="#3d3a36"/>
        <rect x="15" y="28" width="18" height="11" rx="5.5" fill="#f2a7a0" stroke="#3d3a36" stroke-width="1.4"/>
        <circle cx="21" cy="33.5" r="1.4" fill="#7a3b36"/><circle cx="27" cy="33.5" r="1.4" fill="#7a3b36"/>
        <path d="M16 7c-2-3-1-5 1-5M32 7c2-3 1-5-1-5" stroke="#c9a46b" stroke-width="2.4" fill="none" stroke-linecap="round"/>`,
    bakery: `
        <path d="M6 30c0-10 8-16 18-16s18 6 18 16v4c0 2-2 4-4 4H10c-2 0-4-2-4-4z" fill="#d7944a" stroke="#8a5523" stroke-width="1.6"/>
        <path d="M8 28c0-8 7-12 16-12s16 4 16 12" fill="#e9b06a"/>
        <path d="M15 20l4 7M23 18l3 8M31 20l2 7" stroke="#8a5523" stroke-width="2" stroke-linecap="round"/>`,
    cafe: `
        <path d="M10 20h24v10c0 7-5 12-12 12s-12-5-12-12z" fill="#fbf7ef" stroke="#6b4a2e" stroke-width="1.8"/>
        <path d="M34 23h3c3 0 5 2 5 5s-2 5-5 5h-4" fill="none" stroke="#6b4a2e" stroke-width="2.2"/>
        <rect x="12" y="20" width="20" height="4" fill="#7b4f2c"/>
        <path d="M5 43h34" stroke="#6b4a2e" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M17 15c-2-3 2-5 0-9M23 15c-2-3 2-5 0-9M29 15c-2-3 2-5 0-9" stroke="#b9c8d2" stroke-width="2" fill="none" stroke-linecap="round"/>`,
    store: `
        <rect x="8" y="20" width="32" height="22" fill="#f5f2ea" stroke="#3f5566" stroke-width="1.6"/>
        <path d="M5 12h38l-2 9H7z" fill="#3fa36a"/>
        <path d="M5 12h38" stroke="#2c7a4d" stroke-width="2"/>
        ${[0, 1, 2, 3].map(i => `<path d="M${7 + i * 9} 21c0 3 4 3 4.5 0c.5 3 4.5 3 4.5 0" fill="#fff"/>`).join('')}
        <rect x="12" y="26" width="10" height="16" fill="#8fc4e3" stroke="#3f5566" stroke-width="1.4"/>
        <rect x="26" y="26" width="10" height="8" fill="#8fc4e3" stroke="#3f5566" stroke-width="1.4"/>
        <circle cx="20" cy="34" r="1" fill="#3f5566"/>`,
    forest: `
        <rect x="14" y="34" width="4" height="9" fill="#7a5130"/>
        <rect x="30" y="32" width="4" height="11" fill="#7a5130"/>
        <path d="M16 6l10 16h-5l7 12H4l7-12H6z" fill="#3e9a55"/>
        <path d="M32 8l9 14h-4l6 11H21l6-11h-4z" fill="#2f7e45"/>`,
    stadium: `
        <ellipse cx="24" cy="28" rx="21" ry="12" fill="#9b6fc4" stroke="#5d3b80" stroke-width="1.6"/>
        <ellipse cx="24" cy="27" rx="15" ry="7.5" fill="#62b36b" stroke="#fff" stroke-width="1.2"/>
        <path d="M24 19.5v15" stroke="#fff" stroke-width="1"/><circle cx="24" cy="27" r="2.6" fill="none" stroke="#fff" stroke-width="1"/>
        <path d="M6 13v6M42 13v6" stroke="#5d3b80" stroke-width="2"/><circle cx="6" cy="11" r="2.6" fill="#ffe27a"/><circle cx="42" cy="11" r="2.6" fill="#ffe27a"/>`,
    tv: `
        <path d="M24 4v10" stroke="#5d3b80" stroke-width="2.4"/>
        <path d="M16 4c3 2 13 2 16 0" stroke="#5d3b80" stroke-width="1.6" fill="none"/>
        <circle cx="24" cy="4" r="2.4" fill="#ef6b6b"/>
        <rect x="7" y="14" width="34" height="24" rx="4" fill="#5d3b80"/>
        <rect x="11" y="18" width="26" height="16" rx="2" fill="#a8d8f0"/>
        <path d="M11 30l7-7 5 5 4-4 10 10H11z" fill="#6ab07a"/>
        <path d="M15 38l-3 6M33 38l3 6" stroke="#5d3b80" stroke-width="2.4" stroke-linecap="round"/>`,
    business: `
        <rect x="12" y="6" width="18" height="38" fill="#7b5aa6" stroke="#4b3170" stroke-width="1.6"/>
        <rect x="30" y="18" width="10" height="26" fill="#9a7cc4" stroke="#4b3170" stroke-width="1.6"/>
        ${[0, 1, 2, 3, 4, 5].map(r => [0, 1, 2].map(c => `<rect x="${15 + c * 5}" y="${10 + r * 5.4}" width="3" height="3.4" fill="#ffe7a0"/>`).join('')).join('')}
        ${[0, 1, 2, 3].map(r => `<rect x="33" y="${22 + r * 5}" width="4" height="3" fill="#ffe7a0"/>`).join('')}
        <path d="M4 44h40" stroke="#4b3170" stroke-width="2.4" stroke-linecap="round"/>`,
    cheese: `
        <path d="M5 30l30-16 8 6v16H5z" fill="#f6cd4c" stroke="#b5871f" stroke-width="1.6"/>
        <path d="M5 30h38" stroke="#b5871f" stroke-width="1.6"/>
        <path d="M35 14l8 6" stroke="#b5871f" stroke-width="1.6"/>
        <circle cx="14" cy="36" r="2.6" fill="#d9a62a"/><circle cx="27" cy="34" r="1.8" fill="#d9a62a"/><circle cx="35" cy="38" r="2.2" fill="#d9a62a"/>
        <circle cx="26" cy="23" r="2" fill="#d9a62a"/>`,
    furniture: `
        <path d="M10 12c0-3 2-5 5-5h18c3 0 5 2 5 5v14H10z" fill="#c4874c" stroke="#7a4c22" stroke-width="1.6"/>
        <rect x="5" y="24" width="38" height="10" rx="4" fill="#d99a5c" stroke="#7a4c22" stroke-width="1.6"/>
        <rect x="4" y="20" width="7" height="16" rx="3" fill="#b9773d" stroke="#7a4c22" stroke-width="1.4"/>
        <rect x="37" y="20" width="7" height="16" rx="3" fill="#b9773d" stroke="#7a4c22" stroke-width="1.4"/>
        <path d="M9 36v6M39 36v6" stroke="#7a4c22" stroke-width="2.6" stroke-linecap="round"/>`,
    mine: `
        <path d="M2 42l15-26 9 12 6-8 14 22z" fill="#8a8f98" stroke="#555a63" stroke-width="1.6"/>
        <path d="M13 42c0-6 5-11 11-11s11 5 11 11z" fill="#3b3f46"/>
        <path d="M15 40c0-5 4-8 9-8s9 3 9 8" fill="none" stroke="#a3713f" stroke-width="2.4"/>
        <circle cx="31" cy="24" r="2" fill="#f3d36b"/><circle cx="12" cy="30" r="1.6" fill="#f3d36b"/>`,
    family: `
        <circle cx="24" cy="27" r="15" fill="#fbf7ef" stroke="#a9443c" stroke-width="1.8"/>
        <circle cx="24" cy="27" r="9" fill="none" stroke="#e3d3c2" stroke-width="1.4"/>
        <path d="M5 10v10c0 2 1 3 3 3v18M5 10v7M8 10v7M11 10v10c0 2-1 3-3 3" stroke="#6c7680" stroke-width="1.8" fill="none" stroke-linecap="round"/>
        <path d="M41 9c-4 2-4 10-1 14v18" stroke="#6c7680" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path d="M18 27c1-4 4-6 7-5s5 4 4 7-5 4-8 2" fill="#d9663f"/>`,
    apple: `
        <path d="M24 14c-5-4-14-3-16 6-2 9 4 22 11 22 3 0 3-1 5-1s2 1 5 1c7 0 13-13 11-22-2-9-11-10-16-6z" fill="#e2463c" stroke="#9c2a23" stroke-width="1.6"/>
        <path d="M24 14c0-4 1-8 4-10" stroke="#6b4a2e" stroke-width="2.2" fill="none" stroke-linecap="round"/>
        <path d="M26 9c4-5 10-4 12-2-3 4-9 5-12 2z" fill="#4da35a"/>
        <ellipse cx="15" cy="23" rx="2.4" ry="4" fill="#f59a8f" transform="rotate(20 15 23)"/>`,
    market: `
        <path d="M5 24h38l-4 18H9z" fill="#c98f52" stroke="#7a4c22" stroke-width="1.6"/>
        <path d="M8 32h32M10 38h28" stroke="#7a4c22" stroke-width="1.4"/>
        <circle cx="15" cy="20" r="6" fill="#e2463c"/><circle cx="34" cy="20" r="6" fill="#f2a43a"/>
        <path d="M22 26l3-16 4 2z" fill="#f08a2c"/>
        <path d="M25 10c-1-3 1-5 3-6M26 11c2-2 5-2 6-1" stroke="#4da35a" stroke-width="2" fill="none" stroke-linecap="round"/>
        <path d="M15 14c0-2 1-3 2-4" stroke="#4da35a" stroke-width="2" stroke-linecap="round"/>`,
    station: `
        <rect x="9" y="8" width="30" height="30" rx="7" fill="#e9a43a" stroke="#8c5a14" stroke-width="1.6"/>
        <rect x="13" y="12" width="22" height="11" rx="2" fill="#bfe4f6"/>
        <circle cx="16" cy="30" r="2.6" fill="#fff6d0"/><circle cx="32" cy="30" r="2.6" fill="#fff6d0"/>
        <path d="M14 38l-4 6M34 38l4 6" stroke="#5d4a34" stroke-width="2.4" stroke-linecap="round"/>
        <path d="M4 44h40" stroke="#5d4a34" stroke-width="2.4" stroke-linecap="round"/>`,
    mall: `
        <rect x="4" y="18" width="40" height="24" fill="#f7efe0" stroke="#8c5a14" stroke-width="1.6"/>
        <path d="M2 18l6-10h32l6 10z" fill="#e9a43a" stroke="#8c5a14" stroke-width="1.6"/>
        <rect x="18" y="28" width="12" height="14" fill="#8fc4e3" stroke="#8c5a14" stroke-width="1.4"/>
        <rect x="8" y="23" width="7" height="7" fill="#8fc4e3"/><rect x="33" y="23" width="7" height="7" fill="#8fc4e3"/>
        <path d="M17 13h14" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/>`,
    park: `
        <circle cx="24" cy="21" r="16" fill="none" stroke="#e9a43a" stroke-width="2.6"/>
        ${[0, 1, 2, 3, 4, 5, 6, 7].map(i => {
            const a = i * Math.PI / 4;
            const x = (24 + Math.cos(a) * 16).toFixed(1);
            const y = (21 + Math.sin(a) * 16).toFixed(1);
            const colors = ['#e2463c', '#3fa36a', '#4a8fd9', '#f2c443'];
            return `<path d="M24 21L${x} ${y}" stroke="#c9862a" stroke-width="1.2"/><circle cx="${x}" cy="${y}" r="3.2" fill="${colors[i % 4]}"/>`;
        }).join('')}
        <circle cx="24" cy="21" r="3" fill="#c9862a"/>
        <path d="M24 21l-9 23M24 21l9 23M10 44h28" stroke="#8c5a14" stroke-width="2.4" stroke-linecap="round"/>`,
    tower: `
        <path d="M24 9L14 44M24 9l10 35M17 33h14M19.5 24h9M15.5 40l13-7M32.5 40l-13-7M18 33l10-9M30 33l-10-9" stroke="#d0532f" stroke-width="2" fill="none" stroke-linecap="round"/>
        <circle cx="24" cy="7" r="3" fill="#e9a43a"/>
        <path d="M14 5c-3 3-3 7 0 10M34 5c3 3 3 7 0 10M10 2c-5 5-5 13 0 18M38 2c5 5 5 13 0 18" stroke="#e9a43a" stroke-width="1.8" fill="none" stroke-linecap="round"/>`
};

// 線のアイコン（24×24）
const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    log: '<path d="M5 6h14M5 12h14M5 18h9"/>'
};

export function symbolsSvg() {
    const art = Object.entries(ART).map(([key, body]) => `<symbol id="a-${key}" viewBox="0 0 48 48">${body}</symbol>`).join('');
    const icons = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${art}${icons}</defs></svg>`;
}

export const artSvg = (key, cls = 'art') => `<svg class="${cls}" viewBox="0 0 48 48" aria-hidden="true"><use href="#a-${key}"/></svg>`;
export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// コイン（数字入り）
export const coinHtml = (value, cls = '') => `<span class="coin ${cls}">${value}</span>`;

// サイコロの目（3×3 の点）
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export const dieHtml = (face) => `<span class="die" aria-label="${face}">${Array.from({ length: 9 }, (_, i) => `<i${PIPS[face]?.includes(i) ? ' class="on"' : ''}></i>`).join('')}</span>`;

// 長い名前は、決まった位置でだけ折り返す
const nameHtml = (name) => name.replace('ビジネスセンター', 'ビジネス<wbr>センター');

// 市場のカード（施設）
export function cardHtml(key, { stock = null, count = null, cls = '' } = {}) {
    const card = ESTABLISHMENTS[key];
    return `<div class="card ${card.color} ${cls}" data-card="${key}">
        <div class="band">${rollText(key)}</div>
        ${artSvg(key)}
        <div class="name">${nameHtml(card.name)}</div>
        <div class="foot">${coinHtml(card.cost)}${stock !== null ? `<span class="stock">${stock ? `×${stock}` : '売切'}</span>` : ''}</div>
        ${count ? `<span class="count">${count}</span>` : ''}
    </div>`;
}

// 街の施設（小さな札）
export function chipHtml(key, count) {
    const card = ESTABLISHMENTS[key];
    return `<div class="chip ${card.color}" data-card="${key}" title="${card.name}">
        <span class="roll">${rollText(key)}</span>${artSvg(key)}${count > 1 ? `<span class="count">${count}</span>` : ''}
    </div>`;
}

// ランドマーク
export function landmarkHtml(key, built, { cls = '' } = {}) {
    const lm = LANDMARKS[key];
    return `<div class="landmark ${built ? 'built' : ''} ${cls}" data-card="${key}" title="${lm.name}">
        ${artSvg(key)}${built ? '' : coinHtml(lm.cost)}
    </div>`;
}
