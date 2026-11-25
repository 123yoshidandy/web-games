/**
 * カードと牛の頭の絵（自作の SVG と HTML）
 * 牛の頭は symbol としてページに一度だけ入れ、use で使い回す
 * カードの色は牛の数で変える（1：生成り・2：水色・3：黄・5：赤・7：紫）
 */

import { bullsOf } from './game.js';

// 牛の頭（角・耳・顔・鼻）
const BULL = `<symbol id="bull" viewBox="0 0 24 24">
    <path d="M3 5.5c.6 2.6 2.4 4 4.6 4.2M21 5.5c-.6 2.6-2.4 4-4.6 4.2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
    <path d="M5 10.3c-1.4-.2-2.6.4-3 1.4 1 .9 2.3 1.2 3.6 1M19 10.3c1.4-.2 2.6.4 3 1.4-1 .9-2.3 1.2-3.6 1"/>
    <path d="M12 8.3c3.3 0 5.4 2.1 5.4 5.2 0 1.6-.5 2.9-1.2 4 .3 1.8-1.4 3.4-4.2 3.4s-4.5-1.6-4.2-3.4c-.7-1.1-1.2-2.4-1.2-4 0-3.1 2.1-5.2 5.4-5.2z"/>
    <ellipse cx="10.4" cy="18.4" rx=".75" ry=".6" fill="var(--bull-nose, #fff)"/><ellipse cx="13.6" cy="18.4" rx=".75" ry=".6" fill="var(--bull-nose, #fff)"/>
    <circle cx="9.6" cy="13" r=".9" fill="var(--bull-nose, #fff)"/><circle cx="14.4" cy="13" r=".9" fill="var(--bull-nose, #fff)"/>
</symbol>`;

export const symbolsSvg = () => `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${BULL}</svg>`;

export const bullIcon = (cls = '') => `<svg class="bull ${cls}" viewBox="0 0 24 24" aria-hidden="true"><use href="#bull"/></svg>`;

// カードの表。牛の数で色を変え、上の帯に牛の頭と数、真ん中に大きく番号
export function cardHtml(card, { cls = '', attrs = '' } = {}) {
    const bulls = bullsOf(card);
    return `<div class="card b${bulls} ${card >= 100 ? 'n3' : ''} ${cls}" data-card="${card}" ${attrs} role="img" aria-label="${card}（牛${bulls}）">
        <span class="card-bulls">${bullIcon()}${bulls > 1 ? `<b>${bulls}</b>` : ''}</span>
        <span class="card-num">${card}</span>
    </div>`;
}

export const cardBackHtml = (cls = '') => `<div class="card back ${cls}" aria-hidden="true">${bullIcon('back-bull')}</div>`;
