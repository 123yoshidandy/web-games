/**
 * 絵（すべて自作の SVG）。図柄は symbol としてページに一度だけ入れ、use で使い回す
 * 文明カード・建物・サイコロの描き方も、ここにまとめる（盤面・ダイアログ・遊び方で同じ見た目にする）
 */

import { CIV_CARDS, BUILDINGS, RESOURCES, RESOURCE_NAME, CULTURE_NAME, MULTIPLIER_NAME } from './cards.js';

const SYMBOLS = {
    food: `<g transform="rotate(-40 12 12)"><ellipse cx="12" cy="8.4" rx="6.2" ry="6.6" fill="#a8482a"/><ellipse cx="10.3" cy="6.6" rx="2.2" ry="2.8" fill="#d47a4c"/><rect x="10.7" y="13.5" width="2.6" height="5.5" fill="#f4ead2"/><circle cx="10.4" cy="19.8" r="1.9" fill="#f4ead2"/><circle cx="13.6" cy="19.8" r="1.9" fill="#f4ead2"/></g>`,
    wood: `<rect x="2.5" y="8" width="16" height="9" rx="2" fill="#8a5a33"/><path d="M5 11h9M6.5 14h8" stroke="#64401f" stroke-width="1.1" stroke-linecap="round"/><ellipse cx="18.5" cy="12.5" rx="3" ry="4.5" fill="#dfae72"/><ellipse cx="18.5" cy="12.5" rx="1.4" ry="2.2" fill="none" stroke="#8a5a33" stroke-width=".9"/>`,
    clay: `<path d="M3 10l4-3.2h14L17 10z" fill="#e8835a"/><path d="M17 10l4-3.2v7.4L17 17.4z" fill="#9c3f25"/><rect x="3" y="10" width="14" height="7.4" fill="#c4572f"/>`,
    stone: `<path d="M3.5 16.5l2-7.5 5.5-3.5 6.5 1 3.5 5.5-1 5.5-6.5 2-8-1.5z" fill="#8f979e"/><path d="M5.5 9l5.5-3.5 6.5 1-4.5 3.6z" fill="#cdd2d6"/><path d="M13 10.1l4.5-3.6 3.5 5.5-1 5.5z" fill="#6f777e"/>`,
    gold: `<path d="M3.5 15.5l3.5-6.5 7.5-2.5 5 4.5-1.2 5.5-8.8 2.2z" fill="#e2ad1d"/><path d="M7 9l7.5-2.5 5 4.5-6.5 1.2z" fill="#f8de75"/><path d="M13 12.2l6.5-1.2-1.2 5.5-6.5 1.5z" fill="#b07d0c"/>`,
    tool: `<g transform="rotate(35 12 12)"><rect x="10.8" y="7" width="2.6" height="15" rx="1.2" fill="#8a5a33"/><path d="M6 3.5h12l1.6 3.2L18 10H6L4.4 6.7z" fill="#9aa2a9"/><path d="M6 3.5h12l1.6 3.2H4.4z" fill="#c9ced3"/></g>`,
    agri: `<path d="M12 22V7" stroke="#a87a24" stroke-width="1.6" stroke-linecap="round"/><g fill="#e3b33d"><ellipse cx="12" cy="4.5" rx="1.6" ry="2.6"/><ellipse cx="9.4" cy="8" rx="1.5" ry="2.5" transform="rotate(-35 9.4 8)"/><ellipse cx="14.6" cy="8" rx="1.5" ry="2.5" transform="rotate(35 14.6 8)"/><ellipse cx="9.4" cy="12" rx="1.5" ry="2.5" transform="rotate(-35 9.4 12)"/><ellipse cx="14.6" cy="12" rx="1.5" ry="2.5" transform="rotate(35 14.6 12)"/><ellipse cx="9.4" cy="16" rx="1.5" ry="2.5" transform="rotate(-35 9.4 16)"/><ellipse cx="14.6" cy="16" rx="1.5" ry="2.5" transform="rotate(35 14.6 16)"/></g>`,
    person: `<circle cx="12" cy="5.6" r="3.4" fill="currentColor"/><path d="M5 21.5l1.8-6.6-3.3-1.6c-.9-.5-.6-1.8.4-1.9L8.6 10.5h6.8l4.7.9c1 .1 1.3 1.4.4 1.9l-3.3 1.6 1.8 6.6h-4.6L12 17.6l-2.4 3.9z" fill="currentColor"/>`,
    hut: `<path d="M4 12.5L12 5l8 7.5V21H4z" fill="#d3a35c"/><path d="M2.2 13.2L12 3.6l9.8 9.6" stroke="#6e4a22" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M7 15h2M15 15h2M7 18h2M15 18h2" stroke="#a87a3c" stroke-width="1"/><rect x="10" y="14.5" width="4" height="6.5" rx="1.5" fill="#5a3a1c"/>`,
    star: `<path d="M12 2.8l2.7 5.8 6.3.7-4.7 4.3 1.3 6.2L12 16.6l-5.6 3.2 1.3-6.2L3 9.3l6.3-.7z" fill="#f0c24b" stroke="#a3781c" stroke-width=".8" stroke-linejoin="round"/>`,
    card: `<rect x="5.5" y="3" width="13" height="18" rx="2" fill="#f3e6c6" stroke="#8a6d45" stroke-width="1.2"/><rect x="7.5" y="5" width="9" height="7" rx="1" fill="#8fbf6a"/><path d="M8 15h8M8 17.8h5" stroke="#8a6d45" stroke-width="1.2" stroke-linecap="round"/>`,
    any: `<rect x="3" y="3" width="8.4" height="8.4" rx="1.6" fill="#8a5a33"/><rect x="12.6" y="3" width="8.4" height="8.4" rx="1.6" fill="#c4572f"/><rect x="3" y="12.6" width="8.4" height="8.4" rx="1.6" fill="#8f979e"/><rect x="12.6" y="12.6" width="8.4" height="8.4" rx="1.6" fill="#e2ad1d"/>`,
    dice: `<rect x="3" y="3" width="18" height="18" rx="4" fill="#fbf6ea" stroke="#5b4630" stroke-width="1.3"/><g fill="#3a2a1a"><circle cx="8" cy="8" r="1.7"/><circle cx="16" cy="8" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="8" cy="16" r="1.7"/><circle cx="16" cy="16" r="1.7"/></g>`,
    // 文化（緑）
    healing: `<path d="M12 21V9" stroke="#2f5f2a" stroke-width="1.6" stroke-linecap="round"/><path d="M12 13c-5 0-7-3-7-7 4 0 7 2 7 7zM12 11c4.5 0 6.5-2.6 6.5-6.3-3.8 0-6.5 2-6.5 6.3zM12 17c3.6 0 5.5-1.8 5.5-4.6-3 0-5.5 1.5-5.5 4.6z" fill="#4f9a3e"/>`,
    art: `<circle cx="12" cy="4.8" r="2.6" fill="#7a4e2a"/><path d="M12 7.6c-3.4 0-5 3-4.4 6 .5 2.5 2 3.5 2 5.4L9.2 21.5h5.6l-.4-2.5c0-1.9 1.5-2.9 2-5.4.6-3-1-6-4.4-6z" fill="#a8693a"/><path d="M8.6 11.5c1.4 1.2 5.4 1.2 6.8 0" stroke="#7a4e2a" stroke-width="1" fill="none"/>`,
    writing: `<rect x="4.5" y="3" width="15" height="18" rx="2.5" fill="#c9a679"/><path d="M7.5 7.5l2 1.5-2 1.5M12 7.5v3M15 7.5l1.5 3M7.5 14h3M12 13l2 2.5M15.5 13.5v3M8 17.8h8" stroke="#6b4a26" stroke-width="1.3" stroke-linecap="round" fill="none"/>`,
    pottery: `<path d="M8.5 3.5h7v2.2c0 1 2.3 1.6 3.4 4.4 1.3 3.4-.2 8.3-3.3 10.4H8.4C5.3 18.4 3.8 13.5 5.1 10.1 6.2 7.3 8.5 6.7 8.5 5.7z" fill="#c4683c"/><path d="M5.6 11h12.8M5.8 14h12.4" stroke="#7f3d1d" stroke-width="1.2"/><rect x="8" y="2.5" width="8" height="1.8" rx=".8" fill="#9a4b25"/>`,
    time: `<path d="M3 17a9 9 0 0 1 18 0z" fill="#d8c08a"/><path d="M12 17V6.5M12 17L5 11M12 17l7-6M12 17L4 15M12 17l8-2" stroke="#7a5e2c" stroke-width="1.1" stroke-linecap="round"/><path d="M12 17l3.5-9.5" stroke="#3b2a12" stroke-width="2" stroke-linecap="round"/><rect x="2.5" y="17" width="19" height="2.6" rx="1" fill="#8a6d45"/>`,
    transport: `<circle cx="12" cy="12" r="8.6" fill="none" stroke="#7a5228" stroke-width="2.6"/><circle cx="12" cy="12" r="2.4" fill="#7a5228"/><path d="M12 3.4v17.2M3.4 12h17.2M5.9 5.9l12.2 12.2M18.1 5.9L5.9 18.1" stroke="#a8743c" stroke-width="1.6"/>`,
    music: `<rect x="5" y="6" width="14" height="13" rx="2" fill="#b06b38"/><ellipse cx="12" cy="6" rx="7" ry="2.6" fill="#ead2a2" stroke="#7a4824" stroke-width="1"/><path d="M5 10l14 5M5 15l14-5" stroke="#7a4824" stroke-width="1"/><path d="M15 2.5l4.5 5M9 2.5L4.5 7.5" stroke="#5a3a1c" stroke-width="1.6" stroke-linecap="round"/>`,
    weaving: `<rect x="3.5" y="3.5" width="17" height="17" rx="1.5" fill="#e6cf97"/><path d="M7 3.5v17M12 3.5v17M17 3.5v17" stroke="#8a5a33" stroke-width="1.6"/><path d="M3.5 8h17M3.5 12h17M3.5 16h17" stroke="#3f7f9a" stroke-width="2"/>`,
    // 倍率（砂色）の職業
    shaman: `<path d="M12 2.5c3 2.2 4.6 5.5 4 9.3-.4 2.6-2 4.6-4 6.4-2-1.8-3.6-3.8-4-6.4-.6-3.8 1-7.1 4-9.3z" fill="#7d4fa0"/><path d="M12 5v15" stroke="#4e2c69" stroke-width="1.2"/><path d="M12 9l2.5-1.5M12 12l3-1.5M12 9L9.5 7.5M12 12L9 10.5" stroke="#4e2c69" stroke-width="1"/>`,
    // 線のアイコン（stroke: currentColor）
    'i-home': `<path d="M3.5 11L12 4l8.5 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/>`,
    'i-log': `<path d="M8 6h12M8 12h12M8 18h12"/><circle cx="4" cy="6" r=".6"/><circle cx="4" cy="12" r=".6"/><circle cx="4" cy="18" r=".6"/>`,
    'i-help': `<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 1c0 1.8-2.5 2.2-2.5 3.9"/><circle cx="12" cy="17.3" r=".5"/>`,
    'i-cards': `<rect x="7" y="4" width="12" height="16" rx="2"/><path d="M5 7.5v11A2.5 2.5 0 0 0 7.5 21H15"/>`
};

export function symbolsSvg() {
    const body = Object.entries(SYMBOLS).map(([id, inner]) => `<symbol id="s-${id}" viewBox="0 0 24 24">${inner}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" style="position:absolute;width:0;height:0" aria-hidden="true">${body}</svg>`;
}

// 図柄1つ
export const sym = (name, cls = '') => `<svg class="sym ${cls}" aria-hidden="true"><use href="#s-${name}"/></svg>`;
// 線のアイコン
export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#s-i-${name}"/></svg>`;

// 職業の図柄（人＋もとになるものの小さな絵）
const MULT_BADGE = { farmer: 'agri', toolmaker: 'tool', builder: 'hut', shaman: 'shaman' };

export const multHtml = (kind, n) => `<span class="mult" title="${MULTIPLIER_NAME[kind]}">${Array.from({ length: n }, () => sym('person', 'who')).join('')}${sym(MULT_BADGE[kind], 'badge')}</span>`;

// 資源などの数（図柄＋数）
export const amountHtml = (name, n, cls = '') => `<span class="amt ${cls}">${sym(name)}<b>${n}</b></span>`;

// 文明カードの上半分
export function cardTopHtml(card) {
    const t = card.top;
    switch (t.kind) {
        case 'diceAll': return `<span class="top-row">${sym('dice')}${sym('dice')}${sym('dice')}</span><span class="cap">みんな</span>`;
        case 'food': return `<span class="top-row">${sym('food')}<b>${t.n}</b></span>`;
        case 'res': return `<span class="top-row">${sym(t.res)}${t.n > 1 ? `<b>${t.n}</b>` : ''}</span>`;
        case 'resDice': return `<span class="top-row">${sym('dice')}${sym('dice')}<i>→</i>${sym(t.res)}</span>`;
        case 'points': return `<span class="top-row">${sym('star')}<b>${t.n}</b></span>`;
        case 'tool': return `<span class="top-row">${sym('tool')}<b>+1</b></span>`;
        case 'agri': return `<span class="top-row">${sym('agri')}<b>+1</b></span>`;
        case 'extra': return `<span class="top-row">${sym('card')}<b>+1</b></span>`;
        case 'oneUse': return `<span class="top-row">${sym('tool')}<b>${t.n}</b></span><span class="cap">1回</span>`;
        case 'choice2': return `<span class="top-row">${sym('any')}<b>2</b></span>`;
        default: return '';
    }
}

export function cardBottomHtml(card) {
    const b = card.bottom;
    if (b.culture) return `${sym(b.culture, 'culture')}<span class="cap">${CULTURE_NAME[b.culture]}</span>`;
    return multHtml(b.mult, b.n);
}

// 文明カード。cost があれば、上に費用（資源の数）を出す
export function civCardHtml(id, { cls = '', attrs = '', cost = 0 } = {}) {
    const card = CIV_CARDS[id];
    const tone = card.bottom.culture ? 'green' : 'sand';
    const costHtml = cost ? `<span class="cost" aria-label="資源${cost}つ">${'<i></i>'.repeat(cost)}</span>` : '';
    return `<div class="civ ${tone} ${cls}" ${attrs}>${costHtml}<div class="civ-top">${cardTopHtml(card)}</div><div class="civ-bottom">${cardBottomHtml(card)}</div></div>`;
}

// 建物の費用と点
export function buildingFaceHtml(id) {
    const b = BUILDINGS[id];
    if (b.kind === 'fixed') {
        const cost = RESOURCES.flatMap(r => Array(b.cost[r] ?? 0).fill(r)).map(r => sym(r)).join('');
        return `<span class="pts">${b.points}</span><span class="bcost">${cost}</span>`;
    }
    if (b.kind === 'count') return `<span class="pts q">?</span><span class="bcost rule">${sym('any')}<b>${b.n}個</b><small>${b.kinds}種</small></span>`;
    return `<span class="pts q">?</span><span class="bcost rule">${sym('any')}<b>1〜7</b></span>`;
}

// 建物の説明の文
export function buildingText(id) {
    const b = BUILDINGS[id];
    if (b.kind === 'fixed') return `${RESOURCES.filter(r => b.cost[r]).map(r => `${RESOURCE_NAME[r]}${b.cost[r]}`).join('・')}で${b.points}点`;
    if (b.kind === 'count') return `資源${b.n}個を${b.kinds}種類で。値の合計が点`;
    return '資源1〜7個を好きに。値の合計が点';
}

// 文明カードの説明の文
export function cardText(id) {
    const card = CIV_CARDS[id];
    const t = card.top;
    const top = {
        diceAll: '人数分のサイコロを振り、取った人から1つずつ選ぶ（木・粘土・石・金・道具・畑）',
        food: `食料${t.n}`,
        res: `${RESOURCE_NAME[t.res]}${t.n ?? ''}`,
        resDice: `サイコロ2個で${RESOURCE_NAME[t.res]}`,
        points: `${t.n}点`,
        tool: '道具+1',
        agri: '畑+1',
        extra: '山の上のカード（終わりの得点だけ）',
        oneUse: `1回だけの道具${t.n}`,
        choice2: '好きな資源2つ（いつでも）'
    }[t.kind];
    const b = card.bottom;
    const bottom = b.culture ? `文化「${CULTURE_NAME[b.culture]}」` : `${MULTIPLIER_NAME[b.mult]}${b.n}人`;
    return `${top}／${bottom}`;
}

// サイコロ1つ（目の数の点）
const PIPS = {
    1: [[12, 12]], 2: [[8, 8], [16, 16]], 3: [[7.5, 7.5], [12, 12], [16.5, 16.5]],
    4: [[8, 8], [16, 8], [8, 16], [16, 16]], 5: [[8, 8], [16, 8], [12, 12], [8, 16], [16, 16]],
    6: [[8, 7], [16, 7], [8, 12], [16, 12], [8, 17], [16, 17]]
};
export function dieHtml(value, cls = '') {
    const pips = PIPS[value].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.9"/>`).join('');
    return `<svg class="die ${cls}" viewBox="0 0 24 24" aria-label="${value}"><rect x="1.5" y="1.5" width="21" height="21" rx="4.5" fill="#fbf6ea" stroke="#5b4630" stroke-width="1.2"/><g fill="#3a2a1a">${pips}</g></svg>`;
}

