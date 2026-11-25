/**
 * 絵（すべて自作の SVG。公式の画像は使っていない）
 * 役割の絵は symbol としてページに一度だけ入れ、use で使い回す（viewBox 60×80）
 * 線のアイコン（ホーム・遊び方など）は viewBox 24×24 で、色は currentColor
 */

import { ROLES } from './roles.js';

const SKIN = '#f1c9a5';
const SKIN_LINE = '#b98a66';

// 顔（目と口）
const face = (cx, cy) => `<circle cx="${cx}" cy="${cy}" r="9" fill="${SKIN}" stroke="${SKIN_LINE}" stroke-width="1"/>
    <circle cx="${cx - 3.2}" cy="${cy - .5}" r="1.1" fill="#3a2a20"/><circle cx="${cx + 3.2}" cy="${cy - .5}" r="1.1" fill="#3a2a20"/>`;

const ART = {
    duke: `
        <path d="M10 80c0-18 8-30 20-30s20 12 20 30z" fill="#7b3fae"/>
        <path d="M22 52l8 12 8-12" fill="#f4d061" stroke="#b48a1e" stroke-width="1"/>
        <path d="M30 64v16" stroke="#f4d061" stroke-width="2"/>
        <path d="M14 58c4 6 10 8 16 8s12-2 16-8" fill="none" stroke="#e9e1f2" stroke-width="3"/>
        ${face(30, 36)}
        <path d="M24 42c2 3 10 3 12 0" fill="none" stroke="#8a5a3a" stroke-width="1.2"/>
        <path d="M27 44c1 6 5 6 6 0" fill="#7a5a44"/>
        <path d="M19 26l3-10 5 6 3-9 3 9 5-6 3 10z" fill="#f4d061" stroke="#b48a1e" stroke-width="1"/>
        <circle cx="30" cy="13" r="1.6" fill="#d9463a"/><circle cx="22" cy="16" r="1.2" fill="#3a8ad9"/><circle cx="38" cy="16" r="1.2" fill="#3a8ad9"/>`,
    assassin: `
        <path d="M8 80c0-20 8-34 22-34s22 14 22 34z" fill="#2b2e36"/>
        <path d="M14 46c0-22 7-34 16-36 9 2 16 14 16 36-4-4-10-6-16-6s-12 2-16 6z" fill="#3d414d"/>
        <path d="M20 42c0-10 4-16 10-16s10 6 10 16c-3-2-6-3-10-3s-7 1-10 3z" fill="#1c1e24"/>
        <path d="M24 34l4 1M36 34l-4 1" stroke="#e8e2d0" stroke-width="1.8" stroke-linecap="round"/>
        <path d="M24 38h12" stroke="#5a2f2f" stroke-width="5" stroke-linecap="round"/>
        <path d="M44 56l8-18 2 1-6 19z" fill="#d6dde3" stroke="#8b96a0" stroke-width="1"/>
        <path d="M41 56h10" stroke="#a3713f" stroke-width="3" stroke-linecap="round"/>
        <path d="M45 57v6" stroke="#a3713f" stroke-width="3" stroke-linecap="round"/>`,
    ambassador: `
        <path d="M10 80c0-18 8-30 20-30s20 12 20 30z" fill="#2f8a57"/>
        <path d="M24 50l6 30 6-30" fill="#f5f1e6"/>
        <path d="M28 52l2 6 2-6" fill="#c8433a"/>
        ${face(30, 36)}
        <path d="M21 32c0-8 4-12 9-12s9 4 9 12c-2-3-5-5-9-5s-7 2-9 5z" fill="#6b4a32"/>
        <path d="M26 41c2 2 6 2 8 0" fill="none" stroke="#8a5a3a" stroke-width="1.2"/>
        <rect x="38" y="58" width="14" height="18" rx="2" fill="#f4ead2" stroke="#a88b56" stroke-width="1" transform="rotate(-12 45 67)"/>
        <path d="M41 63h8M41 67h8M41 71h6" stroke="#a88b56" stroke-width="1" transform="rotate(-12 45 67)"/>
        <circle cx="42" cy="74" r="2.4" fill="#c8433a" transform="rotate(-12 45 67)"/>`,
    captain: `
        <path d="M10 80c0-18 8-30 20-30s20 12 20 30z" fill="#2563a8"/>
        <path d="M20 54h20v4H20z" fill="#f4d061"/>
        <circle cx="24" cy="64" r="1.6" fill="#f4d061"/><circle cx="36" cy="64" r="1.6" fill="#f4d061"/>
        <circle cx="24" cy="71" r="1.6" fill="#f4d061"/><circle cx="36" cy="71" r="1.6" fill="#f4d061"/>
        ${face(30, 38)}
        <path d="M22 44c3 5 13 5 16 0-1 6-4 8-8 8s-7-2-8-8z" fill="#5a3e2c"/>
        <path d="M8 28c6 2 14-10 22-10s16 12 22 10c-2 4-6 6-10 6H18c-4 0-8-2-10-6z" fill="#1d3557"/>
        <path d="M12 30c6 2 30 2 36 0" stroke="#f4d061" stroke-width="1.4" fill="none"/>
        <path d="M30 20v8M27 24h6M27 28c1 2 5 2 6 0" stroke="#f4d061" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,
    contessa: `
        <path d="M8 80c2-18 10-28 22-28s20 10 22 28z" fill="#c23a32"/>
        <path d="M18 56c4 4 8 5 12 5s8-1 12-5" fill="none" stroke="#f0d9a8" stroke-width="2.4"/>
        <path d="M17 50c-6 6-6 16-4 22 6-6 6-14 4-22zM43 50c6 6 6 16 4 22-6-6-6-14-4-22z" fill="#4a2a1a"/>
        <path d="M18 46c-2-14 3-24 12-24s14 10 12 24c-1 4-3 6-4 6 0-6-2-12-8-14-6 2-8 8-8 14-1 0-3-2-4-6z" fill="#5a3320"/>
        ${face(30, 37)}
        <path d="M26 43c2 1.6 6 1.6 8 0" fill="none" stroke="#b03a3a" stroke-width="1.4" stroke-linecap="round"/>
        <path d="M22 26l3-5 2 3 3-5 3 5 2-3 3 5" fill="none" stroke="#e8e8ef" stroke-width="1.6" stroke-linejoin="round"/>
        <circle cx="30" cy="19" r="1.6" fill="#7fd0e6"/>
        <path d="M40 72l12-14a8 8 0 0 1-2 14z" fill="#f0d9a8" stroke="#b48a1e" stroke-width="1"/>
        <path d="M40 72l10-10M40 72l12-8M40 72l8-12" stroke="#b48a1e" stroke-width=".8"/>`
};

// 線のアイコン（24×24）
const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    log: '<path d="M5 6h14M5 12h14M5 18h9"/>'
};

export function symbolsSvg() {
    const art = Object.entries(ART).map(([key, body]) => `<symbol id="r-${key}" viewBox="0 0 60 80">${body}</symbol>`).join('');
    const icons = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${art}${icons}</defs></svg>`;
}

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const coinHtml = (value, cls = '') => `<span class="coin ${cls}">${value}</span>`;

// 役割のカード（表）。cls で大きさや状態（lost・pick など）を変える
export function cardHtml(role, { cls = '', attrs = '' } = {}) {
    const r = ROLES[role];
    return `<div class="card face ${cls}" style="--rc:${r.color}" data-role="${role}" ${attrs}>
        <svg class="art" viewBox="0 0 60 80" aria-hidden="true"><use href="#r-${role}"/></svg>
        <span class="role-name">${r.name}</span>
        <span class="role-short">${r.name[0]}</span>
    </div>`;
}

// 伏せたカード（裏）
export const backHtml = (cls = '') => `<div class="card back ${cls}" aria-label="伏せた札"><span class="emblem"></span></div>`;

// 役割の小さな札（名乗りやボタンに添える）
export const roleTag = (role) => `<span class="role-tag" style="--rc:${ROLES[role].color}">${ROLES[role].name}</span>`;
