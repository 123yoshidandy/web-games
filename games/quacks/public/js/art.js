/**
 * 絵（材料の札・渦巻きの鍋・アイコン）
 * 鍋は SVG で描く。マスはまん中の 0 から外へ、渦巻きにそって同じ間隔で並べる
 */

import { TRACK, LAST_SPACE, chipColor, chipValue } from './data.js';

export const CHIP_COLORS = {
    W: { fill: '#f4efe3', edge: '#b9ae97', text: '#4a3f33' },
    O: { fill: '#f08a24', edge: '#a8530d', text: '#fff' },
    G: { fill: '#3ea64a', edge: '#21692a', text: '#fff' },
    B: { fill: '#2f6bd1', edge: '#173f86', text: '#fff' },
    R: { fill: '#d6353b', edge: '#8a1a1f', text: '#fff' },
    Y: { fill: '#f1c623', edge: '#a17f06', text: '#4a3a05' },
    P: { fill: '#8a4fc2', edge: '#55287e', text: '#fff' },
    K: { fill: '#2a2830', edge: '#8d8796', text: '#f1ecf6' }
};

const VIEW = 400;
const CENTER = VIEW / 2;
const RING_GAP = 38;      // 渦巻きの1周ごとの間
const STEP = 36.5;         // となりのマスとの間
const FIRST_R = 56;       // 1のマスの、まん中からの距離
export const CHIP_R = 16.5;

// マスの位置（0 はまん中）
export const SPACES = (() => {
    const b = RING_GAP / (2 * Math.PI);
    const points = [{ x: CENTER, y: CENTER }];
    let theta = FIRST_R / b;
    for (let i = 1; i <= LAST_SPACE; i++) {
        const r = b * theta;
        // 上から時計回りに始める
        const angle = theta - FIRST_R / b - Math.PI / 2;
        points.push({ x: CENTER + r * Math.cos(angle), y: CENTER + r * Math.sin(angle) });
        theta += STEP / r; // 弧の長さが STEP になるように進める
    }
    return points;
})();

const spiralPath = () => SPACES.slice(1).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');

// 材料の札（単体の SVG）
export function chipSvg(chip, { cls = '' } = {}) {
    const c = CHIP_COLORS[chipColor(chip)];
    return `<svg class="chip ${cls}" viewBox="0 0 40 40" aria-label="${chip}"><circle cx="20" cy="20" r="18" fill="${c.fill}" stroke="${c.edge}" stroke-width="2.5"/>`
        + `<circle cx="20" cy="20" r="13" fill="none" stroke="${c.edge}" stroke-width="1" opacity=".45"/>`
        + `<text x="20" y="21" fill="${c.text}">${chipValue(chip)}</text></svg>`;
}

// 鍋の中の札（SVG の中に置く g）
function chipG(chip, pos, { cls = '', index = 0 } = {}) {
    const c = CHIP_COLORS[chipColor(chip)];
    const { x, y } = SPACES[pos];
    return `<g class="pot-chip ${cls}" data-index="${index}" data-pos="${pos}" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">`
        + `<g class="pc-inner"><circle r="${CHIP_R}" fill="${c.fill}" stroke="${c.edge}" stroke-width="2.4"/>`
        + `<circle r="${CHIP_R - 5}" fill="none" stroke="${c.edge}" stroke-width="1" opacity=".45"/>`
        + `<text y="1" fill="${c.text}">${chipValue(chip)}</text></g></g>`;
}

// 鍋全体。player はビューのプレイヤー。mini は小さい表示（数字を省く）
export function potSvg(player, { mini = false, newFrom = Infinity, hideIndex = -1 } = {}) {
    const brew = player.brew;
    const start = brew?.start ?? player.droplet;
    const last = brew ? brew.pos : start;
    const scoring = Math.min(LAST_SPACE, last + 1);
    const exploded = !!brew?.exploded;
    const spaces = SPACES.map((p, i) => {
        if (i === 0) return '';
        const [coins, , ruby] = TRACK[i];
        const label = mini ? '' : `<text class="sp-coin" x="${p.x.toFixed(1)}" y="${(p.y + 1).toFixed(1)}">${coins}</text>`;
        const gem = ruby ? `<path class="sp-ruby" d="M${(p.x + 9).toFixed(1)} ${(p.y - 15).toFixed(1)} l4.5 4.5 -4.5 4.5 -4.5 -4.5z"/>` : '';
        return `<g class="sp ${i <= start ? 'behind' : ''} ${i === scoring && brew ? 'scoring' : ''}"><circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${CHIP_R - 1}"/>${label}${gem}</g>`;
    }).join('');
    const chips = player.pot.map((e, i) => chipG(e.chip, e.pos, { index: i, cls: `${i >= newFrom ? 'fresh' : ''} ${i === hideIndex ? 'hidden' : ''}` })).join('');
    const drop = SPACES[Math.min(player.droplet, LAST_SPACE)];
    const ratPos = SPACES[Math.min(start, LAST_SPACE)];
    const rat = brew && start > player.droplet
        ? `<g class="rat" transform="translate(${ratPos.x.toFixed(1)} ${ratPos.y.toFixed(1)})">${ratIcon()}</g>` : '';
    const dropletMark = `<g class="droplet-mark" transform="translate(${drop.x.toFixed(1)} ${drop.y.toFixed(1)})"><path d="M0 -13 C6 -4 10 1 10 5 A10 10 0 0 1 -10 5 C-10 1 -6 -4 0 -13z"/></g>`;
    return `<svg class="pot-svg ${mini ? 'mini' : ''} ${exploded ? 'exploded' : ''}" viewBox="0 0 ${VIEW} ${VIEW}" aria-hidden="true">`
        + `<defs><radialGradient id="brew-${mini ? 'm' : 'l'}${player.id}" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="var(--brew-in)"/><stop offset="1" stop-color="var(--brew-out)"/></radialGradient></defs>`
        + `<circle class="pot-rim" cx="${CENTER}" cy="${CENTER}" r="196"/>`
        + `<circle class="pot-brew" cx="${CENTER}" cy="${CENTER}" r="186" fill="url(#brew-${mini ? 'm' : 'l'}${player.id})"/>`
        + `<path class="pot-groove" d="${spiralPath()}"/>`
        + spaces + dropletMark + rat + chips + `</svg>`;
}

export function ratIcon() {
    return `<g class="rat-g"><ellipse cx="0" cy="2" rx="9" ry="6.5"/><circle cx="8" cy="-2" r="4.5"/><circle cx="9" cy="-6.5" r="2.4" class="ear"/>`
        + `<path d="M-9 3 C-15 4 -16 -4 -12 -7" fill="none" class="tail"/></g>`;
}

// 線のアイコン（viewBox 0 0 24 24）
export const ICONS = {
    home: '<path d="M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.2v.1"/>',
    flask: '<path d="M9.5 3.5h5M10.5 3.5v5L5 18.5A1.6 1.6 0 0 0 6.4 21h11.2a1.6 1.6 0 0 0 1.4-2.5L13.5 8.5v-5"/>',
    bag: '<path d="M8 7.5c-1-1.6-1-3.5.5-4h7c1.5.5 1.5 2.4.5 4M7 7.5h10M7.2 7.5C4.5 10 3.5 13.5 4.5 17c.8 2.6 3.6 3.8 7.5 3.8s6.7-1.2 7.5-3.8c1-3.5 0-7-2.7-9.5"/>',
    card: '<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M12 8.5l1.2 2.4 2.6.4-1.9 1.8.5 2.6-2.4-1.3-2.4 1.3.5-2.6-1.9-1.8 2.6-.4z"/>',
    back: '<path d="M14.5 5.5 8 12l6.5 6.5"/>'
};
export const icon = (name, cls = '') => `<svg class="line-icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// ルビー・点・しずくの小さな印
export const rubyMark = () => '<svg class="mark ruby-mark" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 1 11 6 6 11 1 6z"/></svg>';
export const dropMark = () => '<svg class="mark drop-mark" viewBox="0 0 12 14" aria-hidden="true"><path d="M6 1C9 5 11 7.5 11 9.3A5 5 0 0 1 1 9.3C1 7.5 3 5 6 1z"/></svg>';
export const starMark = () => '<svg class="mark star-mark" viewBox="0 0 12 12" aria-hidden="true"><path d="M6 .8l1.6 3.3 3.6.5-2.6 2.5.6 3.6L6 9 2.8 10.7l.6-3.6L.8 4.6l3.6-.5z"/></svg>';
export const flaskMark = (full) => `<svg class="mark flask-mark ${full ? 'full' : 'empty'}" viewBox="0 0 24 24" aria-hidden="true">`
    + `${full ? '<path class="liquid" d="M7 15h10l2 3.5a1.6 1.6 0 0 1-1.4 2.5H6.4A1.6 1.6 0 0 1 5 18.5z"/>' : ''}${ICONS.flask}</svg>`;

// タイトルの絵：鍋と、飛び込む材料
export function titleArt() {
    const chips = ['O1', 'R2', 'B4', 'W1', 'G2', 'Y1'];
    return `<svg class="title-pot" viewBox="0 0 240 170" aria-hidden="true">
        <ellipse cx="120" cy="158" rx="78" ry="9" class="t-shadow"/>
        <path class="t-pot" d="M40 70 h160 c4 0 6 3 5 7 C196 128 170 156 120 156 S44 128 35 77 c-1-4 1-7 5-7z"/>
        <ellipse cx="120" cy="72" rx="82" ry="15" class="t-rim"/>
        <ellipse cx="120" cy="72" rx="72" ry="10" class="t-brew"/>
        <circle cx="96" cy="66" r="5" class="t-bubble"/><circle cx="140" cy="63" r="3.5" class="t-bubble"/><circle cx="118" cy="60" r="2.5" class="t-bubble"/>
        <path class="t-leg" d="M62 140 l-8 18 M178 140 l8 18"/>
        ${chips.map((chip, i) => {
            const x = 40 + i * 32;
            const y = 18 + (i % 2) * 16;
            return `<g transform="translate(${x} ${y}) rotate(${(i - 2.5) * 3})"><g transform="translate(-14 -14) scale(.7)">${chipSvg(chip).replace('<svg', '<svg width="40" height="40"')}</g></g>`;
        }).join('')}
    </svg>`;
}
