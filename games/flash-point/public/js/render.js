/**
 * 盤面の描画（インラインの SVG。1マスは 10×10）
 * 絵柄（間取り・炎・煙・人・車）はこのゲームのために描いたもの
 * 描く順：床 → ホットスポット → 煙と火 → 壁と扉 → 車 → 印と危険物 → 消防士 → 光（動けるマス・選んだマス・おすすめ）
 */

import { ROWS, COLS, CELL_COUNT, rowOf, colOf, isInside, roomOf, ENGINE_SPOTS, AMBULANCE_SPOTS } from './board.js';

export const PLAYER_COLORS = ['#3e8ef7', '#2fbf71', '#f2c230', '#a46ee0', '#e0559f', '#18b7a8'];
const ROOM_FLOOR = { A: '#e9dcc4', B: '#e4d6c9', C: '#ece2c8', H: '#ddd2bd', D: '#d9e2e2', E: '#e8dcbe', G: '#d8cfbd', F: '#e6d9c0' };

const x0 = (cell) => colOf(cell) * 10;
const y0 = (cell) => rowOf(cell) * 10;

// 炎（下が丸く、上がとがる）
export const FLAME = 'M5 1.2C6.9 3.2 8.3 4.6 8.3 6.6A3.3 3.3 0 0 1 1.7 6.6C1.7 5.1 2.7 3.9 3.4 3.1C3.6 4.3 4.2 5 4.9 5.2C4.4 3.9 4.4 2.6 5 1.2Z';
const FLAME_IN = 'M5 4.4C6 5.4 6.6 6.1 6.6 7A1.6 1.6 0 0 1 3.4 7C3.4 6.2 4 5.6 4.4 5.1C4.5 5.6 4.8 5.9 5.1 6C4.9 5.4 4.8 4.9 5 4.4Z';

const fireSvg = (cell) => `<g transform="translate(${x0(cell)} ${y0(cell)})" class="fire"><rect width="10" height="10" fill="#f0633a" opacity=".32"/>`
    + `<path d="${FLAME}" fill="#e8492b"/><path d="${FLAME_IN}" fill="#ffc94a"/></g>`;
const smokeSvg = (cell) => `<g transform="translate(${x0(cell)} ${y0(cell)})" class="smoke"><rect width="10" height="10" fill="#6d6a68" opacity=".22"/>`
    + '<circle cx="3.6" cy="6" r="2.2" fill="#8d8a87"/><circle cx="6.2" cy="5.2" r="2.6" fill="#a3a09c"/><circle cx="5" cy="3.4" r="1.8" fill="#b9b6b2"/></g>';

// 要救助者（人の形）。treated は手当ての印
const personPath = (cx, cy, s) => `<circle cx="${cx}" cy="${cy - s * 0.9}" r="${s * 0.45}" fill="#fff"/>`
    + `<path d="M${cx - s * 0.85} ${cy + s * 1.1}Q${cx - s * 0.85} ${cy - s * 0.25} ${cx} ${cy - s * 0.25}Q${cx + s * 0.85} ${cy - s * 0.25} ${cx + s * 0.85} ${cy + s * 1.1}Z" fill="#fff"/>`;

export function poiSvg(poi, cx, cy, size = 4.6) {
    const h = size / 2;
    if (!poi.revealed) {
        return `<g class="poi"><rect x="${cx - h}" y="${cy - h}" width="${size}" height="${size}" rx="1" fill="#2f5fa7" stroke="#fff" stroke-width=".4"/>`
            + `<text x="${cx}" y="${cy + 1.2}" text-anchor="middle" font-size="3.4" font-weight="800" fill="#fff">?</text></g>`;
    }
    return `<g class="victim"><rect x="${cx - h}" y="${cy - h}" width="${size}" height="${size}" rx="1" fill="#1d4f91" stroke="#fff" stroke-width=".4"/>`
        + personPath(cx, cy + 0.2, size * 0.36)
        + (poi.treated ? `<g transform="translate(${cx + h - 1} ${cy - h + 1})"><circle r="1.25" fill="#2fbf71" stroke="#fff" stroke-width=".3"/><path d="M-.6 0H.6M0 -.6V.6" stroke="#fff" stroke-width=".45"/></g>` : '')
        + '</g>';
}

export function hazmatSvg(cx, cy, size = 4.2) {
    const h = size / 2;
    return `<g class="hazmat"><path d="M${cx} ${cy - h}L${cx + h} ${cy}L${cx} ${cy + h}L${cx - h} ${cy}Z" fill="#f5c400" stroke="#2b2420" stroke-width=".4"/>`
        + `<text x="${cx}" y="${cy + 1}" text-anchor="middle" font-size="2.6" font-weight="800" fill="#2b2420">!</text></g>`;
}

export function firefighterSvg(color, cx, cy, label = '', r = 1.9) {
    return `<g class="ff"><circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}" stroke="#fff" stroke-width=".45"/>`
        + `<path d="M${cx - r * 0.8} ${cy - r * 0.25}H${cx + r * 0.8}" stroke="#1b1414" stroke-width=".35" opacity=".5"/>`
        + (label ? `<text x="${cx}" y="${cy + 0.85}" text-anchor="middle" font-size="2.2" font-weight="800" fill="#1b1414">${label}</text>` : '')
        + '</g>';
}

// 壁・扉（辺 'a-b'）
function edgeSvg(key, e) {
    const [a, b] = key.split('-').map(Number);
    const vertical = b - a === 1;   // 左右のマスの境目
    const x1 = vertical ? x0(b) : x0(a);
    const y1 = vertical ? y0(a) : y0(b);
    const x2 = vertical ? x1 : x1 + 10;
    const y2 = vertical ? y1 + 10 : y1;
    const mx = (x1 + x2) / 2;
    const my = (y1 + y2) / 2;
    if (e.t === 'wall') {
        const crack = e.d > 0
            ? `<path d="M${mx - 1.2} ${my - 1.2}L${mx + 1.2} ${my + 1.2}M${mx - 1.2} ${my + 1.2}L${mx + 1.2} ${my - 1.2}" stroke="#ff8a3d" stroke-width=".7"/>`
            : '';
        return `<line class="wall${e.d ? ' damaged' : ''}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${e.d ? '#7a4a2e' : '#33261e'}" stroke-width="1.5" stroke-linecap="square"${e.d ? ' stroke-dasharray="3.4 1.2"' : ''}/>${crack}`;
    }
    if (e.t === 'broken') {
        return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#33261e" stroke-width=".4" stroke-dasharray=".6 1.4" opacity=".55"/>`;
    }
    // 扉：枠（両端の短い壁）と、閉じていれば板、開いていれば開いた板
    const frame = vertical
        ? `<line x1="${x1}" y1="${y1}" x2="${x1}" y2="${y1 + 2}" stroke="#33261e" stroke-width="1.5"/><line x1="${x1}" y1="${y2 - 2}" x2="${x1}" y2="${y2}" stroke="#33261e" stroke-width="1.5"/>`
        : `<line x1="${x1}" y1="${y1}" x2="${x1 + 2}" y2="${y1}" stroke="#33261e" stroke-width="1.5"/><line x1="${x2 - 2}" y1="${y1}" x2="${x2}" y2="${y1}" stroke="#33261e" stroke-width="1.5"/>`;
    if (e.s === 'closed') {
        const leaf = vertical
            ? `<rect x="${x1 - 0.8}" y="${y1 + 2}" width="1.6" height="6" fill="#b2733f" stroke="#33261e" stroke-width=".3"/>`
            : `<rect x="${x1 + 2}" y="${y1 - 0.8}" width="6" height="1.6" fill="#b2733f" stroke="#33261e" stroke-width=".3"/>`;
        return `<g class="door closed">${frame}${leaf}</g>`;
    }
    const leaf = vertical
        ? `<line x1="${x1}" y1="${y1 + 2}" x2="${x1 + 4.2}" y2="${y1 + 4.2}" stroke="#b2733f" stroke-width="1"/>`
        : `<line x1="${x1 + 2}" y1="${y1}" x2="${x1 + 4.2}" y2="${y1 + 4.2}" stroke="#b2733f" stroke-width="1"/>`;
    return `<g class="door open">${frame}${leaf}</g>`;
}

function vehicleSvg(kind, side) {
    const cells = (kind === 'engine' ? ENGINE_SPOTS : AMBULANCE_SPOTS)[side];
    const xs = cells.map(x0);
    const ys = cells.map(y0);
    const x = Math.min(...xs) + 1;
    const y = Math.min(...ys) + 1;
    const w = Math.max(...xs) - Math.min(...xs) + 8;
    const h = Math.max(...ys) - Math.min(...ys) + 8;
    if (kind === 'engine') {
        const ladder = w > h
            ? `<path d="M${x + 1.5} ${y + h / 2 - 1}H${x + w - 1.5}M${x + 1.5} ${y + h / 2 + 1}H${x + w - 1.5}" stroke="#f4e3c8" stroke-width=".5"/>`
            : `<path d="M${x + w / 2 - 1} ${y + 1.5}V${y + h - 1.5}M${x + w / 2 + 1} ${y + 1.5}V${y + h - 1.5}" stroke="#f4e3c8" stroke-width=".5"/>`;
        return `<g class="vehicle engine"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.6" fill="#c9302c" stroke="#5c1412" stroke-width=".5" opacity=".9"/>${ladder}</g>`;
    }
    const cx = x + w / 2;
    const cy = y + h / 2;
    return `<g class="vehicle ambulance"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1.6" fill="#f6f3ee" stroke="#6b625a" stroke-width=".5" opacity=".92"/>`
        + `<path d="M${cx - 1.8} ${cy}H${cx + 1.8}M${cx} ${cy - 1.8}V${cy + 1.8}" stroke="#d6312b" stroke-width="1.3"/></g>`;
}

const hotspotSvg = (cell) => `<g class="hotspot" transform="translate(${x0(cell)} ${y0(cell)})"><circle cx="1.8" cy="8.2" r="1.25" fill="none" stroke="#d8402b" stroke-width=".55"/><circle cx="1.8" cy="8.2" r=".45" fill="#d8402b"/></g>`;

// 盤面全体。opts：{ reach（光らせるマスの Set）, selected, hint（おすすめのマス）, roll（最後の延焼のマス）, flash（今回変わったマスの Set）}
export function boardSvg(view, opts = {}) {
    const parts = [`<svg class="board-svg" viewBox="0 0 ${COLS * 10} ${ROWS * 10}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="家の盤面">`];
    // 床と外（外は道と芝）
    parts.push(`<rect width="${COLS * 10}" height="${ROWS * 10}" fill="#46574a"/>`);
    parts.push(`<rect x="10" y="10" width="80" height="60" fill="#d9ccb3"/>`);
    const spots = new Set([...ENGINE_SPOTS.flat(), ...AMBULANCE_SPOTS.flat()]);
    for (let cell = 0; cell < CELL_COUNT; cell++) {
        if (isInside(cell)) {
            parts.push(`<rect x="${x0(cell)}" y="${y0(cell)}" width="10" height="10" fill="${ROOM_FLOOR[roomOf(cell)]}" stroke="#c9bba0" stroke-width=".15"/>`);
        } else if (spots.has(cell) && view.mode === 'experienced') {
            parts.push(`<rect x="${x0(cell) + 0.6}" y="${y0(cell) + 0.6}" width="8.8" height="8.8" fill="none" stroke="#9fb3a2" stroke-width=".3" stroke-dasharray="1 .8"/>`);
        }
    }
    view.hotspots.forEach(cell => parts.push(hotspotSvg(cell)));
    for (let cell = 0; cell < CELL_COUNT; cell++) {
        const f = view.fire[cell];
        if (f === 2) parts.push(fireSvg(cell));
        else if (f === 1) parts.push(smokeSvg(cell));
    }
    Object.entries(view.edges).forEach(([key, e]) => parts.push(edgeSvg(key, e)));
    if (view.vehicles) {
        parts.push(vehicleSvg('ambulance', view.vehicles.ambulance));
        parts.push(vehicleSvg('engine', view.vehicles.engine));
    }
    if (opts.roll !== undefined && opts.roll !== null) {
        parts.push(`<rect class="roll" x="${x0(opts.roll) + 0.5}" y="${y0(opts.roll) + 0.5}" width="9" height="9" rx="1.2" fill="none" stroke="#fff" stroke-width=".6" stroke-dasharray="1.4 .9"/>`);
    }
    // 印と危険物（運ばれているものは、消防士の上に小さく描く）
    const carried = new Set(view.players.map(p => p.carry).filter(Boolean));
    for (let cell = 0; cell < CELL_COUNT; cell++) {
        const pois = view.pois.filter(x => x.cell === cell && !carried.has(`p${x.id}`));
        const hz = view.hazmats.filter(h => h.cell === cell && !carried.has(`h${h.id}`));
        pois.forEach((poi, i) => parts.push(poiSvg(poi, x0(cell) + 6.6 - i * 1.4, y0(cell) + 3.3 + i * 0.6)));
        hz.forEach((h, i) => parts.push(hazmatSvg(x0(cell) + (pois.length ? 2.6 : 5) + i, y0(cell) + 3.2)));
    }
    // 消防士（同じマスに何人もいれば並べる）
    for (let cell = 0; cell < CELL_COUNT; cell++) {
        const here = view.players.filter(p => p.cell === cell);
        here.forEach((p, i) => {
            const row = Math.floor(i / 3);
            const cx = x0(cell) + 2.2 + (i % 3) * 2.8;
            const cy = y0(cell) + 7.6 - row * 3.2;
            const active = p.id === view.current && view.phase === 'turn';
            if (active) parts.push(`<circle class="ff-active" cx="${cx}" cy="${cy}" r="2.7" fill="none" stroke="#fff" stroke-width=".5"/>`);
            parts.push(firefighterSvg(PLAYER_COLORS[p.id % PLAYER_COLORS.length], cx, cy, String(p.id + 1)));
            if (p.carry) {
                const it = p.carry[0] === 'p' ? view.pois.find(x => `p${x.id}` === p.carry) : null;
                parts.push(it ? poiSvg(it, cx + 1.6, cy - 2.2, 2.8) : hazmatSvg(cx + 1.6, cy - 2.2, 2.6));
            }
        });
    }
    // 光（動けるマスなど）とタップの受け口
    for (let cell = 0; cell < CELL_COUNT; cell++) {
        const cls = ['hit'];
        if (opts.reach?.has(cell)) cls.push('reach');
        if (opts.selected === cell) cls.push('selected');
        if (opts.hint === cell) cls.push('recommended');
        if (opts.flash?.has(cell)) cls.push('flash');
        parts.push(`<rect class="${cls.join(' ')}" data-cell="${cell}" x="${x0(cell) + 0.35}" y="${y0(cell) + 0.35}" width="9.3" height="9.3" rx="1"/>`);
    }
    parts.push('</svg>');
    return parts.join('');
}

// タイトルの絵：燃える家と、運び出される人（小さな盤面ではなく、ゲームを思わせる絵）
export function titleArt() {
    return `<svg viewBox="0 0 120 70" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <rect x="18" y="26" width="60" height="38" fill="#d9ccb3" stroke="#33261e" stroke-width="2"/>
        <path d="M12 28L48 6L84 28" fill="none" stroke="#33261e" stroke-width="2.4" stroke-linejoin="round"/>
        <rect x="26" y="34" width="12" height="10" fill="#f0633a" opacity=".45"/><rect x="58" y="34" width="12" height="10" fill="#8d8a87" opacity=".5"/>
        <rect x="42" y="46" width="10" height="18" fill="#b2733f" stroke="#33261e" stroke-width="1"/>
        <g transform="translate(22 26) scale(2)"><path d="${FLAME}" fill="#e8492b"/><path d="${FLAME_IN}" fill="#ffc94a"/></g>
        <g transform="translate(56 30) scale(1.4)"><path d="${FLAME}" fill="#e8492b"/><path d="${FLAME_IN}" fill="#ffc94a"/></g>
        <circle cx="60" cy="38" r="5" fill="#a3a09c" opacity=".7"/><circle cx="66" cy="34" r="4" fill="#b9b6b2" opacity=".7"/>
        <g transform="translate(98 52)">${firefighterSvg(PLAYER_COLORS[0], 0, 0, '', 6)}</g>
        <g transform="translate(88 42)"><rect x="-5" y="-5" width="10" height="10" rx="2" fill="#1d4f91" stroke="#fff" stroke-width=".8"/>${personPath(0, 0.6, 3.4)}</g>
    </svg>`;
}
