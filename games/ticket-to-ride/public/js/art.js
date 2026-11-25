/**
 * 絵（自作の SVG）
 * - 地図：都市を丸で、路線を都市の間に並べた車両（長さの数の四角）で描く。複線は左右にずらす
 * - 列車カード：色の札。機関車は虹の帯
 */

import { CITIES, ROUTES, MAP_W, MAP_H } from './map.js';

export const CARD_COLORS = {
    red: '#d8433b', orange: '#ec8a2c', yellow: '#f0c63a', green: '#47a64f', blue: '#3a7bd5',
    pink: '#e57fb2', white: '#f3f1ea', black: '#34343a', gray: '#b9b4a8'
};
// プレイヤーの列車の色
export const PLAYER_COLORS = ['#2c6fd6', '#d9443a', '#2f9b52', '#e2a915', '#3b3b44'];
export const PLAYER_COLOR_NAMES = ['青', '赤', '緑', '黄', '黒'];

const CITY_R = 9;
const CAR_H = 11;
const GAP = 3;
const DOUBLE_OFFSET = 7.5;

// 都市の名前の置き場所：右・左・上・下。込み合うところと、地図の端では、重ならず外に出ない向きにする
const LABEL = {
    vancouver: 'right', seattle: 'right', portland: 'right', sanfrancisco: 'right', losangeles: 'below',
    calgary: 'above', helena: 'right', saltlakecity: 'below', lasvegas: 'below', phoenix: 'below', elpaso: 'below',
    santafe: 'left', denver: 'right', winnipeg: 'above', duluth: 'right', omaha: 'left', kansascity: 'right',
    oklahomacity: 'belowLeft', dallas: 'right', houston: 'left', saultstmarie: 'above', chicago: 'right', saintlouis: 'below',
    littlerock: 'below', neworleans: 'right', toronto: 'above', pittsburgh: 'above', nashville: 'below', atlanta: 'left',
    miami: 'left', montreal: 'left', boston: 'belowLeft', newyork: 'left', washington: 'belowLeft', raleigh: 'left', charleston: 'below'
};
const LABEL_AT = {
    right: [13, 7, 'start'], left: [-13, 7, 'end'], above: [0, -15, 'middle'], below: [0, 29, 'middle'], belowLeft: [8, 29, 'end']
};

// 路線の線（複線はずらす）：{ x1, y1, x2, y2 }
export function routeLine(route) {
    const a = CITIES[route.a];
    const b = CITIES[route.b];
    let { x: x1, y: y1 } = a;
    let { x: x2, y: y2 } = b;
    if (route.pair !== null) {
        const dx = x2 - x1;
        const dy = y2 - y1;
        const d = Math.hypot(dx, dy);
        const side = route.id < route.pair ? -1 : 1;
        const ox = (-dy / d) * DOUBLE_OFFSET * side;
        const oy = (dx / d) * DOUBLE_OFFSET * side;
        x1 += ox; y1 += oy; x2 += ox; y2 += oy;
    }
    return { x1, y1, x2, y2 };
}

// 点 (x, y) に一番近い路線（filter に合うもの）。遠すぎれば null
export function nearestRoute(x, y, filter = () => true, limit = 45) {
    let best = null;
    ROUTES.forEach(r => {
        if (!filter(r)) return;
        const { x1, y1, x2, y2 } = routeLine(r);
        const dx = x2 - x1;
        const dy = y2 - y1;
        const t = Math.max(0, Math.min(1, ((x - x1) * dx + (y - y1) * dy) / (dx * dx + dy * dy)));
        const d = Math.hypot(x - (x1 + t * dx), y - (y1 + t * dy));
        if (d <= limit && (!best || d < best.d)) best = { id: r.id, d };
    });
    return best?.id ?? null;
}

function routeCars(route, cls, fill) {
    const { x1, y1, x2, y2 } = routeLine(route);
    const d = Math.hypot(x2 - x1, y2 - y1);
    const angle = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const usable = d - CITY_R * 2 - 4;
    const car = (usable - GAP * (route.len - 1)) / route.len;
    const parts = [];
    for (let i = 0; i < route.len; i++) {
        const along = CITY_R + 2 + i * (car + GAP);
        parts.push(`<rect x="${along.toFixed(1)}" y="${-CAR_H / 2}" width="${car.toFixed(1)}" height="${CAR_H}" rx="2" fill="${fill}"/>`);
    }
    return `<g class="${cls}" data-route="${route.id}" transform="translate(${x1.toFixed(1)} ${y1.toFixed(1)}) rotate(${angle.toFixed(2)})">${parts.join('')}</g>`;
}

// 地図。opts：{ claimed（路線ごとの持ち主）, blocked（使えない路線の Set）, selected（選んだ路線）,
//              ticketCities（目的地の都市 → 'todo' か 'done'）, highlight（光らせる路線の Set） }
export function mapSvg(opts = {}) {
    const { claimed = [], blocked = new Set(), selected = null, ticketCities = new Map(), highlight = new Set() } = opts;
    const routes = ROUTES.map(r => {
        const owner = claimed[r.id];
        if (owner !== null && owner !== undefined) return routeCars(r, `m-route claimed p${owner}`, PLAYER_COLORS[owner]);
        const classes = ['m-route', `c-${r.color}`];
        if (blocked.has(r.id)) classes.push('blocked');
        if (highlight.has(r.id)) classes.push('hint');
        return routeCars(r, classes.join(' '), CARD_COLORS[r.color]);
    }).join('');
    const sel = selected !== null ? routeCars(ROUTES[selected], 'm-route selected', 'none') : '';
    const cities = Object.entries(CITIES).map(([id, c]) => {
        const mark = ticketCities.get(id);
        const ring = mark ? `<circle cx="${c.x}" cy="${c.y}" r="${CITY_R + 6}" class="m-ring ${mark}"/>` : '';
        const [dx, dy, anchor] = LABEL_AT[LABEL[id] ?? 'right'];
        return `${ring}<circle cx="${c.x}" cy="${c.y}" r="${CITY_R}" class="m-city"/><text x="${c.x + dx}" y="${c.y + dy}" text-anchor="${anchor}" class="m-label${mark ? ' on' : ''}">${c.name}</text>`;
    }).join('');
    return `<svg class="map-svg" viewBox="0 0 ${MAP_W} ${MAP_H}" role="img" aria-label="北米の地図"><rect width="${MAP_W}" height="${MAP_H}" rx="18" class="m-bg"/>${routes}${sel}${cities}</svg>`;
}

// 列車カード（色の札）
export function cardSvg(color) {
    const fill = color === 'loco'
        ? '<rect x="2" y="2" width="36" height="24" rx="5" fill="url(#rainbow)"/>'
        : `<rect x="2" y="2" width="36" height="24" rx="5" fill="${CARD_COLORS[color]}"/>`;
    const defs = color === 'loco'
        ? '<defs><linearGradient id="rainbow" x1="0" x2="1"><stop offset="0" stop-color="#d8433b"/><stop offset=".25" stop-color="#f0c63a"/><stop offset=".5" stop-color="#47a64f"/><stop offset=".75" stop-color="#3a7bd5"/><stop offset="1" stop-color="#e57fb2"/></linearGradient></defs>'
        : '';
    return `<svg class="card-svg" viewBox="0 0 40 28" aria-hidden="true">${defs}${fill}<path d="M10 19h20M12 19v-6h10v-4h6v10M14 22.5a1.6 1.6 0 1 0 0 .1M26 22.5a1.6 1.6 0 1 0 0 .1" class="card-glyph${color === 'white' || color === 'yellow' ? ' dark' : ''}"/></svg>`;
}

export const LINE_ICONS = {
    home: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 11 12 4l8.5 7M6 9.5V20h4.5v-5.5h3V20H18V9.5"/></svg>',
    help: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6M12 17.2v.1"/></svg>',
    people: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3.2"/><path d="M3 19c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2M16 5.2a3 3 0 0 1 0 5.6M18 13.9c1.7.7 2.8 2.4 3 5.1"/></svg>',
    ticket: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16v3a2 2 0 0 0 0 4v3H4v-3a2 2 0 0 0 0-4Z"/><path d="M9 7v10" stroke-dasharray="2 2"/></svg>',
    log: '<svg class="line-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h12M6 10h12M6 15h8M6 20h5"/></svg>'
};
