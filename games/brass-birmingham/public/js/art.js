/**
 * 色と産業の印（地図と手札・ボードで同じものを使う）
 */

import { INDUSTRIES } from './data.js';

export const INDUSTRY_COLORS = {
    cotton: '#efe2c2',
    manufacturer: '#8ea4bd',
    pottery: '#c98a5e',
    coal: '#3a3836',
    iron: '#e07b39',
    brewery: '#b98a3c'
};

// 印の上の文字の色（背景が暗いものは白）
export const INDUSTRY_TEXT = {
    cotton: '#4a3b1d',
    manufacturer: '#14243a',
    pottery: '#3a1c08',
    coal: '#f2efe9',
    iron: '#2a1305',
    brewery: '#2a1a03'
};

const NS = 'http://www.w3.org/2000/svg';

// 地図のタイルの上の産業の文字
export function industryIcon(industry, cx, cy, color) {
    const text = document.createElementNS(NS, 'text');
    text.setAttribute('x', cx);
    text.setAttribute('y', cy + 5);
    text.setAttribute('class', 'tile-ind');
    text.setAttribute('fill', color);
    text.textContent = INDUSTRIES[industry].short;
    return text;
}

// 手札・ボードで使う、産業の小さな札（HTML）
export const industryBadge = (industry) =>
    `<span class="ind-badge" style="background:${INDUSTRY_COLORS[industry]};color:${INDUSTRY_TEXT[industry]}">${INDUSTRIES[industry].short}</span>`;
