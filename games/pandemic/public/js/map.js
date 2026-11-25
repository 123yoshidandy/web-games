/**
 * 世界地図（SVG）
 * 大陸の形は、都市の位置に合わせて描いた粗い多角形（実際の地形ではない）
 * 変わらない部分（海・大陸・つながり）は一度だけ作り、都市・病原体・駒・研究所は毎回描き直す
 */

import { CITIES, EDGES, isWrap, NEIGHBORS, ROLES } from './cities.js';

export const VIEW_BOX = { x: 0, y: 34, w: 1000, h: 462 };
export const DISEASE_COLORS = ['#3d8bfd', '#f5c542', '#3a3a46', '#e5484d'];
const ROLE_COLOR = Object.fromEntries(ROLES.map(r => [r.key, r.color]));

const LANDS = [
    // 北アメリカ
    [[12, 70], [90, 44], [200, 36], [300, 44], [342, 84], [352, 122], [346, 168], [314, 214], [282, 236], [288, 258], [276, 270], [248, 268], [222, 282], [210, 300], [232, 318], [222, 326], [176, 300], [124, 276], [76, 250], [40, 200], [26, 140]],
    // グリーンランド
    [[354, 36], [430, 36], [418, 72], [380, 86], [360, 64]],
    // 南アメリカ
    [[236, 318], [292, 312], [342, 338], [398, 368], [392, 404], [356, 436], [338, 466], [300, 488], [258, 494], [240, 480], [226, 440], [206, 402], [214, 360]],
    // イギリス
    [[414, 80], [446, 72], [452, 110], [428, 126], [410, 108]],
    // ユーラシア
    [[392, 162], [398, 196], [440, 200], [476, 182], [522, 166], [556, 176], [588, 196], [612, 222], [636, 296], [690, 286], [702, 250], [748, 330], [790, 374], [822, 302], [848, 336], [882, 350], [906, 302], [914, 238], [904, 176], [918, 124], [956, 92], [992, 40], [500, 36], [466, 62], [480, 120], [440, 150], [404, 150]],
    // 日本
    [[946, 148], [972, 140], [992, 196], [986, 228], [956, 222], [966, 192]],
    // 台湾
    [[934, 226], [946, 224], [948, 250], [936, 252]],
    // フィリピン
    [[940, 296], [958, 300], [966, 340], [946, 338]],
    // インドネシア
    [[812, 384], [862, 382], [906, 394], [904, 408], [858, 406], [816, 398]],
    // アフリカ
    [[436, 212], [520, 202], [592, 226], [616, 280], [652, 298], [622, 360], [604, 420], [594, 480], [562, 482], [532, 424], [512, 362], [470, 332], [430, 302], [424, 252]],
    // オーストラリア
    [[880, 424], [958, 412], [996, 440], [984, 490], [904, 488], [872, 458]]
];

// 名前を下以外に置く都市（重なりを避ける）
const LABEL_POS = {
    'Essen': 'right', 'St. Petersburg': 'right', 'New York': 'up', 'Santiago': 'right', 'London': 'left', 'Milan': 'right', 'Seoul': 'right', 'Beijing': 'up',
    'Tokyo': 'up', 'Osaka': 'down', 'Taipei': 'up', 'Manila': 'down', 'Montreal': 'up', 'Chicago': 'up', 'San Francisco': 'up',
    'Moscow': 'up', 'Istanbul': 'up', 'Tehran': 'up', 'Delhi': 'up', 'Kolkata': 'right', 'Shanghai': 'left', 'Madrid': 'left',
    'Washington': 'right', 'Miami': 'right', 'Cairo': 'right', 'Baghdad': 'right', 'Riyadh': 'right', 'Karachi': 'left', 'Hong Kong': 'right',
    'Sao Paulo': 'right', 'Khartoum': 'right', 'Lima': 'right', 'Buenos Aires': 'right'
};

const pointsOf = (poly) => poly.map(([x, y]) => `${x},${y}`).join(' ');

function staticLayer() {
    const grid = [];
    for (let x = 100; x < 1000; x += 100) grid.push(`<line x1="${x}" y1="34" x2="${x}" y2="496" />`);
    for (let y = 60; y < 496; y += 100) grid.push(`<line x1="0" y1="${y}" x2="1000" y2="${y}" />`);
    const lands = LANDS.map(p => `<polygon points="${pointsOf(p)}" />`).join('');
    const lines = EDGES.map(([a, b]) => {
        const A = CITIES[a];
        const B = CITIES[b];
        if (!isWrap(a, b)) return `<line x1="${A.x}" y1="${A.y}" x2="${B.x}" y2="${B.y}" />`;
        // 太平洋をまたぐ線：左の都市から左端へ、右の都市から右端へ
        const [L, R] = A.x < B.x ? [A, B] : [B, A];
        const mid = (L.y + R.y) / 2;
        return `<line x1="${L.x}" y1="${L.y}" x2="0" y2="${mid}" /><line x1="${R.x}" y1="${R.y}" x2="1000" y2="${mid}" />`;
    }).join('');
    return `<rect class="m-sea" x="0" y="34" width="1000" height="462" />`
        + `<g class="m-grid">${grid.join('')}</g><g class="m-land">${lands}</g><g class="m-links">${lines}</g>`;
}
let STATIC = null;

function labelOf(c) {
    const pos = LABEL_POS[c.en] ?? 'down';
    const [dx, dy, anchor] = { down: [0, 25, 'middle'], up: [0, -19, 'middle'], left: [-15, 5, 'end'], right: [15, 5, 'start'] }[pos];
    return `<text class="m-label" x="${c.x + dx}" y="${c.y + dy}" text-anchor="${anchor}">${c.name}</text>`;
}

function stationIcon(x, y) {
    return `<path class="m-station" d="M${x - 7} ${y + 6}V${y - 1}L${x} ${y - 8}L${x + 7} ${y - 1}V${y + 6}Z" />`;
}

function cubesOf(c, cubes) {
    const list = [];
    cubes.forEach((n, color) => { for (let i = 0; i < n; i++) list.push(color); });
    if (!list.length) return '';
    const size = 8;
    const gap = 2;
    const pos = LABEL_POS[c.en] === 'up' ? 'down' : 'up';
    const y = pos === 'up' ? c.y - 21 : c.y + 12;
    const w = list.length * size + (list.length - 1) * gap;
    return list.map((color, i) => `<rect class="m-cube c${color}" x="${c.x - w / 2 + i * (size + gap)}" y="${y}" width="${size}" height="${size}" rx="1.5" />`).join('');
}

function pawnShape(x, y, role, extra = '') {
    return `<g class="m-pawn ${extra}" transform="translate(${x} ${y})"><path d="M-5 6 Q-5 -1 0 -1 Q5 -1 5 6Z" fill="${ROLE_COLOR[role]}" /><circle cx="0" cy="-4" r="3.4" fill="${ROLE_COLOR[role]}" /></g>`;
}

// view：ゲームのビュー。opts：{ reach: 行ける都市の集合, picks: 選べる都市の集合, mover: 動かす駒の席, focus: 選んだ都市 }
export function mapSvg(view, opts = {}) {
    STATIC ??= staticLayer();
    const reach = opts.reach ?? new Set();
    const picks = opts.picks ?? null;
    const infected = new Set(view.infected);
    const pawnsAt = new Map();
    view.players.forEach(p => {
        if (!pawnsAt.has(p.city)) pawnsAt.set(p.city, []);
        pawnsAt.get(p.city).push(p);
    });
    const cities = CITIES.map(c => {
        const cls = ['m-city'];
        if (picks ? picks.has(c.id) : reach.has(c.id)) cls.push('target');
        if (infected.has(c.id)) cls.push('hit');
        if (opts.focus === c.id) cls.push('focus');
        const total = view.cubes[c.id].reduce((a, b) => a + b, 0);
        if (view.cubes[c.id].some(n => n >= 3)) cls.push('danger');
        const pawns = (pawnsAt.get(c.id) ?? []).map((p, i, arr) => pawnShape(c.x + 13 + i * 7 - (arr.length > 2 ? 4 : 0), c.y + 3, p.role,
            [p.id === view.current ? 'current' : '', p.id === opts.mover ? 'mover' : ''].join(' ')));
        return `<g class="${cls.join(' ')}" data-city="${c.id}">`
            + `<circle class="m-ring" cx="${c.x}" cy="${c.y}" r="14" />`
            + `<circle class="m-dot c${c.color}" cx="${c.x}" cy="${c.y}" r="8" />`
            + (view.stations.includes(c.id) ? stationIcon(c.x - 15, c.y - 3) : '')
            + labelOf(c)
            + (total ? cubesOf(c, view.cubes[c.id]) : '')
            + pawns.join('')
            + `<circle class="m-hit" cx="${c.x}" cy="${c.y}" r="22" />`
            + `</g>`;
    }).join('');
    const { x, y, w, h } = VIEW_BOX;
    return `<svg class="map-svg" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMaxYMin meet" role="img" aria-label="世界地図">${STATIC}${cities}</svg>`;
}

// タイトル用の小さな地図（都市とつながりだけ）
export function miniMapSvg() {
    STATIC ??= staticLayer();
    const dots = CITIES.map(c => `<circle class="m-dot c${c.color}" cx="${c.x}" cy="${c.y}" r="7" />`).join('');
    const { x, y, w, h } = VIEW_BOX;
    return `<svg class="map-svg mini" viewBox="${x} ${y} ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${STATIC}${dots}</svg>`;
}

// 車・船とシャトル便での最短の道（行ける都市の並び。届かなければ null）
export function shortestPath(view, from, to) {
    const prev = new Map([[from, null]]);
    const queue = [from];
    while (queue.length) {
        const c = queue.shift();
        if (c === to) break;
        const next = [...NEIGHBORS[c]];
        if (view.stations.includes(c)) next.push(...view.stations.filter(s => s !== c));
        next.forEach(n => {
            if (!prev.has(n)) {
                prev.set(n, c);
                queue.push(n);
            }
        });
    }
    if (!prev.has(to)) return null;
    const path = [];
    for (let c = to; c !== from; c = prev.get(c)) path.unshift(c);
    return path;
}
