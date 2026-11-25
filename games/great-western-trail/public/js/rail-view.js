/**
 * 鉄道の盤（SVG）。0〜39 のマスを4段の蛇行で並べる
 * 駅（待避線）はマスの間の脇に、都市の紋章は都市の値と同じ番号のマスの下に描く（運賃は、機関車と都市の値の間の × の数）
 * 選べるマス（targets）を光らせ、タップで onPick(space) を呼ぶ
 */

import { STATIONS, SIGNALS, CITIES, PLAYER_COLORS, LAST_SPACE } from './data.js';
import { stationAt } from './rules.js';

const COLS = 10;
const CW = 64;
const RH = 104;
const X0 = 42;
const Y0 = 58;
export const RAIL_W = X0 * 2 + CW * (COLS - 1);
export const RAIL_H = Y0 + RH * 3 + 70;

function spacePos(n) {
    const row = Math.floor(n / COLS);
    const col = n % COLS;
    const x = X0 + (row % 2 === 0 ? col : COLS - 1 - col) * CW;
    return { x, y: Y0 + row * RH };
}

export function railPos(x) {
    if (Number.isInteger(x)) return spacePos(x);
    const a = spacePos(x - 0.5);
    const b = spacePos(x + 0.5);
    if (a.y === b.y) return { x: (a.x + b.x) / 2, y: a.y - 30 };
    return { x: a.x - 30, y: (a.y + b.y) / 2 };
}

export default class RailView {
    constructor(root, { onPick } = {}) {
        this.root = root;
        this.onPick = onPick;
        root.addEventListener('click', (event) => {
            const g = event.target.closest('[data-space]');
            if (g && g.classList.contains('lit')) this.onPick?.(Number(g.dataset.space));
        });
    }

    render(state, targets = [], me = null) {
        const parts = [];
        // 線路
        const path = [];
        for (let n = 0; n <= LAST_SPACE; n++) {
            const p = spacePos(n);
            path.push(`${n === 0 ? 'M' : 'L'}${p.x} ${p.y}`);
        }
        parts.push(`<path d="${path.join(' ')}" class="rail-line"/>`);
        // 待避線
        STATIONS.forEach((st, i) => {
            if (st.space === LAST_SPACE) return;
            const p = railPos(st.space);
            const a = spacePos(st.space - 0.5);
            const b = spacePos(st.space + 0.5);
            parts.push(`<path d="M${a.x} ${a.y} L${p.x} ${p.y} L${b.x} ${b.y}" class="rail-spur"/>`);
        });
        // ×（運賃の目印）：そのマスの次との間
        SIGNALS.forEach(n => {
            const a = spacePos(n);
            const b = spacePos(n + 1);
            const x = (a.x + b.x) / 2;
            const y = (a.y + b.y) / 2 + 2;
            parts.push(`<text x="${x}" y="${y + 18}" class="signal">×</text>`);
        });
        // マス
        for (let n = 0; n <= LAST_SPACE; n++) {
            const p = spacePos(n);
            const lit = targets.includes(n);
            if (n === LAST_SPACE) continue;
            parts.push(`<g data-space="${n}" class="${lit ? 'lit' : ''}">${lit ? `<circle cx="${p.x}" cy="${p.y}" r="17" class="target-ring"/>` : ''}
                <circle cx="${p.x}" cy="${p.y}" r="11" class="rail-space${n === 0 ? ' start' : ''}"/><text x="${p.x}" y="${p.y + 4}" class="rail-num">${n}</text></g>`);
        }
        // 駅
        STATIONS.forEach((st, i) => {
            const p = railPos(st.space);
            const lit = targets.includes(st.space);
            const s = state.stations[i];
            const discs = s.discs.map((seat, k) => `<circle cx="${p.x - 14 + k * 9}" cy="${p.y + 21}" r="4" fill="${PLAYER_COLORS[seat]}" class="disc-dot"/>`).join('');
            const master = s.master ? `<text x="${p.x + 19}" y="${p.y - 10}" class="master-mark">長</text>` : '';
            parts.push(`<g data-space="${st.space}" class="${lit ? 'lit' : ''}">${lit ? `<rect x="${p.x - 22}" y="${p.y - 22}" width="44" height="44" rx="9" class="target-ring"/>` : ''}
                <rect x="${p.x - 16}" y="${p.y - 15}" width="32" height="30" rx="5" class="station${st.dark ? ' dark' : ''}${me !== null && s.discs.includes(me) ? ' mine' : ''}"/>
                <text x="${p.x}" y="${p.y - 2}" class="station-vp">${st.vp}点</text><text x="${p.x}" y="${p.y + 10}" class="station-cost">$${st.cost}</text>${master}${discs}</g>`);
        });
        // 都市
        CITIES.forEach(c => {
            const p = spacePos(c.value);
            const y = p.y + 36;
            const dots = state.players.flatMap(pl => Array(pl.cities[c.id]).fill(pl.seat))
                .map((seat, k) => `<circle cx="${p.x - 12 + (k % 4) * 8}" cy="${y + 26 + Math.floor(k / 4) * 8}" r="3.5" fill="${PLAYER_COLORS[seat]}" class="disc-dot"/>`).join('');
            parts.push(`<g class="city"><path d="M${p.x - 13} ${y - 9} h26 v9 a13 13 0 0 1 -26 0 Z" class="crest${c.dark ? ' dark' : ''}"/>
                <text x="${p.x}" y="${y + 4}" class="crest-value">${c.value}</text><text x="${p.x}" y="${y + 18}" class="city-name">${c.short}</text>${dots}</g>`);
        });
        // 機関車
        const at = {};
        state.players.forEach(pl => {
            const p = railPos(pl.engine);
            const k = (at[pl.engine] = (at[pl.engine] ?? -1) + 1);
            const dx = pl.engine === 0 ? (k - (state.n - 1) / 2) * 11 : 0;
            parts.push(`<g transform="translate(${p.x + dx} ${p.y - 17})" class="engine${pl.seat === state.turn.seat && state.phase === 'play' ? ' active' : ''}">
                <rect x="-7" y="-6" width="14" height="10" rx="2" fill="${PLAYER_COLORS[pl.seat]}"/><rect x="-4" y="-11" width="5" height="6" fill="${PLAYER_COLORS[pl.seat]}"/></g>`);
        });
        this.root.innerHTML = `<svg viewBox="0 0 ${RAIL_W} ${RAIL_H}" class="rail-svg" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
    }
}

export { stationAt };
