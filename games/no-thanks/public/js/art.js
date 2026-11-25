/**
 * カードとチップの絵（自作の SVG と HTML）
 * チップは symbol としてページに一度だけ入れ、use で使い回す
 * カードの色は数の大きさで3段階に変える（3〜12：青緑・13〜24：琥珀・25〜35：紅）。大きいほど痛い
 */

import { runsOf } from './game.js';

// チップ（縁に刻みのある丸い札）
const CHIP = `<symbol id="chip" viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="11" fill="var(--chip-edge, #b8861b)"/>
    <circle cx="12" cy="12" r="11" fill="none" stroke="var(--chip, #f5c04a)" stroke-width="3.2" stroke-dasharray="3.1 2.66"/>
    <circle cx="12" cy="12" r="7.4" fill="var(--chip, #f5c04a)"/>
    <circle cx="12" cy="12" r="5" fill="none" stroke="var(--chip-edge, #b8861b)" stroke-width="1.1" opacity=".7"/>
</symbol>`;

export const symbolsSvg = () => `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${CHIP}</svg>`;

export const chipIcon = (cls = '') => `<svg class="chip ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#chip"/></svg>`;

export const tierOf = (card) => (card <= 12 ? 1 : card <= 24 ? 2 : 3);

// カードの表。真ん中に大きく数、左上と右下に小さく数、斜めの帯の模様
export function cardHtml(card, { cls = '', attrs = '' } = {}) {
    return `<div class="card t${tierOf(card)} ${cls}" data-card="${card}" ${attrs} role="img" aria-label="${card}">
        <span class="card-band"></span>
        <span class="card-corner tl">${card}</span>
        <span class="card-num">${card}</span>
        <span class="card-corner br">${card}</span>
    </div>`;
}

export const cardBackHtml = (cls = '') => `<div class="card back ${cls}" aria-hidden="true"><span class="back-mark">?</span></div>`;

// 取ったカード。連続した数は1つの札にまとめ、数える一番小さい数を大きく出す。
// hot：めくってあるカードがつながる札（光らせる）
export function runsHtml(cards, hot = null) {
    return runsOf(cards).map(run => {
        const first = run[0];
        const last = run.at(-1);
        const linked = hot !== null && (hot === first - 1 || hot === last + 1);
        const rest = run.length > 1 ? `<small>–${last}</small>` : '';
        return `<span class="run t${tierOf(first)} ${run.length > 1 ? 'chain' : ''} ${linked ? 'linked' : ''}" data-run="${first}" title="${run.join('・')}"><b>${first}</b>${rest}</span>`;
    }).join('');
}

// チップの山（多いときは数だけ増やし、絵は12枚まで）
export function potHtml(pot) {
    const shown = Math.min(pot, 12);
    const chips = Array.from({ length: shown }, (_, i) => {
        // 毎回同じ位置に散らす（乱数を使わず、番号から決める）
        const x = ((i * 37) % 23) - 11;
        const y = -i * 3;
        const r = ((i * 53) % 40) - 20;
        return `<span class="pot-chip" style="transform: translate(${x}px, ${y}px) rotate(${r}deg)">${chipIcon()}</span>`;
    }).join('');
    return `<div class="pot-pile">${chips}</div>`;
}
