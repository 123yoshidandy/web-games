/**
 * タイルの絵（SVG）。黒いタイルに、6色の6つの形
 * 形は 100×100 の枠の中に描く。何度も使うので、symbol としてページに一度だけ入れ、use で使い回す
 */

export const TILE_COLORS = ['#e63b3b', '#f28c28', '#f5d33f', '#52b852', '#2f9fe0', '#a070dc'];

function starPath(points, outer, inner, rotate = 0) {
    const d = [];
    for (let i = 0; i < points * 2; i++) {
        const r = i % 2 ? inner : outer;
        const a = (Math.PI * i) / points + rotate - Math.PI / 2;
        d.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
    }
    return `M${d.join('L')}Z`;
}

const SHAPE_SVG = [
    '<circle cx="50" cy="50" r="30"/>',
    `<path d="${starPath(4, 40, 13, Math.PI / 4)}"/>`,
    '<path d="M50 14L86 50L50 86L14 50Z"/>',
    '<rect x="22" y="22" width="56" height="56"/>',
    `<path d="${starPath(8, 38, 19)}"/>`,
    '<circle cx="50" cy="31" r="17"/><circle cx="50" cy="69" r="17"/><circle cx="31" cy="50" r="17"/><circle cx="69" cy="50" r="17"/><circle cx="50" cy="50" r="12"/>'
];

// ページに一度だけ入れる定義（形ごと）
export function tileDefs() {
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${SHAPE_SVG.map((s, i) => `<symbol id="shape-${i}" viewBox="0 0 100 100">${s}</symbol>`).join('')}</defs></svg>`;
}

// 盤の上の1枚（x, y はマスの左上、size はマスの大きさ）
export function tileGroup(tile, x, y, size, cls = '') {
    const color = TILE_COLORS[Math.floor(tile / 6) % 6];
    const pad = size * 0.04;
    const s = size - pad * 2;
    return `<g class="tile ${cls}" transform="translate(${x + pad} ${y + pad})">`
        + `<rect class="tile-bg" width="${s}" height="${s}" rx="${s * 0.12}"/>`
        + `<use href="#shape-${tile % 6}" x="${s * 0.08}" y="${s * 0.08}" width="${s * 0.84}" height="${s * 0.84}" fill="${color}"/></g>`;
}

// 手札などに置く、単独のタイル
export function tileSvg(tile, cls = '') {
    return `<svg class="tile-svg ${cls}" viewBox="0 0 100 100" aria-hidden="true">${tileGroup(tile, 0, 0, 100)}</svg>`;
}
