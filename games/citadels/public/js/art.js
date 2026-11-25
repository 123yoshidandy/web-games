/**
 * 絵（すべて自作の SVG。公式の画像は使っていない）
 * 役割と地区の絵（art-data.js）は symbol としてページに一度だけ入れ、use で使い回す
 * 線のアイコン（ホーム・遊び方など）は viewBox 24×24 で、色は currentColor
 */

import { CHARACTER_ART, DISTRICT_ART } from './art-data.js';
import { CHARACTERS, DISTRICTS, COLORS, cardType, districtPoints } from './cards.js';

// 線のアイコン（24×24）
const ICONS = {
    home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>',
    log: '<path d="M5 6h14M5 12h14M5 18h9"/>',
    crown: '<path d="M4 18l-1-10 5 4 4-7 4 7 5-4-1 10z" fill="currentColor"/>',
    cards: '<rect x="7" y="4" width="11" height="15" rx="2"/><path d="M5 7v12a2 2 0 0 0 2 2h8"/>'
};

export function symbolsSvg() {
    const characters = Object.entries(CHARACTER_ART).map(([key, body]) => `<symbol id="c-${key}" viewBox="0 0 60 80">${body}</symbol>`).join('');
    const districts = Object.entries(DISTRICT_ART).map(([key, body]) => `<symbol id="d-${key}" viewBox="0 0 60 40">${body}</symbol>`).join('');
    const icons = Object.entries(ICONS).map(([key, body]) => `<symbol id="i-${key}" viewBox="0 0 24 24">${body}</symbol>`).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${characters}${districts}${icons}</defs></svg>`;
}

export const icon = (name, cls = '') => `<svg class="ico ${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;
export const coinHtml = (value, cls = '') => `<span class="coin ${cls}">${value}</span>`;

// 役割のカード。cls で大きさや状態を変える
export function characterCard(character, { cls = '', attrs = '' } = {}) {
    const c = CHARACTERS[character];
    return `<div class="card char ${cls}" style="--rc:${c.color}" data-character="${character}" ${attrs}>
        <svg class="art" viewBox="0 0 60 80" aria-hidden="true"><use href="#c-${character}"/></svg>
        <span class="rank">${c.rank}</span>
        <span class="char-name">${c.name}</span>
    </div>`;
}

// 役割の小さな札（名乗りや一覧に添える）
export const characterTag = (character, cls = '') => `<span class="char-tag ${cls}" style="--rc:${CHARACTERS[character].color}"><b>${CHARACTERS[character].rank}</b>${CHARACTERS[character].name}</span>`;

// 地区のカード（札の番号から）
export function districtCard(id, { cls = '', attrs = '' } = {}) {
    const type = cardType(id);
    const d = DISTRICTS[type];
    const points = districtPoints(type);
    return `<div class="card district ${cls}" style="--dc:${COLORS[d.color].hex}" data-card="${id}" data-type="${type}" ${attrs}>
        <svg class="art" viewBox="0 0 60 40" aria-hidden="true"><use href="#d-${type}"/></svg>
        <span class="cost">${d.cost}</span>
        ${points !== d.cost ? `<span class="points">${points}点</span>` : ''}
        <span class="d-name">${d.name}</span>
    </div>`;
}

// 都市の小さな印（色と費用）
export function districtChip(id, cls = '') {
    const d = DISTRICTS[cardType(id)];
    return `<span class="chip ${cls}" style="--dc:${COLORS[d.color].hex}" title="${d.name}">${d.cost}</span>`;
}

// 伏せた役割
export const backCard = (cls = '') => `<div class="card back ${cls}" aria-label="伏せた役割"><span class="emblem"></span></div>`;
