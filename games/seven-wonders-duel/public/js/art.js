/**
 * 絵（すべて自作の SVG）
 * 図柄は symbol としてページに一度だけ入れ、use で使い回す
 * カード・七不思議・進歩トークンの描き方は、盤・説明・結果のどこでもこの関数を使う
 */

import { CARDS, WONDERS, TOKENS, RESOURCES, RESOURCE_NAMES, SCIENCE_NAMES, COLOR_NAMES } from './cards.js';

const S = (id, body, viewBox = '0 0 24 24') => `<symbol id="${id}" viewBox="${viewBox}">${body}</symbol>`;
// 線で描く図柄（色は currentColor）
const L = (id, body) => S(id, `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g>`);

export function symbolsSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
${S('i-wood', '<rect x="2.5" y="7.5" width="16" height="9" rx="2" fill="#8a5a2b"/><ellipse cx="18.5" cy="12" rx="3.4" ry="4.5" fill="#d8a96a" stroke="#6b4220" stroke-width="1.2"/><ellipse cx="18.5" cy="12" rx="1.3" ry="1.8" fill="none" stroke="#9b6a35"/><path d="M5 10h8M6 14h9" stroke="#6b4220" stroke-width="1"/>')}
${S('i-clay', '<rect x="2.5" y="12.5" width="9" height="6" rx="1" fill="#c8643a"/><rect x="12.5" y="12.5" width="9" height="6" rx="1" fill="#c8643a"/><rect x="7.5" y="6" width="9" height="6" rx="1" fill="#de7e4f"/><path d="M2.5 15.5h19" stroke="#963f1f" stroke-width=".8"/>')}
${S('i-stone', '<path d="M3 18l2.5-8 5-4 6 1.5 4.5 6-1.5 4.5z" fill="#9aa2a8" stroke="#5d656b" stroke-width="1.2" stroke-linejoin="round"/><path d="M10.5 6l-1 6 5.5 2.5M9.5 12l-4.5 1" fill="none" stroke="#6d757b" stroke-width="1"/>')}
${S('i-glass', '<path d="M9.5 3h5v4.5l4 9a3 3 0 0 1-2.7 4.5H8.2a3 3 0 0 1-2.7-4.5l4-9z" fill="#7fd0e6" stroke="#2c7d96" stroke-width="1.3" stroke-linejoin="round"/><path d="M7 15h10" stroke="#2c7d96" stroke-width="1"/><rect x="9" y="2" width="6" height="2" rx="1" fill="#2c7d96"/>')}
${S('i-papyrus', '<rect x="5" y="4" width="14" height="16" rx="1.5" fill="#efe1b0" stroke="#8c7440" stroke-width="1.2"/><rect x="3" y="3" width="18" height="3" rx="1.5" fill="#d9c487" stroke="#8c7440" stroke-width="1"/><rect x="3" y="18" width="18" height="3" rx="1.5" fill="#d9c487" stroke="#8c7440" stroke-width="1"/><path d="M8 10h8M8 13h6" stroke="#8c7440" stroke-width="1"/>')}
${S('i-coin', '<circle cx="12" cy="12" r="10" fill="#f1c94a" stroke="#a37c12" stroke-width="1.5"/><circle cx="12" cy="12" r="7" fill="none" stroke="#c9a031" stroke-width="1"/>')}
${S('i-vp', '<circle cx="12" cy="12" r="10.5" fill="#2f8a3f" stroke="#e9f3dc" stroke-width="1.4"/><g fill="#8fcf86"><ellipse cx="5.2" cy="12" rx="1.1" ry="2.4"/><ellipse cx="18.8" cy="12" rx="1.1" ry="2.4"/><ellipse cx="6.6" cy="16.6" rx="1.1" ry="2.2" transform="rotate(-45 6.6 16.6)"/><ellipse cx="17.4" cy="16.6" rx="1.1" ry="2.2" transform="rotate(45 17.4 16.6)"/></g>')}
${S('i-shield', '<path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z" fill="#d23c2e" stroke="#7d1b12" stroke-width="1.3" stroke-linejoin="round"/><path d="M12 5.5v13M7 10h10" stroke="#f6d27a" stroke-width="1.6"/>')}
${S('i-replay', '<path d="M19 12a7 7 0 1 1-2.1-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/><path d="M19.5 3.5v5h-5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>')}
${S('i-wonder', '<path d="M2 20h20L12 4z" fill="#e6c36a" stroke="#8a6a1c" stroke-width="1.2" stroke-linejoin="round"/><path d="M6.5 13.5h11M4.5 17h15M9 9.5h6" stroke="#8a6a1c" stroke-width="1"/>')}
${L('s-globe', '<circle cx="12" cy="12" r="7"/><ellipse cx="12" cy="12" rx="3" ry="7"/><path d="M5 12h14"/><path d="M12 19v3M8 22h8"/>')}
${L('s-wheel', '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2"/><path d="M12 3.5v6.5M12 14v6.5M3.5 12H10M14 12h6.5M6 6l4.6 4.6M13.4 13.4L18 18M18 6l-4.6 4.6M10.6 13.4L6 18"/>')}
${L('s-sundial', '<path d="M3 17h18"/><path d="M6 17A6 6 0 0 1 18 17"/><path d="M12 17L8 6"/><path d="M12 11v-1M15.5 12.5l.7-.7M8.5 12.5l-.7-.7"/>')}
${L('s-mortar', '<path d="M4 11h16l-2 7H6z"/><path d="M8 21h8"/><path d="M14 11l5-8"/>')}
${L('s-compass', '<path d="M4 20L12 4l8 16"/><path d="M7 14h10"/><circle cx="12" cy="4" r="1.2"/>')}
${L('s-quill', '<path d="M19 3C11 5 7 10 6 18"/><path d="M19 3c-1 6-5 10-11 11"/><path d="M4 21l2-3"/>')}
${L('s-law', '<path d="M12 3v17M7 20h10M4 7h16"/><path d="M4 7l-2.5 6h5zM20 7l-2.5 6h5z"/>')}
${L('c-mask', '<path d="M4 6c5 2 11 2 16 0v6c0 4-4 8-8 8s-8-4-8-8z"/><path d="M8 11h2M14 11h2M9 15.5c2 1.3 4 1.3 6 0"/>')}
${L('c-moon', '<path d="M15 3a9 9 0 1 0 6 12A7 7 0 0 1 15 3z"/>')}
${L('c-drop', '<path d="M12 3c4 5.5 6 8.5 6 11a6 6 0 0 1-12 0c0-2.5 2-5.5 6-11z"/>')}
${L('c-book', '<path d="M3 5c3-1 6-1 9 1 3-2 6-2 9-1v14c-3-1-6-1-9 1-3-2-6-2-9-1z"/><path d="M12 6v14"/>')}
${L('c-gear', '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1"/><circle cx="12" cy="12" r="6.5"/>')}
${L('c-horseshoe', '<path d="M6 20V11a6 6 0 0 1 12 0v9"/><path d="M4 20h4M16 20h4"/>')}
${L('c-sword', '<path d="M19 3l-11 11M19 3h-4M19 3v4"/><path d="M6 12l6 6M8 16l-4 4"/>')}
${L('c-tower', '<path d="M6 21V8h12v13M6 8V4h2.5v2h2V4h3v2h2V4H18v4"/><path d="M10 21v-5h4v5"/>')}
${L('c-jug', '<path d="M9 3h6M10 3v3c-3 1.5-4 4-4 7 0 4 2.5 8 6 8s6-4 6-8c0-3-1-5.5-4-7V3"/><path d="M18 9c2 0 3 1.5 3 3s-1 3-3 3"/>')}
${L('c-column', '<path d="M5 4h14M5 20h14M7 4c0 1.5 1 2 2 2h6c1 0 2-.5 2-2M8 6v14M12 6v14M16 6v14"/>')}
${L('c-sun', '<circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/>')}
${L('c-scroll', '<path d="M6 4h11a2 2 0 0 1 2 2v1h-3"/><path d="M8 4a2 2 0 0 0-2 2v12a2 2 0 0 1-2 2h11a2 2 0 0 0 2-2V7"/><path d="M10 9h4M10 13h4"/>')}
${L('c-harp', '<path d="M6 21V4c6 0 12 6 12 13H6"/><path d="M9 7v10M12 9v8M15 12v5"/>')}
${L('c-lamp', '<path d="M3 14c3 3 11 3 14 0l3-3h-4c-2-2-7-2-9 0-2 1-4 1.5-4 3z"/><path d="M12 9c-1-2 1-3 0-5"/>')}
${L('c-target', '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4"/>')}
${L('c-helmet', '<path d="M4 16a8 8 0 0 1 16 0v4h-5v-4H9v4H4z"/><path d="M12 3v5"/>')}
${L('c-barrel', '<ellipse cx="12" cy="5" rx="6" ry="2"/><path d="M6 5c-1.3 5-1.3 9 0 14M18 5c1.3 5 1.3 9 0 14"/><ellipse cx="12" cy="19" rx="6" ry="2"/><path d="M5.3 12h13.4"/>')}
${L('t-agriculture', '<path d="M12 21V8"/><path d="M12 8c-2-1-3-3-3-5 2 1 3 3 3 5zM12 8c2-1 3-3 3-5-2 1-3 3-3 5z"/><path d="M12 13c-2-1-4-3-4-5 2 0 4 2 4 5zM12 13c2-1 4-3 4-5-2 0-4 2-4 5zM12 18c-2-1-4-3-4-5 2 0 4 2 4 5zM12 18c2-1 4-3 4-5-2 0-4 2-4 5z"/>')}
${L('t-architecture', '<path d="M3 21h18M4 9h16L12 3z"/><path d="M6 9v12M10 9v12M14 9v12M18 9v12"/>')}
${L('t-economy', '<ellipse cx="9" cy="7" rx="5" ry="2.2"/><path d="M4 7v4c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2V7"/><ellipse cx="15" cy="15" rx="5" ry="2.2"/><path d="M10 15v4c0 1.2 2.2 2.2 5 2.2s5-1 5-2.2v-4"/>')}
${L('t-law', '<path d="M12 3v17M7 20h10M4 7h16"/><path d="M4 7l-2.5 6h5zM20 7l-2.5 6h5z"/>')}
${L('t-masonry', '<path d="M3 20h18M3 15h18M3 10h18M8 10v5M16 10v5M12 15v5M12 5v5M3 5h18"/>')}
${L('t-mathematics', '<path d="M5 6h14M9 6v13M15 6c0 6 0 10 3 13"/>')}
${L('t-philosophy', '<circle cx="12" cy="9" r="5"/><path d="M12 14v7M8 21h8M12 4v10"/>')}
${L('t-strategy', '<path d="M6 21h12M8 21l1-6c-2-1-3-3-2-6 1-2 3-3 5-4l1 2 3 1v3l-3 1 2 9"/><circle cx="12.5" cy="8" r=".6"/>')}
${L('t-theology', '<path d="M3 21h18M5 21V10M19 21V10M9 21V10M15 21V10M3 10h18L12 4z"/><circle cx="12" cy="7.6" r="1"/>')}
${L('t-urbanism', '<path d="M3 21h18M4 21V10h5v11M9 21V5h6v16M15 21v-8h5v8"/><path d="M11 8h2M11 11h2M11 14h2"/>')}
${L('i-home', '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>')}
${L('i-help', '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8v.5"/><path d="M12 17.2v.1"/>')}
${L('i-discard', '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>')}
${L('i-log', '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>')}
</svg>`;
}

export const icon = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
export const resourceIcon = (r, cls = '') => icon(`i-${r}`, cls);
export const scienceIcon = (s, cls = '') => icon(`s-${s}`, `sci ${cls}`);
export const chainIcon = (c, cls = '') => icon(`c-${c}`, `chain ${cls}`);
export const tokenIcon = (t, cls = '') => icon(`t-${t}`, cls);

// 数字の入ったコイン・点
export const coinHtml = (n, cls = '') => `<span class="coin ${cls}">${icon('i-coin')}<b>${n}</b></span>`;
export const vpHtml = (n, cls = '') => `<span class="vp ${cls}">${icon('i-vp')}<b>${n}</b></span>`;
const swatch = (color) => `<span class="swatch c-${color}"></span>`;

// 費用（コインと資源）
export function costHtml(cost) {
    const parts = [];
    if (cost.coins) parts.push(coinHtml(cost.coins));
    RESOURCES.forEach(r => { for (let i = 0; i < cost[r]; i++) parts.push(resourceIcon(r)); });
    return parts.join('');
}

// カードの効果（絵だけ）
export function effectHtml(key) {
    const c = CARDS[key];
    const parts = [];
    if (c.produce) Object.entries(c.produce).forEach(([r, n]) => { for (let i = 0; i < n; i++) parts.push(resourceIcon(r)); });
    if (c.choice) parts.push(`<span class="choice">${c.choice.map(r => resourceIcon(r)).join('<i>/</i>')}</span>`);
    if (c.reserve) parts.push(`<span class="reserve">${c.reserve.map(r => resourceIcon(r)).join('')}<i>=</i>${coinHtml(1)}</span>`);
    if (c.shields) for (let i = 0; i < c.shields; i++) parts.push(icon('i-shield'));
    if (c.science) parts.push(scienceIcon(c.science));
    if (c.coins) parts.push(coinHtml(c.coins));
    if (c.per) parts.push(`<span class="per">${coinHtml(c.per.coins)}<i>/</i>${c.per.wonders ? icon('i-wonder') : swatch(c.per.colors[0])}</span>`);
    if (c.guild) {
        const target = c.guild.count[0] === 'wonders' ? icon('i-wonder') : c.guild.count[0] === 'money' ? coinHtml(3) : c.guild.count.map(swatch).join('');
        parts.push(`<span class="per">${vpHtml(c.guild.vp)}<i>/</i>${target}</span>`);
    }
    if (c.vp) parts.push(vpHtml(c.vp));
    return parts.join('');
}

// 盤のカード（表）。price：自分が建てるときのコイン（取れるカードだけ）
export function cardHtml(key, { price = null, chain = false, canBuild = true, name = true } = {}) {
    const c = CARDS[key];
    const badge = chain ? `<span class="price chain-free">${chainIcon(c.free)}</span>`
        : price === null || (price === 0 && canBuild) ? '' : `<span class="price ${canBuild ? '' : 'short'}">${price}</span>`;
    return `<div class="card-face c-${c.color} ${c.chain ? 'has-chain' : ''}">
        <div class="eff">${effectHtml(key)}</div>
        ${c.chain ? `<span class="chain-mark">${chainIcon(c.chain)}</span>` : ''}
        <div class="cost">${costHtml(c.cost)}${c.free ? `<span class="free">${chainIcon(c.free)}</span>` : ''}</div>
        ${name ? `<div class="name">${c.name}</div>` : ''}
        ${badge}
    </div>`;
}

export function cardBackHtml(age, back) {
    return `<div class="card-back age${age} ${back === 'guild' ? 'guild' : ''}"><span>${back === 'guild' ? 'G' : ['', 'I', 'II', 'III'][age]}</span></div>`;
}

// 七不思議の効果（絵だけ）
export function wonderEffectHtml(key) {
    const w = WONDERS[key];
    const parts = [];
    if (w.choice) parts.push(`<span class="choice">${w.choice.map(r => resourceIcon(r)).join('<i>/</i>')}</span>`);
    if (w.coins) parts.push(coinHtml(w.coins));
    if (w.loss) parts.push(coinHtml(`-${w.loss}`, 'loss'));
    for (let i = 0; i < w.shields; i++) parts.push(icon('i-shield'));
    if (w.destroy) parts.push(`<span class="destroy">${swatch(w.destroy)}<i>×</i></span>`);
    if (w.revive) parts.push(icon('i-discard', 'revive'));
    if (w.library) parts.push(`<span class="library">${tokenIcon('philosophy', 'tok')}<i>3</i></span>`);
    if (w.vp) parts.push(vpHtml(w.vp));
    if (w.replay) parts.push(icon('i-replay', 'replay'));
    return parts.join('');
}

export function wonderHtml(key, { built = false, price = null, canBuild = false, removed = false } = {}) {
    const w = WONDERS[key];
    return `<div class="wonder-face ${built ? 'built' : ''} ${removed ? 'removed' : ''}">
        <div class="w-name">${w.name}</div>
        <div class="w-eff">${wonderEffectHtml(key)}</div>
        <div class="w-cost">${costHtml(w.cost)}</div>
        ${price !== null && !built ? `<span class="price ${canBuild ? '' : 'short'}">${price}</span>` : ''}
    </div>`;
}

export const tokenHtml = (key, cls = '') => `<span class="token ${cls}" title="${TOKENS[key].name}">${tokenIcon(key)}</span>`;

// 説明の文（ダイアログ用）
export function cardText(key) {
    const c = CARDS[key];
    const res = (list, sep = 'か') => list.map(r => RESOURCE_NAMES[r]).join(sep);
    const lines = [];
    if (c.produce) lines.push(Object.entries(c.produce).map(([r, n]) => `${RESOURCE_NAMES[r]}${n > 1 ? `×${n}` : ''}`).join('・') + 'を生む');
    if (c.choice) lines.push(`毎番、${res(c.choice)}のどれか1つを生む（相手の値段には数えない）`);
    if (c.reserve) lines.push(`${res(c.reserve, 'と')}を1つ1コインで買える`);
    if (c.shields) lines.push(`盾${c.shields}つ`);
    if (c.science) lines.push(`科学の印「${SCIENCE_NAMES[c.science]}」`);
    if (c.coins) lines.push(`${c.coins}コインを得る`);
    if (c.per) lines.push(`建てたとき、自分の${c.per.wonders ? '七不思議' : `${COLOR_NAMES[c.per.colors[0]]}のカード`}1つにつき${c.per.coins}コイン`);
    if (c.guild) {
        const { count, coins, vp } = c.guild;
        if (count[0] === 'wonders') lines.push(`終わりに、七不思議の多い方の都市の七不思議1つにつき${vp}点`);
        else if (count[0] === 'money') lines.push(`終わりに、コインの多い方の都市の3コインにつき${vp}点`);
        else {
            const what = count.map(k => COLOR_NAMES[k]).join('と');
            lines.push(`建てたとき、${what}のカードの多い方の都市の${what}1枚につき${coins}コイン。終わりに、同じく1枚につき${vp}点`);
        }
    }
    if (c.vp) lines.push(`${c.vp}点`);
    return lines;
}

export function wonderText(key) {
    const w = WONDERS[key];
    const lines = [];
    if (w.choice) lines.push(`毎番、${w.choice.map(r => RESOURCE_NAMES[r]).join('か')}のどれか1つを生む`);
    if (w.coins) lines.push(`${w.coins}コインを得る`);
    if (w.loss) lines.push(`相手は${w.loss}コインを失う`);
    if (w.shields) lines.push(`盾${w.shields}つ`);
    if (w.destroy) lines.push(`相手の${COLOR_NAMES[w.destroy]}のカードを1枚選んで捨てさせる`);
    if (w.revive) lines.push('捨て札から1枚を選び、無料で建てる');
    if (w.library) lines.push('使われていない進歩トークンを3枚引き、1枚を取る');
    if (w.vp) lines.push(`${w.vp}点`);
    if (w.replay) lines.push('もう1手');
    return lines;
}
