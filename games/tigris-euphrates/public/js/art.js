/**
 * 絵（すべて自作の SVG）
 * 図柄は symbol としてページに一度だけ入れ、use で使い回す。盤の1マスは 10×10 の座標で描く
 */

export const TILE_FILL = { red: '#c4452f', blue: '#2f6db3', green: '#3d8a45', black: '#2a2a2e' };
// 席ごとの縁の色（指導者の持ち主を見分ける）
export const SEAT_COLORS = ['#f2c14e', '#f4f1ea', '#ff8a3d', '#b98cff'];

// 図柄（白い線と面。viewBox 0 0 10 10）
const GLYPHS = {
    // 神殿：段のあるジッグラト
    red: '<path d="M2 8.2h6M2.8 8.2V6.6h4.4v1.6M3.6 6.6V5h2.8v1.6M4.4 5V3.4h1.2V5" />',
    // 農地：麦の穂
    blue: '<path d="M5 8.4V3.2M5 4.2 3.6 3.2M5 5.4 3.4 4.4M5 6.6 3.4 5.6M5 4.2l1.4-1M5 5.4l1.6-1M5 6.6l1.6-1" />',
    // 市場：壺
    green: '<path d="M4 2.6h2M4.3 2.6c0 1-1.8 1.4-1.8 3.2 0 1.6 1.1 2.5 2.5 2.5s2.5-.9 2.5-2.5c0-1.8-1.8-2.2-1.8-3.2M3 5.4h4" />',
    // 集落：家
    black: '<path d="M2.6 8.2V4.9L5 2.8l2.4 2.1v3.3zM4.3 8.2V6.3h1.4v1.9" />'
};

// 王朝の印（viewBox 0 0 10 10）
const DYNASTY = {
    bow: '<path d="M3.4 1.8c3.4 1.6 3.4 4.8 0 6.4M3.4 1.8v6.4M2 5h6M6.6 4.2 8 5 6.6 5.8" />',
    bull: '<path d="M3.4 4.2c-1.4 0-2-1.1-1.8-2.3M6.6 4.2c1.4 0 2-1.1 1.8-2.3M3.2 4h3.6v2.4c0 1.2-.8 2-1.8 2s-1.8-.8-1.8-2z" />',
    pot: '<path d="M3.6 2h2.8M4 2c0 1.1-1.6 1.3-1.6 3.4 0 1.7 1.1 2.8 2.6 2.8s2.6-1.1 2.6-2.8C7.6 3.3 6 3.1 6 2" />',
    lion: '<circle cx="5" cy="5.2" r="1.7" /><path d="M5 1.6v1.2M5 7.6v1.2M1.4 5.2h1.2M7.4 5.2h1.2M2.5 2.7l.9.9M6.6 6.8l.9.9M7.5 2.7l-.9.9M3.4 6.8l-.9.9" />'
};

// ボタンのアイコン（viewBox 0 0 24 24、線）
const ICONS = {
    home: '<path d="M4 11.5 12 5l8 6.5M6.5 10v9h11v-9" />',
    log: '<path d="M7 6h11M7 12h11M7 18h11M4 6h.01M4 12h.01M4 18h.01" />',
    help: '<circle cx="12" cy="12" r="9" /><path d="M9.6 9.4a2.5 2.5 0 1 1 3.4 2.3c-.7.3-1 .8-1 1.5v.6M12 17h.01" />',
    zoomIn: '<circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 20 20M10.5 7.5v6M7.5 10.5h6" />',
    zoomOut: '<circle cx="10.5" cy="10.5" r="6.5" /><path d="M15.5 15.5 20 20M7.5 10.5h6" />',
    swap: '<path d="M5 8h13l-3-3M19 16H6l3 3" />',
    pass: '<path d="M6 6l6 6-6 6M13 6l6 6-6 6" />',
    back: '<path d="M9 7 4 12l5 5M4 12h11a5 5 0 0 1 0 10" />',
    catastrophe: '<path d="M13 3 6 13h5l-1 8 7-10h-5z" />'
};

export function symbolsSvg() {
    const glyphs = Object.entries(GLYPHS).map(([k, d]) => `<symbol id="g-${k}" viewBox="0 0 10 10">${d}</symbol>`).join('');
    const dyn = Object.entries(DYNASTY).map(([k, d]) => `<symbol id="d-${k}" viewBox="0 0 10 10">${d}</symbol>`).join('');
    const icons = Object.entries(ICONS).map(([k, d]) => `<symbol id="i-${k}" viewBox="0 0 24 24">${d}</symbol>`).join('');
    return `<svg width="0" height="0" style="position:absolute" aria-hidden="true">${glyphs}${dyn}${icons}</svg>`;
}

export const icon = (name) => `<svg class="ico" aria-hidden="true"><use href="#i-${name}"/></svg>`;

// 文明タイル（x, y はマスの左上。盤の座標）
export function tileShape(color, x = 0, y = 0, extra = '') {
    return `<g class="tile ${extra}" transform="translate(${x} ${y})"><rect class="tile-body" x=".5" y=".5" width="9" height="9" rx="1.4" fill="${TILE_FILL[color]}"/><use class="glyph" href="#g-${color}" x="1" y="1" width="8" height="8"/></g>`;
}

// 宝物（神殿の右上に小さく）
export const treasureShape = (x, y) => `<path class="treasure" d="M${x + 7.4} ${y + .9}l1.6 1.6-1.6 1.6-1.6-1.6z"/>`;

// 指導者：色の円盤に王朝の印。縁の色で持ち主を見分ける
export function leaderShape(color, seat, dynasty, x = 0, y = 0, extra = '') {
    return `<g class="leader ${extra}" transform="translate(${x} ${y})"><circle cx="5" cy="5" r="4.2" fill="${TILE_FILL[color]}" stroke="${SEAT_COLORS[seat]}" stroke-width="1.1"/><use class="dyn" href="#d-${dynasty}" x="2" y="2" width="6" height="6"/></g>`;
}

export const catastropheShape = (x, y) => `<g class="cat" transform="translate(${x} ${y})"><rect x=".5" y=".5" width="9" height="9" rx="1.2"/><path d="M2.6 2.6l4.8 4.8M7.4 2.6 2.6 7.4"/></g>`;

// 記念碑（2×2 の正方形の上に、2色の段の塔）
export function monumentShape(colors, x, y) {
    const [a, b] = colors;
    return `<g class="monument" transform="translate(${x} ${y})"><rect class="mon-base" x=".6" y=".6" width="18.8" height="18.8" rx="2"/>
        <path d="M3 17h14v-3H3z" fill="${TILE_FILL[a]}"/><path d="M5 14h10v-3.4H5z" fill="${TILE_FILL[b]}"/>
        <path d="M7 10.6h6V7.2H7z" fill="${TILE_FILL[a]}"/><path d="M8.6 7.2h2.8V4H8.6z" fill="${TILE_FILL[b]}"/></g>`;
}

// 単独で使う小さな絵（ボタンや一覧）
export const tileSvg = (color) => `<svg class="mini" viewBox="0 0 10 10" aria-hidden="true">${tileShape(color)}</svg>`;
export const leaderSvg = (color, seat, dynasty) => `<svg class="mini" viewBox="0 0 10 10" aria-hidden="true">${leaderShape(color, seat, dynasty)}</svg>`;
export const dynastySvg = (dynasty, seat) => `<svg class="mini dyn-mark" viewBox="0 0 10 10" aria-hidden="true" style="color:${SEAT_COLORS[seat]}"><use href="#d-${dynasty}"/></svg>`;
export const treasureSvg = () => '<svg class="mini" viewBox="5.5 0 5 5" aria-hidden="true"><path class="treasure" d="M8 .9l1.6 1.6L8 4.1 6.4 2.5z"/></svg>';
export const monumentSvg = (colors) => `<svg class="mini mon-mini" viewBox="0 0 20 20" aria-hidden="true">${monumentShape(colors, 0, 0)}</svg>`;
