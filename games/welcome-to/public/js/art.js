/**
 * 絵（自作の SVG）
 * - 効果のアイコン：色の四角に白い絵（測量士はフェンス、不動産屋はコイン、造園家は木、プール業者は水、派遣はバリケード、ビスは郵便受け）
 * - 得点表の通り：家を1軒 30×34 の箱に描き、3本の通りを左そろえで並べる。通りの下に公園（木）の列
 */

import { STREET_SIZES, POOL_SPOTS, PARK_SCORES } from './cards.js';

// 効果のアイコン（40×40）
const GLYPHS = {
    surveyor: '<path d="M9 30V14l3-4 3 4v16M18.5 30V14l3-4 3 4v16M28 30V14l3-4 3 4v16" class="g-line"/><path d="M6 18h31M6 25h31" class="g-line"/>',
    estate: '<ellipse cx="16" cy="27" rx="9" ry="4" class="g-fill"/><ellipse cx="16" cy="22" rx="9" ry="4" class="g-fill"/><ellipse cx="25" cy="17" rx="9" ry="4" class="g-fill"/><path d="M27 6v8M23.5 9.5 27 6l3.5 3.5" class="g-line"/>',
    park: '<path d="M20 34V22" class="g-line"/><circle cx="20" cy="15" r="8" class="g-fill"/><circle cx="13" cy="20" r="5.5" class="g-fill"/><circle cx="27" cy="20" r="5.5" class="g-fill"/>',
    pool: '<rect x="7" y="12" width="26" height="18" rx="6" class="g-line"/><path d="M10 19c3-2.5 5 2.5 8 0s5 2.5 8 0 4 1 5 .5M10 25c3-2.5 5 2.5 8 0s5 2.5 8 0 4 1 5 .5" class="g-line thin"/><path d="M27 12V7a2 2 0 0 1 4 0" class="g-line thin"/>',
    temp: '<path d="M8 32h24M12 32l8-24 8 24" class="g-line"/><path d="M14 25h12M16.5 18h7" class="g-line thin"/>',
    bis: '<rect x="8" y="11" width="22" height="14" rx="7" class="g-line"/><path d="M19 25v9M13 34h12" class="g-line"/><path d="M30 18h4v-6" class="g-line thin"/>'
};

export function effectIcon(kind) {
    return `<svg class="effect-icon e-${kind}" viewBox="0 0 40 40" aria-hidden="true"><rect x="1" y="1" width="38" height="38" rx="8" class="g-bg"/>${GLYPHS[kind] ?? ''}</svg>`;
}

// ---- 得点表の通り ----

export const HOUSE_W = 30;
const HOUSE_H = 34;
const ROW_H = 66;
const TOP = 12;      // プールの印の分
const PAD = 4;
export const SHEET_W = HOUSE_W * 12 + PAD * 2;
export const SHEET_H = ROW_H * 3 + PAD * 2;

const houseX = (h) => PAD + h * HOUSE_W;
const rowY = (s) => PAD + s * ROW_H;

// opts：{ targets（家を光らせる。Set of 'street:house'）, bisTargets（同じ）, fenceTargets（Set of 'street:pos'）,
//         fresh（この手に書いた家）, selected（選んだ家）, small }
export function sheetSvg(sheet, opts = {}) {
    const { targets, bisTargets, fenceTargets, fresh, small } = opts;
    const parts = [];
    for (let s = 0; s < 3; s++) {
        const y = rowY(s);
        // 通りの道と公園
        parts.push(`<rect x="${PAD}" y="${y + TOP + HOUSE_H - 2}" width="${STREET_SIZES[s] * HOUSE_W}" height="6" rx="2" class="s-road"/>`);
        const parkY = y + TOP + HOUSE_H + 10;
        for (let i = 0; i < PARK_SCORES[s].length - 1; i++) {
            parts.push(`<circle cx="${PAD + 8 + i * 15}" cy="${parkY}" r="5" class="s-park${i < sheet.parks[s] ? ' built' : ''}"/>`);
        }
        parts.push(`<text x="${PAD + 8 + (PARK_SCORES[s].length - 1) * 15}" y="${parkY + 4}" class="s-park-pts">${PARK_SCORES[s][sheet.parks[s]]}</text>`);
        // 完成した家並み・計画に使った家並み
        let start = 0;
        for (let h = 0; h < STREET_SIZES[s]; h++) {
            if (h === STREET_SIZES[s] - 1 || sheet.fences[s][h]) {
                const size = h - start + 1;
                const full = sheet.houses[s].slice(start, h + 1).every(Boolean);
                if (full && size <= 6) {
                    parts.push(`<rect x="${houseX(start) + 1}" y="${y + TOP - 1}" width="${size * HOUSE_W - 2}" height="${HOUSE_H + 2}" rx="5" class="s-estate${sheet.used[s][start] ? ' used' : ''}"/>`);
                }
                start = h + 1;
            }
        }
        for (let h = 0; h < STREET_SIZES[s]; h++) {
            const x = houseX(h);
            const house = sheet.houses[s][h];
            const key = `${s}:${h}`;
            const classes = ['s-house'];
            if (house) classes.push('built');
            if (fresh?.has(key)) classes.push('fresh');
            if (targets?.has(key)) classes.push('target');
            if (bisTargets?.has(key)) classes.push('target', 'bis-target');
            const roof = `M${x + 3},${y + TOP + 11} L${x + 15},${y + TOP + 2} L${x + 27},${y + TOP + 11} V${y + TOP + HOUSE_H - 4} H${x + 3} Z`;
            let label = '';
            if (house) {
                label = `<text x="${x + 15}" y="${y + TOP + 27}" class="s-num${house.n >= 10 ? ' wide' : ''}">${house.n}</text>`;
                if (house.bis) label += `<text x="${x + 15}" y="${y + TOP + 32.5}" class="s-bis">bis</text>`;
            }
            const pool = POOL_SPOTS[s].includes(h)
                ? `<ellipse cx="${x + 15}" cy="${y + 6}" rx="9" ry="4" class="s-pool${sheet.pools[s][h] ? ' built' : ''}"/>`
                : '';
            const used = sheet.used[s][h] ? `<rect x="${x + 1}" y="${y + TOP - 4}" width="${HOUSE_W - 2}" height="3" rx="1.5" class="s-used"/>` : '';
            parts.push(`<g class="${classes.join(' ')}" data-street="${s}" data-house="${h}">${pool}${used}<path d="${roof}" class="s-body"/>${label}<rect x="${x}" y="${y}" width="${HOUSE_W}" height="${ROW_H}" class="s-hit"/></g>`);
        }
        // フェンス（両端は、はじめからある）
        const fy1 = y + TOP - 2;
        const fy2 = y + TOP + HOUSE_H + 3;
        parts.push(`<path d="M${houseX(0)},${fy1} V${fy2} M${houseX(STREET_SIZES[s])},${fy1} V${fy2}" class="s-fence edge"/>`);
        for (let i = 0; i < STREET_SIZES[s] - 1; i++) {
            const fx = houseX(i + 1);
            if (sheet.fences[s][i]) parts.push(`<path d="M${fx},${fy1} V${fy2}" class="s-fence"/>`);
            else if (fenceTargets?.has(`${s}:${i}`)) {
                parts.push(`<g class="s-fence-spot" data-street="${s}" data-fence="${i}"><path d="M${fx},${fy1} V${fy2}" class="s-fence-hint"/><rect x="${fx - HOUSE_W / 2}" y="${y}" width="${HOUSE_W}" height="${ROW_H}" class="s-hit"/></g>`);
            }
        }
    }
    return `<svg class="sheet-svg${small ? ' small' : ''}" viewBox="0 0 ${SHEET_W} ${SHEET_H}" role="img" aria-label="得点表の通り">${parts.join('')}</svg>`;
}

// 都市計画の家並みの大きさ（数字の箱を並べる）
export function planSizesHtml(sizes) {
    return `<span class="plan-sizes">${sizes.map(n => `<i>${n}</i>`).join('')}</span>`;
}

export const LINE_ICONS = {
    home: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5"/></svg>',
    help: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.2v.1"/></svg>',
    people: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2M16 5.2a3 3 0 0 1 0 5.6M18 13.9c1.7.7 2.8 2.4 3 5.1"/></svg>',
    undo: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/></svg>'
};

