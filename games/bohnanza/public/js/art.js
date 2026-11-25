/**
 * 絵（すべて自作の SVG）。豆は形と色と模様で描き分ける。カード・畑・小さな札の描き方もここにまとめる
 */

import { BEANS, coinsFor } from './cards.js';

// 豆の形（そら豆の形）と、種類ごとの模様
const BEAN_PATH = 'M7.2 4.2c3.5-1.7 8.3-.6 10.2 2.7 1.6 2.8.9 5.6-.8 7.2-1.2 1.1-1.4 2.6-.6 4.1.9 1.8-.5 3.9-3.3 4-4.7.2-9-3.3-9.6-8.3C2.6 9.4 4.2 5.6 7.2 4.2z';
const MARK = {
    coffee: '<path d="M10 6.5c2.8 2.6 3 8.8-.5 13.5" stroke="#2d1a0e" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
    wax: '<path d="M8 8.5c2-1 4.5-1 6.5.5" stroke="#b39a2a" stroke-width="1" fill="none" stroke-linecap="round"/>',
    blue: '<circle cx="9" cy="9" r="1.2" fill="#9cc0ef"/><circle cx="13" cy="13" r="1" fill="#9cc0ef"/><circle cx="9" cy="15.5" r=".9" fill="#9cc0ef"/>',
    chili: '<path d="M15.5 5.5c1.2-1.6 2.6-2 3.6-1.6" stroke="#3f7d2a" stroke-width="1.6" fill="none" stroke-linecap="round"/><path d="M8.5 9c1.5 2 1.6 4.5.6 7" stroke="#f28a6d" stroke-width="1" fill="none" stroke-linecap="round"/>',
    stink: '<path d="M18 4.5c1 1-1 2 0 3s-1 2 0 3M20.5 6c1 1-1 2 0 3" stroke="#6f7230" stroke-width="1" fill="none" stroke-linecap="round"/>',
    green: '<path d="M8 8.5c2 3 2.5 6 1 10" stroke="#2d6e31" stroke-width="1.2" fill="none" stroke-linecap="round"/>',
    soy: '<circle cx="9.5" cy="10" r="1.4" fill="#b59a5c"/><circle cx="12.5" cy="14.5" r="1.4" fill="#b59a5c"/>',
    blackEyed: '<ellipse cx="11.5" cy="12.2" rx="2.4" ry="1.7" fill="#1e1a17"/><ellipse cx="11.5" cy="12.2" rx="1" ry=".6" fill="#efe7d2"/>',
    red: '<path d="M8 8.5c1.4-1 3.3-1.2 4.8-.4" stroke="#e46a72" stroke-width="1.1" fill="none" stroke-linecap="round"/>',
    garden: '<path d="M14 4.5c1.8-2.2 4.4-2.4 6-1.2-1.6 2.2-4 2.6-6 1.2z" fill="#3f8a2e"/><path d="M8.5 9.5c1 2.5 1 5 0 7.5" stroke="#5d9a35" stroke-width="1" fill="none"/>',
    cocoa: '<path d="M7.5 8c2-1.2 5-1.2 7 0M7 12c2.2-1.2 5.6-1.2 7.8 0M7.5 16c2-1.2 5-1.2 7 0" stroke="#7a4a2c" stroke-width="1" fill="none" stroke-linecap="round"/>'
};

export function symbolsSvg() {
    const beans = Object.entries(BEANS).map(([t, b]) => `<symbol id="s-${t}" viewBox="0 0 24 24"><path d="${BEAN_PATH}" fill="${b.color}" stroke="rgba(0,0,0,.35)" stroke-width=".8"/><path d="M8 6.2c2-1 4.3-.9 6 .2" stroke="rgba(255,255,255,.55)" stroke-width="1.3" fill="none" stroke-linecap="round"/>${MARK[t]}</symbol>`).join('');
    const extra = {
        coin: '<circle cx="12" cy="12" r="9" fill="#e9b949" stroke="#9a7120" stroke-width="1.4"/><circle cx="12" cy="12" r="6" fill="none" stroke="#b8861f" stroke-width="1.2"/><path d="M12 8.5v7" stroke="#9a7120" stroke-width="1.6" stroke-linecap="round"/>',
        card: '<rect x="6" y="3" width="12" height="18" rx="2" fill="#f3ead2" stroke="#8a6d45" stroke-width="1.2"/><path d="M9 9h6M9 12h6M9 15h4" stroke="#b9a273" stroke-width="1.2" stroke-linecap="round"/>',
        field: '<path d="M3 17h18" stroke="#6a4527" stroke-width="2"/><path d="M5 14c2-1 4-1 6 0s4 1 6 0 3-1 4 0" stroke="#8a5a33" stroke-width="1.6" fill="none"/><path d="M12 13V6M12 8c-2-.5-3-2-3-3.5M12 7c2-.5 3-2 3-3.5" stroke="#4f9a3e" stroke-width="1.4" fill="none" stroke-linecap="round"/>',
        'i-home': '<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>',
        'i-log': '<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/>',
        'i-help': '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2.2-2.5 3.9"/><circle cx="12" cy="17.3" r=".5"/>'
    };
    const rest = Object.entries(extra).map(([id, inner]) => `<symbol id="s-${id}" viewBox="0 0 24 24">${inner}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0" aria-hidden="true">${beans}${rest}</svg>`;
}

export const sym = (name, cls = '') => `<svg class="sym ${cls}" aria-hidden="true"><use href="#s-${name}"/></svg>`;
export const amountHtml = (name, n, cls = '') => `<span class="amt ${cls}">${sym(name)}<b>${n}</b></span>`;

// 豆のカード（名前と枚数の表つき）。opts：{ cls, attrs, mini }
export function beanCard(type, { cls = '', attrs = '', table = true } = {}) {
    const b = BEANS[type];
    const steps = table ? `<span class="steps">${b.steps.map((s, i) => (s === null ? '' : `<i>${s}<small>→${i + 1}</small></i>`)).join('')}</span>` : '';
    return `<div class="bean ${cls}" style="--bc:${b.color}" ${attrs}>${sym(type, 'bean-art')}<span class="bname">${b.name}</span>${steps}</div>`;
}

// 畑の豆（種類・枚数・今売ったときの金）
export function fieldHtml(field) {
    if (!field) return '';
    return `${sym(field.type, 'field-art')}<span class="fcount">${field.n}</span><span class="fname">${BEANS[field.type].name}</span><span class="fcoins">${sym('coin')}${coinsFor(field.type, field.n)}</span>`;
}
