/**
 * 絵（すべて自作の SVG）
 * 図柄は symbol としてページに一度だけ入れ、use で使い回す。カードの描き方は、港・説明・持ち物のどこでもこの関数を使う
 */

import { CARDS, ROLES, SHIP_NAMES } from './cards.js';

const S = (id, body, viewBox = '0 0 24 24') => `<symbol id="${id}" viewBox="${viewBox}">${body}</symbol>`;
const L = (id, body) => S(id, `<g fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${body}</g>`);

export function symbolsSvg() {
    return `<svg xmlns="http://www.w3.org/2000/svg" style="display:none">
${L('i-home', '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>')}
${L('i-help', '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.6 2.2c-.7.4-1.1 1-1.1 1.8v.5"/><path d="M12 17.2v.1"/>')}
${S('i-coin', '<circle cx="12" cy="12" r="10" fill="#f0c33c" stroke="#9a7110" stroke-width="1.5"/><circle cx="12" cy="12" r="6.8" fill="none" stroke="#c99b26" stroke-width="1.2"/>')}
${S('i-vp', '<path d="M12 2.5l8 3v6c0 5-3.4 8.6-8 10-4.6-1.4-8-5-8-10v-6z" fill="#2f6aa8" stroke="#e8eef6" stroke-width="1.4" stroke-linejoin="round"/>')}
${L('i-sword', '<path d="M19 3l-10 10M19 3h-4M19 3v4"/><path d="M6 11l7 7M8 15l-4 4"/>')}
${S('i-skull', '<path d="M12 3c-4.6 0-8 3.2-8 7.4 0 2.6 1.3 4.4 3 5.5V19h10v-3.1c1.7-1.1 3-2.9 3-5.5C20 6.2 16.6 3 12 3z" fill="#f4efe2" stroke="#1d1d1d" stroke-width="1.4"/><circle cx="8.8" cy="11" r="2" fill="#1d1d1d"/><circle cx="15.2" cy="11" r="2" fill="#1d1d1d"/><path d="M12 13.5l-1 2h2z" fill="#1d1d1d"/><path d="M10 19v-2M12 19v-2M14 19v-2" stroke="#1d1d1d" stroke-width="1"/>')}
${S('i-ship', '<path d="M3 16h18l-3 4H6z" fill="currentColor"/><path d="M11 3v12" stroke="#3a2a1a" stroke-width="1.4"/><path d="M11 4l7 9h-7z" fill="#f6efdc" stroke="#3a2a1a" stroke-width="1"/><path d="M10 6L5 13h5z" fill="#f6efdc" stroke="#3a2a1a" stroke-width="1"/><path d="M11 3l4 1.4-4 1.4" fill="currentColor"/>')}
${L('r-trader', '<path d="M8 6h8l-1.5-3h-5z"/><path d="M8 6c-3 3-4 6-4 9 0 3 3 6 8 6s8-3 8-6c0-3-1-6-4-9z"/><path d="M12 10v7M10 12.5c0-1 1-1.5 2-1.5s2 .5 2 1.3-1 1.2-2 1.4-2 .6-2 1.4 1 1.4 2 1.4 2-.5 2-1.4"/>')}
${L('r-settler', '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/><path d="M10 20v-6h4v6"/>')}
${L('r-captain', '<circle cx="12" cy="5" r="2"/><path d="M12 7v14M8 10h8"/><path d="M4 14c0 4 4 7 8 7s8-3 8-7"/><path d="M4 14l-1 2M20 14l1 2"/>')}
${L('r-priest', '<path d="M12 3v18M6 9h12"/>')}
${L('r-jack', '<path d="M12 3l2.6 5.6 6.1.7-4.5 4.1 1.2 6-5.4-3-5.4 3 1.2-6-4.5-4.1 6.1-.7z"/>')}
${L('r-sailor', '<path d="M19 3l-10 10M19 3h-4M19 3v4"/><path d="M6 11l7 7M8 15l-4 4"/>')}
${L('r-pirate', '<path d="M4 4l16 16M20 4L4 20"/><path d="M4 4h3M4 4v3M20 4h-3M20 4v3"/><circle cx="12" cy="12" r="3"/>')}
${L('r-mademoiselle', '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.5A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>')}
${L('r-jester', '<path d="M4 17l2-10 4 6 2-9 2 9 4-6 2 10z"/><circle cx="6" cy="6" r="1.3"/><circle cx="12" cy="3" r="1.3"/><circle cx="18" cy="6" r="1.3"/><path d="M4 20h16"/>')}
${L('r-admiral', '<path d="M3 15l14-6 2 4-14 6z"/><path d="M17 9l3-1 1 2-2 2"/><path d="M8 17l1 4M12 15l2 6"/>')}
${L('r-governor', '<path d="M3 8l4 4 5-7 5 7 4-4-2 11H5z"/><path d="M5 19h14"/>')}
${S('i-tax', '<rect x="4" y="3" width="16" height="18" rx="2" fill="#efe3c2" stroke="#6a5530" stroke-width="1.4"/><path d="M8 8h8M8 12h8M8 16h5" stroke="#6a5530" stroke-width="1.4"/><circle cx="17" cy="17" r="4" fill="#f0c33c" stroke="#9a7110"/>')}
</svg>`;
}

export const icon = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
export const coinHtml = (n, cls = '') => `<span class="coin ${cls}">${icon('i-coin')}<b>${n}</b></span>`;
export const vpHtml = (n, cls = '') => `<span class="vp ${cls}">${icon('i-vp')}<b>${n}</b></span>`;

const SYMBOL_ROLE = { cross: 'priest', anchor: 'captain', house: 'settler' };

// 人物の力の説明
export function roleText(role, card = null) {
    switch (role) {
        case 'trader': return card ? `${SHIP_NAMES[card.color]}の船を取ると、1コイン多い` : '同じ色の船を取ると、1コイン多い';
        case 'sailor': return `剣${card?.swords ?? 1}：めくった船を撃退できる`;
        case 'pirate': return `剣${card?.swords ?? 2}：めくった船を撃退できる`;
        case 'settler': case 'captain': case 'priest': return '遠征の条件になる';
        case 'jack': return '遠征で、司祭・船長・定住者のどれの代わりにもなる';
        case 'mademoiselle': return '人物を雇う費用が1コイン安い';
        case 'jester': return '手番でないときに取る番で港が空なら1コイン。誰かの発見が失敗したら1コイン';
        case 'admiral': return '取る番に港が5枚以上なら2コイン';
        case 'governor': return '取引と雇用で、1枚多く取れる';
        default: return '';
    }
}

// カード1枚。price：自分が雇う費用（割引のあと）
export function cardHtml(id, { price = null, small = false } = {}) {
    const c = CARDS[id];
    if (c.kind === 'ship') {
        return `<div class="card ship s-${c.color} ${small ? 'small' : ''}">
            <div class="band"><span class="cname">${SHIP_NAMES[c.color]}</span>${coinHtml(c.coins)}</div>
            <div class="art">${icon('i-ship')}</div>
            <div class="foot">${c.swords === null ? icon('i-skull', 'skull') : `<span class="sw">${icon('i-sword')}<b>${c.swords}</b></span>`}</div>
        </div>`;
    }
    if (c.kind === 'person') {
        const shown = price ?? c.cost;
        return `<div class="card person r-${c.role} ${small ? 'small' : ''}">
            <div class="band"><span class="cname">${ROLES[c.role].name}</span>${c.vp ? vpHtml(c.vp) : ''}</div>
            <div class="art">${icon(`r-${c.role}`)}${c.role === 'trader' ? `<i class="tdot s-${c.color}"></i>` : ''}${c.swords ? `<span class="sw">${icon('i-sword')}<b>${c.swords}</b></span>` : ''}</div>
            <div class="foot">${coinHtml(shown, price !== null && price < c.cost ? 'cheap' : '')}</div>
        </div>`;
    }
    if (c.kind === 'expedition') {
        return `<div class="card expedition ${small ? 'small' : ''}">
            <div class="band"><span class="cname">遠征</span>${vpHtml(c.vp)}</div>
            <div class="art needs">${c.needs.map(s => icon(`r-${SYMBOL_ROLE[s]}`)).join('')}</div>
            <div class="foot">${coinHtml(c.coins)}</div>
        </div>`;
    }
    return `<div class="card tax ${small ? 'small' : ''}">
        <div class="band"><span class="cname">税金</span></div>
        <div class="art">${icon('i-tax')}</div>
        <div class="foot">${c.bonus === 'swords' ? icon('i-sword') : icon('i-vp')}</div>
    </div>`;
}
