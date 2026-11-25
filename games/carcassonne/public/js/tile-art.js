/**
 * タイルとコマの絵（自作の SVG）
 * ページに一度だけ symbol として入れ（spriteMarkup）、盤面・手元のタイル・遊び方の図は use で使い回す
 * DOM に依存しない（文字列を返すだけ）
 */

import { TILE_TYPES, rotatePoint } from './tiles.js';

export const PLAYER_COLORS = ['#d8402f', '#2f6fd8', '#f0c02a', '#2e2e2e', '#9a52d6'];
export const PLAYER_COLOR_NAMES = ['赤', '青', '黄', '黒', '紫'];
// コマの縁の色（黒のコマだけ明るい縁）
export const meepleStroke = seat => (seat === 3 ? '#e9e4d8' : '#1d1a16');

const INK = '#5e4630';
const ROOF = '#b5472f';

// 都市の形（北・東・南・西の向きは、group を回して作る）
const rot = (deg, inner) => (deg ? `<g transform="rotate(${deg} 50 50)">${inner}</g>` : inner);
const wall = d => `<path d="${d}" class="wall-base"/><path d="${d}" class="wall-top"/>`;
const cityFill = d => `<path d="${d}" fill="url(#stone)"/>`;

// 1 辺の都市の端（深さは control で決める）
const cap = (side, control = 45) => rot(side * 90, cityFill(`M0 0H100Q50 ${control} 0 0Z`) + wall(`M100 0Q50 ${control} 0 0`));
// 向かい合う 2 辺をつなぐ都市（東西）
const band = side => rot(side * 90, cityFill('M0 0Q50 40 100 0V100Q50 60 0 100Z') + wall('M0 0Q50 40 100 0') + wall('M100 100Q50 60 0 100'));
// 隣り合う 2 辺（北と西）の都市
const corner = side => rot(side * 90, cityFill('M0 0H100Q40 40 0 100Z') + wall('M100 0Q40 40 0 100'));
// 3 辺（北・東・西）の都市
const three = side => rot(side * 90, cityFill('M0 0H100V100Q50 50 0 100Z') + wall('M100 100Q50 50 0 100'));
const full = () => '<rect width="100" height="100" fill="url(#stone)"/>';

const roadPath = d => `<path d="${d}" class="road-base"/><path d="${d}" class="road-top"/>`;
const ROADS = {
    straightNS: 'M50 0V100', straightEW: 'M0 50H100',
    curveSW: 'M50 100Q50 50 0 50', curveES: 'M100 50Q50 50 50 100',
    N: 'M50 50V0', E: 'M50 50H100', S: 'M50 50V100', W: 'M50 50H0'
};

const house = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><rect x="-5" y="-3" width="10" height="7.5" fill="#efe3c6" stroke="${INK}" stroke-width=".8"/><path d="M-6.6-2.6 0-8.4 6.6-2.6Z" fill="${ROOF}" stroke="${INK}" stroke-width=".8" stroke-linejoin="round"/><rect x="-1.3" y="1" width="2.6" height="3.5" fill="${INK}"/></g>`;
const shield = (x, y) => `<g transform="translate(${x} ${y})"><path d="M-6.5-7.5H6.5V0C6.5 5 0 8.5 0 8.5S-6.5 5-6.5 0Z" fill="#2c58a8" stroke="#f6eedb" stroke-width="1.4" stroke-linejoin="round"/><path d="M0-5V5M-4-1.2H4" stroke="#f6eedb" stroke-width="1.6" stroke-linecap="round"/></g>`;
const village = (x, y) => `<g transform="translate(${x} ${y + 2})"><rect x="-8" y="-5" width="16" height="11" fill="#efe3c6" stroke="${INK}" stroke-width="1"/><path d="M-10-4.5 0-13 10-4.5Z" fill="${ROOF}" stroke="${INK}" stroke-width="1" stroke-linejoin="round"/><rect x="-2" y="0" width="4" height="6" fill="${INK}"/></g>`;
const monasteryAt = (x, y) => `<g transform="translate(${x} ${y})">
    <rect x="-15" y="-6" width="30" height="20" fill="#f3ead6" stroke="${INK}" stroke-width="1.2"/>
    <path d="M-18-5 0-17 18-5Z" fill="${ROOF}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <rect x="9" y="-21" width="8" height="16" fill="#f3ead6" stroke="${INK}" stroke-width="1.2"/>
    <path d="M7.5-20.5 13-28 18.5-20.5Z" fill="${ROOF}" stroke="${INK}" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M-4 14V5A4 4 0 0 1 4 5V14Z" fill="${INK}"/>
    <circle cx="-9" cy="2" r="1.8" fill="${INK}"/><circle cx="9" cy="2" r="1.8" fill="${INK}"/></g>`;

// 種類ごとの絵
//   ground：地形（道 → 都市の順）。タイルの向きに合わせて回す
//   marks：家・紋章・修道院・交差点の家。位置だけを回し、絵は常に正立で描く（回った家が矢印に見えないように）
const H = (x, y) => ['house', x, y];
const SH = (x, y) => ['shield', x, y];
const ART = {
    A: { ground: () => roadPath('M50 100V64'), marks: [['monastery', 50, 46]] },
    B: { ground: () => '', marks: [['monastery', 50, 48]] },
    C: { ground: () => full(), marks: [H(26, 28), H(28, 76), H(74, 74), SH(75, 25)] },
    D: { ground: () => roadPath(ROADS.straightEW) + cap(0), marks: [] },
    E: { ground: () => cap(0), marks: [] },
    F: { ground: () => band(0), marks: [SH(22, 50), H(78, 50)] },
    G: { ground: () => band(1), marks: [H(50, 18), H(50, 84)] },
    H: { ground: () => cap(1, 40) + cap(3, 40), marks: [] },
    I: { ground: () => cap(0, 40) + cap(3, 40), marks: [] },
    J: { ground: () => roadPath(ROADS.curveES) + cap(0), marks: [] },
    K: { ground: () => roadPath('M0 50Q50 50 50 100') + cap(0), marks: [] },
    L: { ground: () => roadPath(ROADS.E) + roadPath(ROADS.S) + roadPath(ROADS.W) + cap(0), marks: [['village', 50, 50]] },
    M: { ground: () => corner(0), marks: [SH(56, 14), H(13, 60)] },
    N: { ground: () => corner(0), marks: [H(56, 13), H(13, 60)] },
    O: { ground: () => roadPath(ROADS.curveES) + corner(0), marks: [SH(56, 14), H(13, 60)] },
    P: { ground: () => roadPath(ROADS.curveES) + corner(0), marks: [H(56, 13), H(13, 60)] },
    Q: { ground: () => three(0), marks: [H(20, 30), SH(80, 28)] },
    R: { ground: () => three(0), marks: [H(20, 30), H(80, 30)] },
    S: { ground: () => roadPath('M50 100V70') + three(0), marks: [H(20, 30), SH(80, 28)] },
    T: { ground: () => roadPath('M50 100V70') + three(0), marks: [H(20, 30), H(80, 30)] },
    U: { ground: () => roadPath(ROADS.straightNS), marks: [] },
    V: { ground: () => roadPath(ROADS.curveSW), marks: [] },
    W: { ground: () => roadPath(ROADS.E) + roadPath(ROADS.S) + roadPath(ROADS.W), marks: [['village', 50, 50]] },
    X: { ground: () => roadPath(ROADS.N) + roadPath(ROADS.E) + roadPath(ROADS.S) + roadPath(ROADS.W), marks: [['village', 50, 50]] }
};

const MARKS = {
    house: (x, y) => house(x, y),
    shield: (x, y) => shield(x, y),
    monastery: (x, y) => monasteryAt(x, y),
    village: (x, y) => village(x, y)
};

// rotation の向きに置いたタイルの絵（100×100）
export function tileInner(type, rotation = 0) {
    const art = ART[type];
    const marks = art.marks.map(([kind, x, y]) => MARKS[kind](...rotatePoint([x, y], rotation))).join('');
    return `<rect width="100" height="100" fill="url(#grass)"/>${rot(rotation * 90, art.ground())}${marks}<rect x=".6" y=".6" width="98.8" height="98.8" class="tile-edge"/>`;
}

// コマ（人の形の駒。24×24）
export const MEEPLE_PATH = 'M12 1.6a3.6 3.6 0 0 1 3.6 3.6c0 1.2-.6 2.2-1.4 2.9 1.6.3 2.7 1 3.4 1.9l3.6 3.2c1 .9.3 2.5-1 2.3l-3.4-.5 2.1 5.9c.3.9-.3 1.7-1.2 1.7h-3l-2.7-4.5-2.7 4.5h-3c-.9 0-1.5-.8-1.2-1.7l2.1-5.9-3.4.5c-1.3.2-2-1.4-1-2.3l3.6-3.2c.7-.9 1.8-1.6 3.4-1.9-.8-.7-1.4-1.7-1.4-2.9A3.6 3.6 0 0 1 12 1.6Z';

// ページに一度だけ入れる定義（模様・タイル・コマ）
export function spriteMarkup() {
    const tiles = TILE_TYPES.flatMap(t => [0, 1, 2, 3].map(r => `<symbol id="tile-${t}-${r}" viewBox="0 0 100 100">${tileInner(t, r)}</symbol>`)).join('');
    return `<defs>
        <pattern id="grass" width="25" height="25" patternUnits="userSpaceOnUse">
            <rect width="25" height="25" fill="#8dbb57"/>
            <path d="M5 9l1.4-3 1.4 3M16 20l1.4-3 1.4 3M19 7l1.2-2.4 1.2 2.4" stroke="#74a043" stroke-width="1.1" fill="none" stroke-linecap="round"/>
        </pattern>
        <pattern id="stone" width="20" height="12" patternUnits="userSpaceOnUse">
            <rect width="20" height="12" fill="#ddc195"/>
            <path d="M0 6H20M0 12H20M6 0V6M16 6V12" stroke="#c9a877" stroke-width=".9" fill="none"/>
        </pattern>
        <style>
            .wall-base { fill: none; stroke: ${INK}; stroke-width: 5.5; stroke-linecap: round; }
            .wall-top { fill: none; stroke: #a98458; stroke-width: 2.4; stroke-dasharray: 3 2.4; }
            .road-base { fill: none; stroke: #8c7656; stroke-width: 11; }
            .road-top { fill: none; stroke: #f1e7cb; stroke-width: 7.5; }
            .tile-edge { fill: none; stroke: rgba(40, 30, 15, .35); stroke-width: 1.2; }
        </style>
    </defs>${tiles}
    <symbol id="meeple" viewBox="0 0 24 24"><path d="${MEEPLE_PATH}" fill="currentColor" stroke="var(--meeple-stroke, #1d1a16)" stroke-width="1.3" stroke-linejoin="round"/></symbol>`;
}

// タイトルの絵：ルールどおりにつながった 4×3 の盤面（[x, y, 種類, 向き, コマ [席, 要素]]）
export const TITLE_LAYOUT = [
    [0, 0, 'B', 0, [1, 0]], [1, 0, 'N', 2, [0, 0]], [2, 0, 'N', 3], [3, 0, 'E', 1],
    [0, 1, 'V', 3], [1, 1, 'D', 0], [2, 1, 'D', 0, [2, 1]], [3, 1, 'W', 0],
    [0, 2, 'U', 0], [1, 2, 'B', 0], [2, 2, 'E', 2, [3, 1]], [3, 2, 'V', 2]
];

// 盤面の 1 枚（左上が (x*100, y*100)）
export function tileUse(type, rotation, x = 0, y = 0) {
    return `<use href="#tile-${type}-${rotation}" x="${x * 100}" y="${y * 100}" width="100" height="100"/>`;
}

// コマの絵（中心が (cx, cy)、草原の農夫は横にする）
export function meepleUse(cx, cy, seat, { size = 30, lying = false } = {}) {
    const color = PLAYER_COLORS[seat];
    const transform = lying ? ` transform="rotate(-90 ${cx} ${cy})"` : '';
    return `<use href="#meeple" x="${cx - size / 2}" y="${cy - size / 2}" width="${size}" height="${size}" style="color:${color};--meeple-stroke:${meepleStroke(seat)}"${transform}/>`;
}
