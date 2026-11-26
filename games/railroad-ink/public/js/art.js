/**
 * 絵（自作の SVG）。タイルは 100×100 の箱に描き、盤はそれを並べる
 * 道：灰色の帯に白い破線。線路：濃い線に枕木。駅：中央の黒い四角。高架：道が線路の上を渡る
 */

import { SIZE, EXITS, CENTER, index, shapeOf } from './tiles.js';

const MID = [[50, 0], [100, 50], [50, 100], [0, 50]];   // 辺の中点

// 辺 a から辺 b への線（隣り合う辺なら曲線、向かい合う辺なら直線）
function between(a, b) {
    const [ax, ay] = MID[a];
    const [bx, by] = MID[b];
    if ((a + 2) % 4 === b) return `M${ax},${ay} L${bx},${by}`;
    return `M${ax},${ay} Q50,50 ${bx},${by}`;
}
const toCenter = (d) => `M${MID[d][0]},${MID[d][1]} L50,50`;

function stroke(type, d, { bridge = false } = {}) {
    if (type === 'road') {
        return (bridge ? `<path d="${d}" class="r-bridge"/>` : '')
            + `<path d="${d}" class="r-road"/><path d="${d}" class="r-road-line"/>`;
    }
    return `<path d="${d}" class="r-ties"/><path d="${d}" class="r-rail"/>`;
}

// タイルの中身（100×100）
export function tileContent(kind, o) {
    const shape = shapeOf(kind, o);
    const parts = [];
    const groups = [];
    for (let g = 0; g < shape.groupCount; g++) groups.push([0, 1, 2, 3].filter(d => shape.group[d] === g && shape.edges[d]));
    // 線路を先に、道をあとに描く（高架では道が上を渡る）
    const order = groups.map((edges, g) => ({ edges, g, rail: edges.every(d => shape.edges[d] === 'rail') }))
        .sort((a, b) => Number(b.rail) - Number(a.rail));
    const isOverpass = kind === 'overpass';
    order.forEach(({ edges }) => {
        const types = new Set(edges.map(d => shape.edges[d]));
        if (types.size === 1 && edges.length === 2) {
            parts.push(stroke([...types][0], between(edges[0], edges[1]), { bridge: isOverpass && types.has('road') }));
        } else {
            // 分かれ道や駅は、各辺から中央へ。線路を先に
            edges.filter(d => shape.edges[d] === 'rail').forEach(d => parts.push(stroke('rail', toCenter(d))));
            edges.filter(d => shape.edges[d] === 'road').forEach(d => parts.push(stroke('road', toCenter(d))));
        }
    });
    if (TILE_STATION(kind)) parts.push('<rect x="38" y="38" width="24" height="24" class="r-station"/>');
    return parts.join('');
}
const TILE_STATION = (kind) => kind.startsWith('station') || ['s1', 's2', 's5', 's6'].includes(kind);

// タイル1枚の SVG（ダイスや特別なタイルの表示に使う）
export function tileSvg(kind, o = 0, cls = 'tile') {
    return `<svg viewBox="0 0 100 100" class="${cls}" aria-hidden="true">${tileContent(kind, o)}</svg>`;
}

const M = 26;              // 盤のまわりの余白（出口を描く）
export const BOARD_VIEW = SIZE * 100 + M * 2;

// 盤の SVG。opts: { preview: { x, y, kind, o, ok }, legal: Set<マス>, fresh: Set<マス>, small }
export function boardSvg(cells, opts = {}) {
    const out = [];
    out.push(`<rect x="0" y="0" width="${BOARD_VIEW}" height="${BOARD_VIEW}" rx="18" class="b-frame"/>`);
    out.push(`<rect x="${M}" y="${M}" width="${SIZE * 100}" height="${SIZE * 100}" class="b-paper"/>`);
    out.push(`<rect x="${M + 200}" y="${M + 200}" width="300" height="300" class="b-center"/>`);
    // 出口
    EXITS.forEach(e => {
        const vertical = e.dir === 0 || e.dir === 2;
        // 盤の縁から外へ、短い道・線路を描く
        const edgeX = M + (e.x + 0.5 + (e.dir === 3 ? 0.5 : e.dir === 1 ? -0.5 : 0)) * 100;
        const edgeY = M + (e.y + 0.5 + (e.dir === 0 ? 0.5 : e.dir === 2 ? -0.5 : 0)) * 100;
        const len = M - 4;
        const ox = vertical ? 0 : (e.dir === 1 ? len : -len);
        const oy = vertical ? (e.dir === 2 ? len : -len) : 0;
        const d = `M${edgeX},${edgeY} L${edgeX + ox},${edgeY + oy}`;
        out.push(`<g class="b-exit ${e.type}">${stroke(e.type, d)}</g>`);
    });
    // マス
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            const i = index(x, y);
            const c = cells[i];
            const classes = ['b-cell'];
            if (opts.legal?.has(i)) classes.push('legal');
            if (opts.fresh?.has(i)) classes.push('fresh');
            if (CENTER(x, y)) classes.push('center');
            out.push(`<g transform="translate(${M + x * 100},${M + y * 100})" class="${classes.join(' ')}" data-cell="${i}">`
                + `<rect width="100" height="100" class="b-hit"/>`
                + (c ? `<g class="b-tile${c.special ? ' special' : ''}">${tileContent(c.kind, c.o)}</g>` : '')
                + (c && !opts.small && c.round ? `<text x="88" y="16" class="b-round">${c.round}</text>` : '')
                + '</g>');
        }
    }
    // 格子
    let grid = '';
    for (let k = 1; k < SIZE; k++) grid += `M${M + k * 100},${M} V${M + SIZE * 100} M${M},${M + k * 100} H${M + SIZE * 100} `;
    out.push(`<path d="${grid}" class="b-grid"/>`);
    out.push(`<rect x="${M}" y="${M}" width="${SIZE * 100}" height="${SIZE * 100}" class="b-border"/>`);
    // 置いたときの姿
    const p = opts.preview;
    if (p) {
        out.push(`<g transform="translate(${M + p.x * 100},${M + p.y * 100})" class="b-preview ${p.ok ? 'ok' : 'ng'}">`
            + `<rect width="100" height="100" class="b-preview-bg"/>${p.kind ? tileContent(p.kind, p.o) : ''}`
            + `<rect x="3" y="3" width="94" height="94" rx="6" class="b-preview-frame"/></g>`);
    }
    return `<svg viewBox="0 0 ${BOARD_VIEW} ${BOARD_VIEW}" class="board-svg${opts.small ? ' small' : ''}" role="img" aria-label="ボード">${out.join('')}</svg>`;
}

// 線で描いたボタンのアイコン
export const LINE_ICONS = {
    home: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5"/></svg>',
    hint: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18h6M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.1V16h5v-.1c0-.8.4-1.6 1.1-2.1A6 6 0 0 0 12 3z"/></svg>',
    help: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.2v.1"/></svg>',
    people: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2M16 5.2a3 3 0 0 1 0 5.6M18 13.9c1.7.7 2.8 2.4 3 5.1"/></svg>',
    rotate: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v4.5h-4.5"/></svg>',
    flip: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v18M9 7 4 12l5 5V7ZM15 7l5 5-5 5V7Z"/></svg>',
    undo: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3"/></svg>'
};
