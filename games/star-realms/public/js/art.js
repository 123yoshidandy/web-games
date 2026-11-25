/**
 * 絵（すべて自作の SVG。公式の画像は使っていない）
 * カードの絵は、勢力ごとの形（交易連合：翼の流線形、ブロブ：触手のある有機体、機械教団：角ばった多角形、星の帝国：槍のような尖った艦）を、
 * 費用で大きさを、カードの名前から細部を変えて作る。symbol としてページに一度だけ入れ、use で使い回す（viewBox 48×40）
 * 線のアイコン（ホーム・遊び方など）は viewBox 24×24 で、色は currentColor
 */

import { CARDS, FACTIONS } from './cards.js';
import { effectsChips, typeName } from './card-text.js';

const PAL = {
    federation: { hull: '#a9d6f7', mid: '#4d93d1', dark: '#1d4c7c', glow: '#d9f2ff' },
    blob: { hull: '#97df78', mid: '#4caa45', dark: '#215f29', glow: '#efff9e' },
    machine: { hull: '#f39a86', mid: '#cf4a3c', dark: '#6f1d16', glow: '#ffd7a8' },
    empire: { hull: '#f7da84', mid: '#d6a42c', dark: '#6f500f', glow: '#fff3c2' },
    none: { hull: '#d6dce4', mid: '#8a95a5', dark: '#434c59', glow: '#ffe3a3' }
};

// 名前から 0〜2 の細部の違いを作る
const variantOf = (key) => [...key].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) >>> 0, 7) % 3;
// 左半分を描き、左右反転して右半分にする
const mirror = (half) => `${half}<g transform="matrix(-1 0 0 1 48 0)">${half}</g>`;
const flame = (x, y, len = 6) => `<path d="M${x - 1.8} ${y}L${x} ${y + len}L${x + 1.8} ${y}Z" fill="#ffb347"/><path d="M${x - .8} ${y}L${x} ${y + len * .6}L${x + .8} ${y}Z" fill="#fff4c9"/>`;
const sizeOf = (key) => {
    const cost = CARDS[key].cost;
    return cost <= 2 ? 0 : cost <= 5 ? 1 : 2;
};

// ---- 艦 ----

function federationShip(p, size, v) {
    const st = `fill="${p.hull}" stroke="${p.dark}" stroke-width="1.1" stroke-linejoin="round"`;
    if (size === 0) {
        return mirror(`<path d="M24 5L27 21L${34 + v} 29L${34 + v} 32L26 30L24 30Z" ${st}/>`)
            + `<ellipse cx="24" cy="15" rx="1.7" ry="4" fill="${p.glow}" stroke="${p.dark}" stroke-width=".8"/>` + flame(24, 30);
    }
    if (size === 1) {
        return mirror(`<path d="M24 3L27 15L30 19L${39 + v} 27L${40 + v} 32L29 29L26 33L24 33Z" ${st}/><rect x="31" y="21" width="3" height="9" rx="1.5" fill="${p.mid}" stroke="${p.dark}" stroke-width=".8"/>`)
            + `<path d="M22.4 10h3.2v9h-3.2z" fill="${p.glow}" stroke="${p.dark}" stroke-width=".8"/>` + flame(21, 33) + flame(27, 33);
    }
    const windows = Array.from({ length: 2 + v }, (_, i) => `<rect x="22.6" y="${9 + i * 4}" width="2.8" height="2.2" rx=".6" fill="${p.glow}"/>`).join('');
    return mirror(`<path d="M24 2L28 9L28 17L38 21L45 29L45 33L30 31L28 36L24 36Z" ${st}/><path d="M30 23L41 28" stroke="${p.mid}" stroke-width="1.6"/><rect x="36" y="24" width="3.4" height="8" rx="1.7" fill="${p.mid}" stroke="${p.dark}" stroke-width=".8"/>`)
        + windows + flame(19, 35, 5) + flame(24, 36, 6) + flame(29, 35, 5);
}

// 揺らいだ輪郭（ブロブ）
function blobBody(cx, cy, r, bumps, phase, fill, stroke) {
    const n = 24;
    const pts = Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const rr = r * (1 + .13 * Math.sin(a * bumps + phase));
        return [cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * .86];
    });
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let d = `M${mid(pts[n - 1], pts[0]).map(x => x.toFixed(1)).join(' ')}`;
    pts.forEach((pt, i) => {
        const m = mid(pt, pts[(i + 1) % n]);
        d += `Q${pt[0].toFixed(1)} ${pt[1].toFixed(1)} ${m[0].toFixed(1)} ${m[1].toFixed(1)}`;
    });
    return `<path d="${d}Z" fill="${fill}" stroke="${stroke}" stroke-width="1.1"/>`;
}

function blobShip(p, size, v) {
    const r = [8, 10, 12.5][size];
    const cy = [14, 14, 15][size];
    const count = [3, 4, 5][size] + (v === 2 ? 1 : 0);
    const tentacles = Array.from({ length: count }, (_, i) => {
        const x = 24 + (i - (count - 1) / 2) * (r * 1.5 / count);
        const len = 13 + size * 3 - Math.abs(i - (count - 1) / 2) * 2;
        const w = (i % 2 ? 3 : -3);
        return `<path d="M${x.toFixed(1)} ${cy + r * .5}q${w} ${len / 2} 0 ${len}" stroke="${p.mid}" stroke-width="${2.4 - size * .2}" fill="none" stroke-linecap="round"/>`;
    }).join('');
    const eyes = size === 2
        ? `<circle cx="19" cy="${cy - 1}" r="2.4" fill="${p.glow}"/><circle cx="29" cy="${cy - 1}" r="2.4" fill="${p.glow}"/><circle cx="24" cy="${cy + 3}" r="1.8" fill="${p.glow}"/><circle cx="19" cy="${cy - 1}" r="1" fill="${p.dark}"/><circle cx="29" cy="${cy - 1}" r="1" fill="${p.dark}"/>`
        : `<circle cx="24" cy="${cy}" r="${2.6 + size}" fill="${p.glow}"/><circle cx="24" cy="${cy}" r="${1.1 + size * .4}" fill="${p.dark}"/>`;
    const spikes = size >= 1 ? mirror(`<path d="M${24 - r * .8} ${cy - r * .5}l-4 -4" stroke="${p.dark}" stroke-width="1.6" stroke-linecap="round"/>`) : '';
    return tentacles + spikes + blobBody(24, cy, r, 5 + v, v * 1.3, p.hull, p.dark) + eyes;
}

function machineShip(p, size, v) {
    const st = `fill="${p.hull}" stroke="${p.dark}" stroke-width="1.1" stroke-linejoin="round"`;
    if (size === 0) {
        return mirror(`<path d="M24 8L30 12L30 24L26 30L24 30Z" ${st}/><path d="M30 15L${36 + v} 19L${36 + v} 26L32 24L30 22Z" fill="${p.mid}" stroke="${p.dark}" stroke-width="1"/><path d="M27 9L29 4" stroke="${p.dark}" stroke-width="1.2"/>`)
            + `<rect x="21" y="16" width="6" height="3" rx=".5" fill="${p.glow}"/>` + flame(24, 30, 5);
    }
    if (size === 1) {
        return mirror(`<path d="M24 4L31 9L31 20L36 22L${40 + v} 32L34 31L30 27L27 34L24 34Z" ${st}/><path d="M31 12h4v6h-4" fill="${p.mid}" stroke="${p.dark}" stroke-width="1"/>`)
            + `<path d="M21 12h6l-1 4h-4z" fill="${p.glow}"/><path d="M24 20v8" stroke="${p.dark}" stroke-width="1"/>` + flame(21, 33, 5) + flame(27, 33, 5);
    }
    return mirror(`<path d="M24 2L32 8L32 18L40 20L45 30L44 36L36 33L32 30L28 38L24 38Z" ${st}/><path d="M32 18L36 28M28 14L28 26" stroke="${p.mid}" stroke-width="1.4"/><circle cx="40" cy="28" r="2" fill="${p.mid}" stroke="${p.dark}" stroke-width=".8"/>`)
        + `<path d="M20 9h8v5h-8z" fill="${p.glow}" stroke="${p.dark}" stroke-width=".8"/>` + Array.from({ length: 1 + v }, (_, i) => `<path d="M21 ${18 + i * 4}h6" stroke="${p.dark}" stroke-width="1"/>`).join('')
        + flame(20, 37, 5) + flame(28, 37, 5);
}

function empireShip(p, size, v) {
    const st = `fill="${p.hull}" stroke="${p.dark}" stroke-width="1.1" stroke-linejoin="round"`;
    if (size === 0) {
        return mirror(`<path d="M24 3L26 19L${32 + v} 25L${32 + v} 29L25 27L24 31Z" ${st}/>`)
            + `<path d="M23 12h2v8h-2z" fill="${p.dark}"/>` + flame(24, 31, 5);
    }
    if (size === 1) {
        return mirror(`<path d="M24 2L26.5 13L34 19L30 21L${36 + v} 30L26 28L24 35Z" ${st}/><path d="M30 21L34 14" stroke="${p.dark}" stroke-width="1.2" stroke-linecap="round"/>`)
            + `<path d="M22.5 14h3v9h-3z" fill="${p.dark}"/><circle cx="24" cy="17" r="1" fill="${p.glow}"/>` + flame(24, 35, 5);
    }
    return mirror(`<path d="M24 1L27 12L33 14L29 18L40 25L43 32L28 30L26 36L24 38Z" ${st}/><path d="M33 14L37 8M40 25L45 20" stroke="${p.dark}" stroke-width="1.3" stroke-linecap="round"/><path d="M29 22L36 27" stroke="${p.mid}" stroke-width="1.6"/>`)
        + `<path d="M22 15h4v11h-4z" fill="${p.dark}"/>` + Array.from({ length: 2 + v }, (_, i) => `<rect x="23" y="${17 + i * 3}" width="2" height="1.4" fill="${p.glow}"/>`).join('')
        + flame(24, 38, 2) + flame(19, 31, 5) + flame(29, 31, 5);
}

const NEUTRAL = {
    scout: (p) => mirror(`<path d="M24 9L29 25L24 23Z" fill="${p.hull}" stroke="${p.dark}" stroke-width="1.1" stroke-linejoin="round"/>`) + `<circle cx="24" cy="17" r="2" fill="${p.glow}"/>` + flame(24, 24, 5),
    viper: (p) => mirror(`<path d="M24 5L26 18L35 27L35 30L26 26L24 28Z" fill="${p.hull}" stroke="${p.dark}" stroke-width="1.1" stroke-linejoin="round"/><path d="M33 22L35 13" stroke="${p.dark}" stroke-width="1.3" stroke-linecap="round"/>`) + `<path d="M23 10h2v7h-2z" fill="#d9473d"/>` + flame(24, 28, 5),
    explorer: (p) => mirror(`<path d="M24 6L28 9L28 27L35 27L35 33L24 33Z" fill="${p.hull}" stroke="${p.dark}" stroke-width="1.1" stroke-linejoin="round"/><rect x="29" y="15" width="5" height="10" rx="1" fill="${p.mid}" stroke="${p.dark}" stroke-width=".8"/>`) + `<rect x="21.5" y="11" width="5" height="4" rx="1" fill="${p.glow}"/>` + flame(21, 33, 5) + flame(27, 33, 5)
};

// ---- 基地 ----

function baseArt(faction, key) {
    const p = PAL[faction];
    const c = CARDS[key];
    const v = variantOf(key);
    const r = 9 + Math.min(8, c.defense) * .8;
    let body;
    if (faction === 'federation') {
        const spokes = 4 + v;
        body = `<circle cx="24" cy="20" r="${r}" fill="none" stroke="${p.mid}" stroke-width="3.4"/><circle cx="24" cy="20" r="${r}" fill="none" stroke="${p.dark}" stroke-width=".8"/>`
            + Array.from({ length: spokes }, (_, i) => {
                const a = (i / spokes) * Math.PI * 2;
                return `<path d="M24 20L${(24 + Math.cos(a) * r).toFixed(1)} ${(20 + Math.sin(a) * r).toFixed(1)}" stroke="${p.dark}" stroke-width="1.3"/>`;
            }).join('')
            + `<circle cx="24" cy="20" r="${r * .42}" fill="${p.hull}" stroke="${p.dark}" stroke-width="1"/><circle cx="24" cy="20" r="${r * .17}" fill="${p.glow}"/>`;
    } else if (faction === 'blob') {
        const pores = Array.from({ length: 3 + v }, (_, i) => {
            const a = i * 2.1 + v;
            return `<circle cx="${(24 + Math.cos(a) * r * .5).toFixed(1)}" cy="${(20 + Math.sin(a) * r * .4).toFixed(1)}" r="${1.4 + (i % 2)}" fill="${p.glow}" opacity=".9"/>`;
        }).join('');
        body = blobBody(24, 20, r, 6 + v, v, p.hull, p.dark) + blobBody(24, 20, r * .55, 4, v + 1, p.mid, p.dark) + pores;
    } else if (faction === 'machine') {
        const hex = (rr) => Array.from({ length: 6 }, (_, i) => {
            const a = Math.PI / 6 + (i / 6) * Math.PI * 2;
            return `${(24 + Math.cos(a) * rr).toFixed(1)},${(20 + Math.sin(a) * rr).toFixed(1)}`;
        }).join(' ');
        const teeth = Array.from({ length: 6 }, (_, i) => {
            const a = (i / 6) * Math.PI * 2;
            return `<rect x="22.5" y="${20 - r - 3}" width="3" height="4" fill="${p.mid}" stroke="${p.dark}" stroke-width=".7" transform="rotate(${(a * 180 / Math.PI).toFixed(0)} 24 20)"/>`;
        }).join('');
        body = teeth + `<polygon points="${hex(r)}" fill="${p.hull}" stroke="${p.dark}" stroke-width="1.1"/><polygon points="${hex(r * .55)}" fill="${p.mid}" stroke="${p.dark}" stroke-width="1"/><circle cx="24" cy="20" r="${2 + v * .6}" fill="${p.glow}"/>`;
    } else {
        // 星の帝国：塔の砦
        const h = r * 1.6;
        const tower = (x, w, top) => `<path d="M${x - w} 36V${top + 4}L${x} ${top}L${x + w} ${top + 4}V36Z" fill="${p.hull}" stroke="${p.dark}" stroke-width="1"/>`;
        body = tower(15, 3.4, 36 - h * .7) + tower(33, 3.4, 36 - h * .7) + tower(24, 5, 36 - h)
            + `<path d="M10 36h28" stroke="${p.dark}" stroke-width="1.6"/>`
            + Array.from({ length: 2 + v }, (_, i) => `<rect x="23" y="${36 - h + 8 + i * 4}" width="2" height="2" fill="${p.glow}"/>`).join('')
            + `<path d="M24 ${36 - h}v-4" stroke="${p.dark}" stroke-width="1.2"/>`;
    }
    // 前哨は、守りの弧を前に描く
    const shield = c.type === 'outpost'
        ? `<path d="M5 31Q24 44 43 31" stroke="${p.glow}" stroke-width="1.8" fill="none" stroke-linecap="round"/><path d="M8 35Q24 46 40 35" stroke="${p.mid}" stroke-width="1.2" fill="none" stroke-linecap="round" opacity=".8"/>`
        : '';
    return body + shield;
}

export function cardArt(key) {
    const c = CARDS[key];
    const p = PAL[c.faction];
    if (NEUTRAL[key]) return NEUTRAL[key](p);
    if (c.type !== 'ship') return baseArt(c.faction, key);
    const size = sizeOf(key);
    const v = variantOf(key);
    return { federation: federationShip, blob: blobShip, machine: machineShip, empire: empireShip }[c.faction](p, size, v);
}

// ---- 勢力の印（viewBox 24） ----

const EMBLEMS = {
    federation: (p) => `<circle cx="12" cy="12" r="6" fill="${p.hull}"/><ellipse cx="12" cy="12" rx="11" ry="3.6" fill="none" stroke="${p.mid}" stroke-width="2" transform="rotate(-20 12 12)"/>`,
    blob: (p) => `<path d="M12 3c5 0 9 4 8 9-1 4 1 8-4 9-3 .5-4-2-6-1-4 1-7-2-6-6 1-3-1-5 1-8 2-2 4-3 7-3z" fill="${p.hull}"/><circle cx="12" cy="11" r="2.4" fill="${p.dark}"/>`,
    machine: (p) => `<polygon points="12,2 21,7 21,17 12,22 3,17 3,7" fill="${p.hull}"/><polygon points="12,7 16.5,9.5 16.5,14.5 12,17 7.5,14.5 7.5,9.5" fill="${p.dark}"/>`,
    empire: (p) => `<path d="M3 18L5 7l4 5 3-8 3 8 4-5 2 11z" fill="${p.hull}"/><path d="M3 20h18" stroke="${p.mid}" stroke-width="2.4"/>`,
    none: (p) => `<circle cx="12" cy="12" r="7" fill="${p.hull}"/>`
};

const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    log: '<path d="M5 6h14M5 12h14M5 18h9"/>',
    deck: '<rect x="6" y="3" width="12" height="17" rx="2"/><path d="M9 21h9a2 2 0 0 0 2-2V7"/>',
    discard: '<rect x="4" y="6" width="11" height="15" rx="2" transform="rotate(-8 9 13)"/><rect x="9" y="4" width="11" height="15" rx="2" transform="rotate(8 15 11)"/>',
    hand: '<rect x="3" y="6" width="9" height="13" rx="1.5" transform="rotate(-10 7 12)"/><rect x="12" y="5" width="9" height="13" rx="1.5" transform="rotate(10 16 12)"/>',
    scrap: '<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/>'
};

export function symbolsSvg() {
    const keys = Object.keys(CARDS);
    const art = keys.map(key => `<symbol id="c-${key}" viewBox="0 0 48 40">${cardArt(key)}</symbol>`).join('');
    const emblems = Object.entries(EMBLEMS).map(([f, body]) => `<symbol id="e-${f}" viewBox="0 0 24 24">${body(PAL[f])}</symbol>`).join('');
    const icons = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${art}${emblems}${icons}</defs></svg>`;
}

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const emblem = (faction) => `<svg class="emblem" viewBox="0 0 24 24" aria-hidden="true"><use href="#e-${faction}"/></svg>`;

/**
 * カードの面
 * 上の帯：費用と名前。絵。基地は右上に耐久（前哨は塗りの盾）。下に効果の印（主・同盟・廃棄の行）
 */
export function cardHtml(key, { cls = '', attrs = '', detail = false } = {}) {
    const c = CARDS[key];
    const fx = [];
    if (c.primary.length) fx.push(`<span class="fx">${effectsChips(c.primary)}</span>`);
    if (c.ally.length) fx.push(`<span class="fx ally">${emblem(c.faction)}${effectsChips(c.ally)}</span>`);
    if (c.scrap.length) fx.push(`<span class="fx scrap">${icon('scrap')}${effectsChips(c.scrap)}</span>`);
    const def = c.type === 'ship' ? '' : `<span class="def ${c.type}" title="${typeName(key)}・耐久${c.defense}">${c.defense}</span>`;
    const cost = c.cost > 0 ? `<span class="cost">${c.cost}</span>` : '';
    return `<div class="card f-${c.faction} ${c.type} ${detail ? 'detail' : ''} ${cls}" style="--fc:${FACTIONS[c.faction].color}" data-key="${key}" ${attrs}>
        <span class="top">${cost}<span class="name">${c.name}</span></span>
        <span class="pic"><svg class="art" viewBox="0 0 48 40" aria-hidden="true"><use href="#c-${key}"/></svg>${def}</span>
        ${fx.join('')}
    </div>`;
}
