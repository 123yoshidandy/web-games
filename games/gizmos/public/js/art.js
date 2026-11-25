/**
 * 絵（エネルギーの玉・ギズモのカード・機械の札・アイコン）。すべて自作の SVG と CSS
 * 何度も使う図柄は symbol としてページに一度だけ入れ、use で使い回す
 */

import { CARDS, COLORS, COLOR_NAMES, TYPE_NAMES } from './cards.js';
import { cardText, cardTitle } from './card-text.js';

const ROMAN = ['0', 'I', 'II', 'III'];

export function symbolsSvg() {
    const s = (id, body, view = '0 0 24 24') => `<symbol id="${id}" viewBox="${view}">${body}</symbol>`;
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">
        ${s('e-red', '<path d="M12 3.5c1 3.2 4.6 5 4.6 9.3a4.6 4.6 0 0 1-9.2 0c0-2.3 1.2-3.6 2.2-4.8.3 1.6 1 2.4 1.9 2.8-.4-2.8-.2-5 .5-7.3z"/>')}
        ${s('e-yellow', '<path d="M13.6 2.8 6.2 13.4h4.9l-1.6 7.8 7.5-10.7h-5z"/>')}
        ${s('e-blue', '<g fill="none" stroke-width="1.8"><ellipse cx="12" cy="12" rx="8.4" ry="3.3"/><ellipse cx="12" cy="12" rx="8.4" ry="3.3" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="8.4" ry="3.3" transform="rotate(120 12 12)"/></g><circle cx="12" cy="12" r="2"/>')}
        ${s('e-black', '<rect x="5.5" y="7" width="12" height="10" rx="1.6" fill="none" stroke-width="1.9"/><rect x="17.6" y="10" width="1.9" height="4" rx=".6"/><rect x="7.6" y="9.1" width="3.4" height="5.8" rx=".5"/>')}
        ${s('i-file', '<path d="M3.5 7.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9.5A1.5 1.5 0 0 0 19 8h-7l-2-2.5H5A1.5 1.5 0 0 0 3.5 7z"/><path d="M8 13h8"/>')}
        ${s('i-pick', '<path d="M12 3.5v8.5M8.2 8.6 12 12.4l3.8-3.8"/><path d="M5 13.5v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/>')}
        ${s('i-build', '<path d="M14.6 5.2a4.2 4.2 0 0 0-5.3 5.4l-5.5 5.5a1.7 1.7 0 0 0 2.4 2.4l5.5-5.5a4.2 4.2 0 0 0 5.4-5.3l-2.6 2.6-2.4-.5-.5-2.4z"/>')}
        ${s('i-research', '<circle cx="10.5" cy="10.5" r="5.8"/><path d="m15 15 5 5"/>')}
        ${s('i-draw', '<rect x="5" y="3.5" width="14" height="11" rx="3"/><path d="M9.5 8.2a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.6-.8 1.1M12 13.1v.1"/><path d="M12 14.5v3.2M9.5 19.8h5"/>')}
        ${s('i-vp', '<path d="m12 3.6 2.5 5.2 5.6.7-4.1 3.9 1 5.6L12 16.3 7 19l1-5.6-4.1-3.9 5.6-.7z"/>')}
        ${s('i-upgrade', '<path d="M12 19.5V5M6.5 10.5 12 5l5.5 5.5"/>')}
        ${s('i-convert', '<path d="M5 9.5h11.5l-3-3M19 14.5H7.5l3 3"/>')}
        ${s('i-storage', '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="3.2"/>')}
        ${s('i-block', '<circle cx="12" cy="12" r="8"/><path d="m6.4 6.4 11.2 11.2"/>')}
        ${s('i-arrow', '<path d="M4 12h15M14 7l5 5-5 5"/>')}
        ${s('i-home', '<path d="M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5"/>')}
        ${s('i-help', '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.2v.1"/>')}
        ${s('i-dispenser', '<path d="M6 3.5h12l-2 9H8z"/><path d="M9.5 12.5v3h5v-3M12 15.5v2"/><circle cx="12" cy="20" r="1.6"/>')}
    </svg>`;
}

const use = (id, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#${id}"/></svg>`;
export const icon = (name, cls = '') => use(`i-${name}`, `line ${cls}`);

// エネルギーの玉。color：'red' など・'any'（何色でも）・'random'（ランダム）
export function sphere(color, { n = null, cls = '', attrs = '' } = {}) {
    const inner = COLORS.includes(color) ? use(`e-${color}`, 'mark') : color === 'random' ? '<b class="q">?</b>' : '';
    const num = n === null ? '' : `<span class="num">${n}</span>`;
    const label = COLORS.includes(color) ? COLOR_NAMES[color] : color === 'any' ? '好きな色' : 'ランダム';
    return `<span class="sph sph-${color} ${cls}" ${attrs} title="${label}">${inner}${num}</span>`;
}

// ---- 効果の記号（きっかけ → 起きること） ----

const dots = (colors) => `<span class="dots">${colors.map(c => sphere(c, { cls: 'dot' })).join('')}</span>`;

function triggerPicto(card) {
    const t = card.trigger;
    if (t.action === 'file') return `<span class="trig">${icon('file')}</span>`;
    if (t.action === 'pick') return `<span class="trig">${icon('pick')}${dots(t.colors)}</span>`;
    if (t.fromArchive) return `<span class="trig">${icon('build')}${icon('file', 'sub')}</span>`;
    if (t.level) return `<span class="trig">${icon('build')}<b class="lv">${ROMAN[t.level]}</b></span>`;
    return `<span class="trig">${icon('build')}${dots(t.colors)}</span>`;
}

function effectPicto(card) {
    const e = card.effect;
    const times = (n) => (n > 1 ? `<b class="times">×${n}</b>` : '');
    switch (e.kind) {
        case 'draw': return `<span class="eff">${sphere('random', { cls: 'dot' })}${times(e.amount)}</span>`;
        case 'pick': return `<span class="eff">${icon('pick')}${times(e.amount)}</span>`;
        case 'vp': return `<span class="eff vp">${icon('vp')}<b>+${e.amount}</b></span>`;
        case 'file': return `<span class="eff">${icon('file')}</span>`;
        case 'research': return `<span class="eff">${icon('research')}</span>`;
        case 'freeBuild': return `<span class="eff">${icon('build')}<b class="lv">I</b><b class="free">0</b></span>`;
        default: return '';
    }
}

function convertPicto(card) {
    const steps = card.convert;
    const same = steps.length === 2 && steps[0].to === 'any' && steps[0].from === steps[1].from;
    const one = (s, extra = '') => {
        const from = s.from === null ? sphere('any', { cls: 'dot' }) : sphere(s.from, { cls: 'dot' });
        const to = s.to === 'double' ? sphere(s.from, { cls: 'dot' }) + sphere(s.from, { cls: 'dot' }) : sphere('any', { cls: 'dot' });
        return `<span class="conv">${from}${extra}${use('i-arrow', 'line arrow')}${to}</span>`;
    };
    if (same) return one(steps[0], '<b class="times">×2</b>');
    return steps.map(s => one(s)).join('');
}

function upgradePicto(card) {
    const up = card.upgrade;
    if (up.discount) {
        const what = { level2: `<b class="lv">II</b>`, archive: icon('file'), research: icon('research') }[up.discount];
        return `<span class="upg">${icon('build')}${what}<b class="minus">−1</b></span>`;
    }
    if (up.block) return `<span class="upg block">${icon(up.block === 'research' ? 'research' : 'file')}${icon('block', 'over')}</span>`;
    if (up.score) return `<span class="upg score">${up.score === 'energy' ? icon('storage') : icon('vp')}<b>=点</b></span>`;
    // 「+」は狭い機械の札では省く（CSS）
    const plus = (name, n) => `<span class="plus">${icon(name)}<b><span class="sign">+</span>${n}</b></span>`;
    const parts = [];
    if (up.storage) parts.push(plus('storage', up.storage));
    if (up.archive) parts.push(plus('file', up.archive));
    if (up.research) parts.push(plus('research', up.research));
    return `<span class="upg">${parts.join('')}</span>`;
}

export function pictoHtml(id) {
    const card = CARDS[id];
    if (card.trigger) return `<span class="picto">${triggerPicto(card)}${use('i-arrow', 'line arrow')}${effectPicto(card)}</span>`;
    if (card.convert) return `<span class="picto">${convertPicto(card)}</span>`;
    return `<span class="picto">${upgradePicto(card)}</span>`;
}

const TYPE_ICON = { upgrade: 'upgrade', converter: 'convert', file: 'file', pick: 'pick', build: 'build' };

// ギズモのカード（正方形）
export function cardHtml(id, { cls = '', attrs = '' } = {}) {
    const card = CARDS[id];
    const color = card.color ?? 'start';
    const points = card.points === null ? '?' : card.points;
    const cost = card.level === 0 ? '' : `<span class="cost">${sphere(card.color, { n: card.cost })}</span>`;
    return `<div class="card card-${color} lv${card.level} ${cls}" data-card="${id}" ${attrs} aria-label="${cardTitle(id)}。${cardText(id)}">
        <span class="card-top">${icon(TYPE_ICON[card.type], 'type')}<span class="roman">${ROMAN[card.level]}</span>${card.level === 0 ? '' : `<span class="pts">${points}</span>`}</span>
        ${pictoHtml(id)}
        ${cost}
    </div>`;
}

export function cardBackHtml(level, { cls = '', attrs = '', count = null } = {}) {
    const n = count === null ? '' : `<span class="deck-count">${count}</span>`;
    return `<div class="card-back lv${level} ${cls}" ${attrs}><span class="roman">${ROMAN[level]}</span>${n}</div>`;
}

// 機械（建てたギズモ）の札：色の帯・効果の記号・点
export function tileHtml(id, { cls = '', attrs = '' } = {}) {
    const card = CARDS[id];
    const color = card.color ?? 'start';
    const points = card.points === null ? '?' : card.points;
    return `<div class="tile tile-${color} ${cls}" data-tile="${id}" ${attrs} title="${cardText(id)}">
        ${pictoHtml(id)}${card.level === 0 ? '' : `<span class="tile-pts">${points}</span>`}
    </div>`;
}

export const typeIcon = (type) => icon(TYPE_ICON[type], 'type');
export { TYPE_NAMES };
