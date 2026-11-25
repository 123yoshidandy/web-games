/**
 * カードの絵（自作の SVG）
 * 道のカードは、土の地に明るい坑道を描く。行き止まりは、坑道が真ん中の手前で岩にふさがれる
 * 道具（つるはし・ランプ・トロッコ）・地図・落盤の図柄は symbol としてページに一度だけ入れ、use で使い回す
 */

import { CARDS, START, GOAL_CARDS, rotateEdges, TOOL_NAMES } from './cards.js';

export const CARD_W = 40;
export const CARD_H = 56;

const ICONS = {
    pick: '<path d="M4 7c4.5-3.5 11.5-3.5 16 0-2.8-1-5.4-1.4-8-1.4S6.8 6 4 7z"/><path d="M11 6.5h2l-.4 14.3a.6.6 0 0 1-1.2 0z"/>',
    lamp: '<path d="M9 4h6v2.5H9z"/><path d="M8.5 7h7l1.5 3v7.5c0 1.4-2.2 2.5-5 2.5s-5-1.1-5-2.5V10z"/><path d="M10 11h4v5h-4z" fill="var(--glow, #ffe28a)"/><path d="M12 1.8a1.6 1.6 0 0 0-1.6 1.6h3.2A1.6 1.6 0 0 0 12 1.8z"/>',
    cart: '<path d="M3 8h18l-2 8H5z"/><circle cx="8" cy="18.5" r="2"/><circle cx="16" cy="18.5" r="2"/><path d="M6 7.5c1.5-2 4-2.8 6-2.3 1.8-1.7 4.6-1.3 6 1.1z" fill="var(--glow, #ffe28a)"/>',
    map: '<path d="M3 5.5 8.5 3.5l7 2 5.5-2v15l-5.5 2-7-2L3 20.5z"/><path d="M8.5 3.5v15M15.5 5.5v15" fill="none" stroke="var(--line, rgba(0,0,0,.35))" stroke-width="1"/><path d="M10.5 9.5l3 3M13.5 9.5l-3 3" fill="none" stroke="var(--mark, #c0392b)" stroke-width="1.6" stroke-linecap="round"/>',
    rockfall: '<path d="M3 20l3.5-6 4 2 3-5 4.5 4 3 5z"/><circle cx="8" cy="7" r="2.3"/><circle cx="15" cy="5" r="1.8"/><circle cx="12" cy="10" r="1.4"/>',
    gold: '<path d="M4 17l3-6h4l2 6zM11 17l3-6h4l2 6zM7.5 11l3-6h4l2 6z"/>',
    ladder: '<path d="M8 3v18M16 3v18M8 7h8M8 12h8M8 17h8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
    eye: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="12" cy="12" r="3"/>',
    digger: '<circle cx="12" cy="8" r="4"/><path d="M5 21c0-4 3.1-7 7-7s7 3 7 7z"/><path d="M7.5 6.5C8 3.5 16 3.5 16.5 6.5z" fill="var(--hat, #f2c14e)"/>',
    saboteur: '<circle cx="12" cy="8" r="4"/><path d="M5 21c0-4 3.1-7 7-7s7 3 7 7z"/><path d="M7.6 7.4h8.8v1.6H7.6z" fill="var(--mask, #1b1b1b)"/><path d="M7 5.5c.8-3 9.2-3 10 0z" fill="var(--hat, #6b4a9e)"/>'
};

export const symbolsSvg = () => `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${
    Object.entries(ICONS).map(([name, shape]) => `<symbol id="i-${name}" viewBox="0 0 24 24">${shape}</symbol>`).join('')
}</svg>`;

export const icon = (name, cls = '') => `<svg class="icon icon-${name} ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// 道具のアイコン。broken なら赤い斜線を重ねる
export const toolIcon = (tool, broken = false) => `<span class="tool ${broken ? 'broken' : ''}" title="${TOOL_NAMES[tool]}${broken ? '（壊れている）' : ''}">${icon(tool)}</span>`;

// 坑道の絵（道・スタート・ゴールに共通）。edges は4方向の開閉、connected は真ん中でつながるか
function tunnelSvg(edges, connected, extra = '') {
    const w = 12;
    const cx = CARD_W / 2;
    const cy = CARD_H / 2;
    const stub = connected ? 0 : 1;
    const parts = [];
    // 行き止まりは、坑道が真ん中の手前で止まる
    const stopN = connected ? cy : 15;
    const stopS = connected ? cy : CARD_H - 15;
    const stopE = connected ? cx : CARD_W - 11;
    const stopW = connected ? cx : 11;
    if (edges[0]) parts.push(`<rect x="${cx - w / 2}" y="0" width="${w}" height="${stopN + (stub ? 0 : w / 2)}"/>`);
    if (edges[2]) parts.push(`<rect x="${cx - w / 2}" y="${stopS - (stub ? 0 : w / 2)}" width="${w}" height="${CARD_H - stopS + (stub ? 0 : w / 2)}"/>`);
    if (edges[1]) parts.push(`<rect x="${stopE - (stub ? 0 : w / 2)}" y="${cy - w / 2}" width="${CARD_W - stopE + (stub ? 0 : w / 2)}" height="${w}"/>`);
    if (edges[3]) parts.push(`<rect x="0" y="${cy - w / 2}" width="${stopW + (stub ? 0 : w / 2)}" height="${w}"/>`);
    const rock = connected ? '' : `<circle cx="${cx}" cy="${cy}" r="6.5" class="rock"/><circle cx="${cx - 3}" cy="${cy - 2}" r="2" class="rock-light"/>`;
    return `<svg class="tunnel" viewBox="0 0 ${CARD_W} ${CARD_H}" aria-hidden="true"><rect class="earth" width="${CARD_W}" height="${CARD_H}" rx="3"/>
        <g class="way">${parts.join('')}</g>${rock}${extra}</svg>`;
}

// 道のカード
export function pathSvg(id, rotated = false) {
    const card = CARDS[id];
    return tunnelSvg(rotateEdges(card.edges, rotated), card.connected);
}

export const startSvg = () => tunnelSvg(START.edges, true, `<g transform="translate(${CARD_W / 2 - 9} ${CARD_H / 2 - 9}) scale(.75)" class="ladder"><use href="#i-ladder"/></g>`);

// ゴール。めくれていれば中身、伏せてあれば裏
export function goalSvg(goal) {
    if (!goal.revealed) {
        return `<svg class="tunnel goal-back" viewBox="0 0 ${CARD_W} ${CARD_H}" aria-hidden="true"><rect class="back" width="${CARD_W}" height="${CARD_H}" rx="3"/><text x="${CARD_W / 2}" y="${CARD_H / 2 + 7}" text-anchor="middle">?</text></svg>`;
    }
    const card = GOAL_CARDS[goal.card];
    const extra = card.gold
        ? `<g transform="translate(${CARD_W / 2 - 12} ${CARD_H / 2 - 12})" class="nugget"><use href="#i-gold"/></g>`
        : `<circle cx="${CARD_W / 2}" cy="${CARD_H / 2}" r="7" class="rock"/>`;
    return tunnelSvg(rotateEdges(card.edges, goal.rotated), true, extra);
}

// 手札のカード（道でもアクションでも）
export function handCardHtml(id, { cls = '', rotated = false } = {}) {
    const card = CARDS[id];
    if (card.kind === 'path') return `<div class="hcard path ${cls}" data-card="${id}" role="button" aria-label="道のカード">${pathSvg(id, rotated)}</div>`;
    let body;
    let label;
    if (card.kind === 'break') { body = `<span class="act-icons broken">${icon(card.tools[0])}</span>`; label = '壊す'; }
    else if (card.kind === 'repair') { body = `<span class="act-icons">${card.tools.map(t => icon(t)).join('')}</span>`; label = '直す'; }
    else if (card.kind === 'map') { body = `<span class="act-icons">${icon('map')}</span>`; label = '地図'; }
    else { body = `<span class="act-icons">${icon('rockfall')}</span>`; label = '落盤'; }
    return `<div class="hcard action a-${card.kind} ${cls}" data-card="${id}" role="button" aria-label="${label}">${body}<span class="act-name">${label}</span></div>`;
}
