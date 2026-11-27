/**
 * 島の地図（SVG の文字列を作る）。ビューだけを見て描く
 * 駒は図柄（symbol）をページに一度だけ入れ、use で使い回す
 */

import { LAND_SHAPES, OCEAN_SHAPE, BOARD_W, BOARD_H, LAYOUTS, BOARD_LETTERS, SPIRITS, INVADER_CARD } from './data.js';

export const TERRAIN_COLORS = { M: '#a29d8c', W: '#5ea79b', J: '#4f8b3f', S: '#d8b469' };
const OCEAN = '#245f8a';

// 駒の図柄（viewBox 0 0 20 20）
export const SYMBOLS = `
<symbol id="sym-E" viewBox="0 0 20 20"><circle cx="10" cy="11" r="6.5" fill="#f4efe2" stroke="#2b2b2b" stroke-width="1.6"/><path d="M6 8.5h8l-1.2-3.5h-5.6z" fill="#2b2b2b"/></symbol>
<symbol id="sym-T" viewBox="0 0 20 20"><path d="M3 18V9.5L10 3.5l7 6V18z" fill="#efe4cf" stroke="#2b2b2b" stroke-width="1.6" stroke-linejoin="round"/><rect x="8.2" y="12" width="3.6" height="6" fill="#2b2b2b"/></symbol>
<symbol id="sym-C" viewBox="0 0 20 20"><path d="M2.5 18V7h3V4.5h2.5V7h4V4.5h2.5V7h3v11z" fill="#d6ccb8" stroke="#2b2b2b" stroke-width="1.6" stroke-linejoin="round"/><path d="M8.3 18v-5a1.7 1.7 0 0 1 3.4 0v5" fill="#2b2b2b"/></symbol>
<symbol id="sym-D" viewBox="0 0 20 20"><circle cx="10" cy="5.5" r="3.2" fill="#7a3f22" stroke="#2b1a10" stroke-width="1.2"/><path d="M4.5 18.5l2-8.5h7l2 8.5z" fill="#9a5430" stroke="#2b1a10" stroke-width="1.2" stroke-linejoin="round"/></symbol>
<symbol id="sym-B" viewBox="0 0 20 20"><path d="M10 1.8l2.2 4.6 4.9-1.7-1.7 4.9 4.6 2.2-4.6 2.2 1.7 4.9-4.9-1.7L10 21.8l-2.2-4.6-4.9 1.7 1.7-4.9L0 11.8l4.6-2.2-1.7-4.9 4.9 1.7z" transform="translate(0 -1.8)" fill="#3a2b3a" stroke="#c08bd0" stroke-width="1"/></symbol>
<symbol id="sym-P" viewBox="0 0 20 20"><circle cx="10" cy="10" r="7" fill="currentColor" stroke="#fff" stroke-width="2"/></symbol>
<symbol id="sym-S" viewBox="0 0 20 20"><circle cx="10" cy="10" r="8.6" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="10" cy="10" r="6" fill="currentColor" stroke="#fff" stroke-width="1.6"/></symbol>
<symbol id="sym-F" viewBox="0 0 20 20"><path d="M10 2l7 3v5c0 4.2-3 7.2-7 8.5C6 17.2 3 14.2 3 10V5z" fill="#3f6fbf" stroke="#fff" stroke-width="1.4"/></symbol>
`;

// 人数ごとの地図の大きさと、ボードの置き場
export function mapLayout(n) {
    const places = LAYOUTS[n].places;
    const cols = Math.max(...places.map(p => p[0])) + 1;
    const rows = Math.max(...places.map(p => p[1])) + 1;
    return { width: cols * BOARD_W, height: rows * BOARD_H, places };
}

const tf = (place) => ([x, y]) => [place[0] * BOARD_W + (place[2] ? BOARD_W - x : x), place[1] * BOARD_H + y];

// 土地の多角形（地図の座標）
export function landPolygon(n, board, num) {
    const t = tf(mapLayout(n).places[board]);
    return LAND_SHAPES[num - 1].map(t);
}

// 多角形の重心（駒を並べる中心）
export function centroid(points) {
    let a = 0;
    let cx = 0;
    let cy = 0;
    points.forEach(([x1, y1], i) => {
        const [x2, y2] = points[(i + 1) % points.length];
        const f = x1 * y2 - x2 * y1;
        a += f;
        cx += (x1 + x2) * f;
        cy += (y1 + y2) * f;
    });
    return [cx / (3 * a), cy / (3 * a)];
}

const pts = (points) => points.map(p => p.map(v => v.toFixed(1)).join(',')).join(' ');

// 土地の駒の並び：[図柄, 数, 色]
function tokens(view, L) {
    const list = [];
    const count = (k) => L.inv.filter(p => p.k === k).length;
    ['C', 'T', 'E'].forEach(k => { if (count(k)) list.push([k, count(k)]); });
    if (L.dahan.length) list.push(['D', L.dahan.length]);
    if (L.blight) list.push(['B', L.blight]);
    L.presence.forEach((p, seat) => {
        if (!p) return;
        const sp = view.spirits[seat];
        list.push([sp.sacred.includes(L.id) ? 'S' : 'P', p, SPIRITS[sp.key].color]);
    });
    if (L.defend) list.push(['F', L.defend]);
    return list;
}

const matches = (L, cardId) => {
    if (!cardId) return false;
    const card = INVADER_CARD[cardId];
    return card.coastal ? L.coastal : card.terrains.includes(L.terrain);
};

// 地図の SVG。opts: picks（選べる土地の Set）・recommended（おすすめの土地）・selected（選んだ土地）
export function mapSvg(view, { picks = null, recommended = null, selected = null } = {}) {
    const { width, height, places } = mapLayout(view.n);
    const parts = [];
    places.forEach((place, b) => {
        const t = tf(place);
        parts.push(`<polygon class="ocean" points="${pts(OCEAN_SHAPE.map(t))}" fill="${OCEAN}"/>`);
        const [ox, oy] = t([18, 120]);
        parts.push(`<text class="board-letter" x="${ox}" y="${oy}">${BOARD_LETTERS[b]}</text>`);
    });
    view.lands.forEach(L => {
        const poly = landPolygon(view.n, L.board, L.num);
        const [cx, cy] = centroid(poly);
        const cls = ['land', picks?.has(L.id) ? 'pick' : '', recommended === L.id ? 'recommended' : '', selected === L.id ? 'selected' : '', picks && !picks.has(L.id) ? 'dim' : ''].join(' ');
        const ravage = matches(L, view.invader.ravage) && L.inv.length > 0;
        const build = matches(L, view.invader.build) && L.inv.length > 0;
        const list = tokens(view, L);
        const perRow = list.length > 4 ? 3 : 2;
        const rows = Math.ceil(list.length / perRow);
        const size = 22;
        const items = list.map(([sym, n, color], i) => {
            const row = Math.floor(i / perRow);
            const inRow = Math.min(perRow, list.length - row * perRow);
            const x = cx + (i % perRow - (inRow - 1) / 2) * (size + 6) - size / 2;
            const y = cy + 6 + (row - (rows - 1) / 2) * (size + 2) - size / 2;
            const label = n > 1 || sym === 'F' ? `<text class="cnt" x="${x + size + 1}" y="${y + size - 1}">${n}</text>` : '';
            // 描き直しの前後で見分けられるように包む（piece-motion.js）。存在は精霊ごと（色）に別の駒として動かす
            const group = sym === 'P' || sym === 'S' ? `pres${color}` : sym;
            return `<g data-mk="${L.id}-${group}" data-mg="${group}" data-mv="${n}"><use href="#sym-${sym}" x="${x}" y="${y}" width="${size}" height="${size}"${color ? ` style="color:${color}"` : ''}/>${label}</g>`;
        }).join('');
        const marks = `${ravage ? `<path class="mark-ravage" d="M${cx + 14} ${cy - 24}l5 8h-10z"/>` : ''}${build ? `<rect class="mark-build" x="${cx + (ravage ? 22 : 10)}" y="${cy - 24}" width="8" height="8" rx="1.5"/>` : ''}`;
        parts.push(`<g class="${cls}" data-land="${L.id}"><polygon points="${pts(poly)}" fill="${TERRAIN_COLORS[L.terrain]}"/>`
            + `<text class="land-name" x="${cx - 8}" y="${cy - 16}">${BOARD_LETTERS[L.board]}${L.num}</text>${marks}${items}</g>`);
    });
    return `<svg class="map-svg" viewBox="-4 -4 ${width + 8} ${height + 8}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="島の地図"><defs>${SYMBOLS}</defs>${parts.join('')}</svg>`;
}

// タイトル画面の絵：島1枚と、駒をいくつか
export function titleArtSvg() {
    const lands = LAND_SHAPES.map((shape, i) => `<polygon points="${pts(shape)}" fill="${TERRAIN_COLORS['MWJSWMSJ'[i]]}" stroke="#1d3b2c" stroke-width="2.5" stroke-linejoin="round"/>`).join('');
    const put = (sym, x, y, color) => `<use href="#sym-${sym}" x="${x}" y="${y}" width="26" height="26"${color ? ` style="color:${color}"` : ''}/>`;
    return `<svg viewBox="0 0 300 240" aria-hidden="true"><defs>${SYMBOLS}</defs><polygon points="${pts(OCEAN_SHAPE)}" fill="${OCEAN}"/>${lands}`
        + `${put('S', 150, 96, SPIRITS.river.color)}${put('D', 70, 175)}${put('D', 96, 175)}${put('T', 236, 150)}${put('E', 262, 150)}${put('C', 60, 30)}${put('P', 180, 30, SPIRITS.lightning.color)}${put('B', 240, 40)}</svg>`;
}
