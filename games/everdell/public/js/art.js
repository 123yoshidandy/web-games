/**
 * 図柄（資源・点・ワーカー）とカードの描き方
 * 図柄は SVG の symbol にまとめ、use で使い回す
 */

import { CARDS, RESOURCES, RESOURCE_NAMES, TYPES } from './cards.js';

export const PLAYER_COLORS = ['#e2a23b', '#4f8fd6', '#d0566e', '#5aa36b'];

export function symbolsSvg() {
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
        <symbol id="i-twig" viewBox="0 0 20 20"><path d="M4 16.5 16 4.5M9.5 11l3.6 3.8M7 13.5 4.8 10" fill="none" stroke="#9a6532" stroke-width="2.6" stroke-linecap="round"/></symbol>
        <symbol id="i-resin" viewBox="0 0 20 20"><path d="M10 2.5c3.2 4.6 5.2 7.6 5.2 10.2a5.2 5.2 0 0 1-10.4 0C4.8 10.1 6.8 7.1 10 2.5Z" fill="#e59a2b"/><path d="M8 13.2a2.4 2.4 0 0 0 1.5 2.3" stroke="#fff3cf" stroke-width="1.4" fill="none" stroke-linecap="round"/></symbol>
        <symbol id="i-pebble" viewBox="0 0 20 20"><path d="M3.5 12.5c0-4 3.2-6.5 7-6.5 3.9 0 6 2.5 6 5.6 0 3-2.8 4.9-6.6 4.9-3.9 0-6.4-1.3-6.4-4Z" fill="#9aa3ad"/><path d="M7.5 9.3c1-.8 2.2-1.1 3.4-1" stroke="#dfe5ea" stroke-width="1.4" fill="none" stroke-linecap="round"/></symbol>
        <symbol id="i-berry" viewBox="0 0 20 20"><circle cx="10" cy="11.5" r="6" fill="#8a3f9e"/><circle cx="8" cy="9.5" r="1.5" fill="#d9a8e6"/><path d="M10 5.6c.4-1.8 1.8-2.8 3.6-2.9-.3 1.6-1.6 2.7-3.6 2.9Z" fill="#5aa04a"/></symbol>
        <symbol id="i-point" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7.5" fill="#e9c349"/><circle cx="10" cy="10" r="5" fill="none" stroke="#a9822a" stroke-width="1.4"/></symbol>
        <symbol id="i-card" viewBox="0 0 20 20"><rect x="5" y="3" width="10.5" height="14" rx="2" fill="#f4ead2" stroke="#7d6a4c" stroke-width="1.4"/><path d="M7.8 7.5h5M7.8 10h5" stroke="#b4a283" stroke-width="1.2"/></symbol>
        <symbol id="i-worker" viewBox="0 0 20 20"><circle cx="10" cy="6" r="3.4"/><path d="M4.2 17.5c0-4.4 2.6-7.2 5.8-7.2s5.8 2.8 5.8 7.2Z"/></symbol>
    </svg>`;
}

export const icon = (name, cls = '') => `<svg class="ic ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

export function workerIcon(seat, cls = '') {
    return `<svg class="ic worker ${cls}" style="fill:${PLAYER_COLORS[seat]}" aria-hidden="true"><use href="#i-worker"/></svg>`;
}

// 資源の並び（例：小枝2・樹脂1 → 図柄と数）
export function resHtml(res, { zero = false } = {}) {
    const parts = RESOURCES.filter(r => zero || res[r] > 0)
        .map(r => `<span class="res" title="${RESOURCE_NAMES[r]}">${icon(r)}<b>${res[r] ?? 0}</b></span>`);
    return parts.join('');
}

export function costHtml(cost) {
    const parts = RESOURCES.filter(r => cost[r] > 0).map(r => `<span class="res">${icon(r)}<b>${cost[r]}</b></span>`);
    return parts.length ? parts.join('') : '<span class="free">0</span>';
}

// カード（小さい札）。opts: { cls, data, badge, note, foot }（foot を渡すと、費用の代わりに下の段に出す）
export function cardHtml(id, opts = {}) {
    const def = CARDS[id];
    const attrs = Object.entries(opts.data ?? {}).map(([k, v]) => `data-${k}="${v}"`).join(' ');
    const pts = `<span class="c-pts">${def.points}</span>`;
    return `<button class="card t-${def.type} ${def.kind} ${opts.cls ?? ''}" ${attrs} type="button">
        <span class="c-head"><span class="c-name">${def.name}</span>${pts}</span>
        <span class="c-foot">${opts.foot ?? `<span class="c-cost">${costHtml(def.cost)}</span>`}${opts.badge ?? ''}</span>
        ${opts.note ? `<span class="c-note">${opts.note}</span>` : ''}
    </button>`;
}

// カードの説明（大きい札）
export function cardDetailHtml(id) {
    const def = CARDS[id];
    const kind = def.kind === 'construction' ? '建造物' : '住民';
    const pair = def.kind === 'construction'
        ? (def.pairs[0] === '*' ? 'どの住民でも1回無料で出せる' : `${def.pairs.map(p => CARDS[p].name).join('・')}を1回無料で出せる`)
        : `${CARDS[def.occupies].name}があれば無料で出せる`;
    return `<div class="big-card t-${def.type}">
        <div class="bc-head"><span class="bc-name">${def.name}</span><span class="bc-pts">${icon('point')}${def.points}点</span></div>
        <div class="bc-tags"><span class="tag t-${def.type}">${TYPES[def.type].long}</span><span class="tag">${kind}</span><span class="tag">${def.unique ? 'ユニーク' : 'ふつう'}</span></div>
        <div class="bc-cost">費用 ${costHtml(def.cost)}</div>
        <p class="bc-text">${def.text}</p>
        <p class="bc-pair">${pair}</p>
    </div>`;
}

export const typeChip = (type) => `<span class="type-chip t-${type}">${TYPES[type].name}</span>`;
