/**
 * 絵（自作）：香辛料の粒・商人カード・得点カード・硬貨
 * カードの中身は、カードの幅に対する割合（cqw）で描くので、どの大きさでも同じ見た目になる
 */

import { MERCHANTS, POINT_CARDS, SPICE_NAMES } from './game.js';

export const cubeHtml = (color, cls = '') => `<i class="cube s${color} ${cls}" title="${SPICE_NAMES[color]}"></i>`;

// 色ごとの数を、粒の並びにする
export const cubesHtml = (spices, cls = '') => spices.flatMap((n, c) => Array.from({ length: n }, () => cubeHtml(c, cls))).join('');

const ARROW = '<svg class="arrow" viewBox="0 0 24 13" aria-hidden="true"><path d="M3 2.5 12 10.5 21 2.5"/></svg>';
const UP = '<svg class="up" viewBox="0 0 12 14" aria-hidden="true"><path d="M6 13V2M1.5 6.5 6 2l4.5 4.5"/></svg>';

// 商人カードの中身
function merchantBody(m) {
    if (m.kind === 'produce') return `<span class="m-row out">${cubesHtml(m.out)}</span>`;
    if (m.kind === 'upgrade') {
        return `<span class="m-row ups">${UP.repeat(m.upgrades)}</span><span class="m-label">格上げ×${m.upgrades}</span>`;
    }
    return `<span class="m-row in">${cubesHtml(m.in)}</span>${ARROW}<span class="m-row out">${cubesHtml(m.out)}</span>`;
}

const KIND_NAMES = { produce: '香辛料', trade: '交換', upgrade: '格上げ' };

export function merchantHtml(card, { cls = '', attrs = '' } = {}) {
    const m = MERCHANTS[card];
    const label = m.kind === 'trade' ? `交換：${spiceWords(m.in)}→${spiceWords(m.out)}` : m.kind === 'produce' ? `香辛料：${spiceWords(m.out)}` : `格上げ${m.upgrades}回`;
    return `<div class="mcard k-${m.kind} ${cls}" ${attrs} aria-label="${label}" title="${KIND_NAMES[m.kind]}">${merchantBody(m)}</div>`;
}

export function pointHtml(id, { cls = '', attrs = '', coin = null } = {}) {
    const card = POINT_CARDS[id];
    return `<div class="pcard ${cls}" ${attrs} aria-label="${card.points}点：${spiceWords(card.cost)}">
        <span class="p-points">${card.points}</span>${coin ? coinHtml(coin, 'on-card') : ''}
        <span class="p-cost">${cubesHtml(card.cost)}</span></div>`;
}

export const coinHtml = (kind, cls = '') => `<i class="coin ${kind} ${cls}" title="${kind === 'gold' ? '金貨（3点）' : '銀貨（1点）'}"></i>`;

export const spiceWords = (spices) => spices.map((n, c) => SPICE_NAMES[c].repeat(n)).join('') || 'なし';

// 色ごとの数の小さな札（「黄3」のように数で見せる）
export function countChipsHtml(spices, { cls = '', zero = true } = {}) {
    return spices.map((n, c) => (n === 0 && !zero ? '' : `<span class="chip s${c} ${n === 0 ? 'zero' : ''} ${cls}" data-color="${c}" title="${SPICE_NAMES[c]}${n}">${n}</span>`)).join('');
}
