/**
 * 盤面とダイスの絵（自作の SVG）
 * 列は下端をそろえ、頂上が山形になるように並べる。ランナーは列ごとの要素を使い回し、位置の変化を動きで見せる
 */

import { COLUMNS, COLUMN_LENGTH } from './game.js';
import * as Motion from './motion/motion.js';

export const PLAYER_COLORS = ['#e0483a', '#2f74d8', '#2fa35a', '#efbe2c'];
const SVG_NS = 'http://www.w3.org/2000/svg';

// 盤面の大きさ（SVG の座標）
const COL_W = 34;
const CELL_H = 25;
const TOP = 26;                 // 旗のぶんの余白
const ROWS = 13;
const LABEL_H = 26;
export const BOARD_WIDTH = COL_W * COLUMNS.length;
export const BOARD_HEIGHT = TOP + ROWS * CELL_H + LABEL_H;

const colX = col => (col - 2) * COL_W + COL_W / 2;
const cellY = pos => TOP + (ROWS - pos) * CELL_H + CELL_H / 2; // pos：1 が一番下
// 同じマスに何人かいるときの、マーカーのずらし方（席ごと）
const MARKER_OFFSET = [[-7, -5], [7, -5], [-7, 5], [7, 5]];

// ダイス 1 つ（size の正方形）
export function dieSvg(value, size = 40, extra = '') {
    const pips = {
        1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[26, 26], [50, 50], [74, 74]],
        4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
        6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]]
    }[value] ?? [];
    return `<svg class="die ${extra}" viewBox="0 0 100 100" width="${size}" height="${size}" aria-label="${value}">
        <rect x="4" y="4" width="92" height="92" rx="18" class="die-face"/>
        ${pips.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5" class="die-pip"/>`).join('')}</svg>`;
}

// 旗（頂上・取った列の印）
const flag = (x, y, color) => `<g transform="translate(${x} ${y})"><path d="M-1 0V-20" stroke="#2a2f3a" stroke-width="2.2" stroke-linecap="round"/><path d="M0-20 14-15 0-10Z" fill="${color}" stroke="#1b1f27" stroke-width="1.2" stroke-linejoin="round"/></g>`;

const svgEl = (tag, attrs = {}) => {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
};

export default class BoardView {
    constructor(svg) {
        this.svg = svg;
        svg.setAttribute('viewBox', `0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`);
        this.layers = {};
        ['cells', 'trail', 'markers', 'runners', 'fx'].forEach(name => {
            this.layers[name] = svgEl('g', { class: `layer-${name}` });
            svg.appendChild(this.layers[name]);
        });
        this.runnerEls = new Map();
    }

    /**
     * view：ゲームのビュー / highlight：光らせる列（選んでいる組の和）
     */
    render(view, { highlight = [] } = {}) {
        const current = view.current;
        const base = col => (current === null ? 0 : view.players[current].progress[col]);
        // マス
        this.layers.cells.innerHTML = COLUMNS.map(col => {
            const len = COLUMN_LENGTH[col];
            const owner = view.claimed[col];
            const x = colX(col);
            let cells = '';
            for (let pos = 1; pos <= len; pos++) {
                const top = pos === len;
                const cls = `cell${top ? ' summit' : ''}${owner !== null ? ' claimed' : ''}${highlight.includes(col) ? ' lit' : ''}`;
                const style = owner !== null ? ` style="fill:${PLAYER_COLORS[owner]}"` : '';
                cells += `<rect class="${cls}"${style} x="${x - COL_W / 2 + 2.5}" y="${cellY(pos) - CELL_H / 2 + 2}" width="${COL_W - 5}" height="${CELL_H - 4}" rx="5"/>`;
            }
            const flagColor = owner !== null ? PLAYER_COLORS[owner] : '#f4efe2';
            const label = `<circle cx="${x}" cy="${TOP + ROWS * CELL_H + LABEL_H / 2}" r="11.5" class="col-label${highlight.includes(col) ? ' lit' : ''}"/>
                <text x="${x}" y="${TOP + ROWS * CELL_H + LABEL_H / 2 + 4.5}" class="col-num">${col}</text>`;
            return `<g class="column" data-col="${col}">${cells}${flag(x - 4, cellY(len) - CELL_H / 2 + 1, flagColor)}${label}</g>`;
        }).join('');
        // この手番で進んだ分（止めれば残り、バーストすれば失う）
        this.layers.trail.innerHTML = Object.entries(view.runners).map(([key, pos]) => {
            const col = Number(key);
            const from = base(col) + 1;
            if (pos < from) return '';
            const y1 = cellY(pos) - CELL_H / 2 + 3;
            const y2 = cellY(from) + CELL_H / 2 - 3;
            return `<rect class="trail" x="${colX(col) - COL_W / 2 + 4}" y="${y1}" width="${COL_W - 8}" height="${y2 - y1}" rx="5"/>`;
        }).join('');
        // 各人のマーカー
        this.layers.markers.innerHTML = view.players.flatMap(p => COLUMNS.filter(col => p.progress[col] > 0 && view.claimed[col] === null).map(col => {
            const [dx, dy] = MARKER_OFFSET[p.id];
            return `<circle class="marker" cx="${colX(col) + dx}" cy="${cellY(p.progress[col]) + dy}" r="6" style="fill:${PLAYER_COLORS[p.id]}"/>`;
        })).join('');
        this.renderRunners(view.runners);
    }

    // ランナー：列ごとの要素を使い回して、上に進む動きを見せる
    renderRunners(runners) {
        const keep = new Set();
        Object.entries(runners).forEach(([key, pos]) => {
            const col = Number(key);
            keep.add(col);
            let el = this.runnerEls.get(col);
            if (!el) {
                el = svgEl('g', { class: 'runner' });
                el.innerHTML = '<circle r="9.5" class="runner-body"/><circle r="3.6" cy="-1" class="runner-dot"/>';
                el.style.transform = `translate(${colX(col)}px, ${cellY(Math.max(1, pos - 1)) + CELL_H}px)`;
                this.layers.runners.appendChild(el);
                this.runnerEls.set(col, el);
                el.getBoundingClientRect(); // 置いた位置から動かすために、いったん描かせる
            }
            el.style.transform = `translate(${colX(col)}px, ${cellY(pos)}px)`;
        });
        for (const [col, el] of this.runnerEls) {
            if (!keep.has(col)) {
                el.remove();
                this.runnerEls.delete(col);
            }
        }
    }

    // バースト：失ったランナーの所に、赤い × を出して消す
    showBust(lost) {
        Object.entries(lost).forEach(([key, pos]) => {
            const x = colX(Number(key));
            const y = cellY(pos);
            const g = svgEl('g', { class: 'bust-mark' });
            g.innerHTML = `<path d="M${x - 9} ${y - 9}l18 18M${x + 9} ${y - 9}l-18 18"/>`;
            this.layers.fx.appendChild(g);
            setTimeout(() => g.remove(), Motion.ms(1400));
        });
    }

    // 列を取った：列を光らせる
    showClaim(col) {
        const g = svgEl('rect', {
            class: 'claim-fx', x: colX(col) - COL_W / 2 + 1, y: cellY(COLUMN_LENGTH[col]) - CELL_H / 2,
            width: COL_W - 2, height: COLUMN_LENGTH[col] * CELL_H, rx: 7
        });
        this.layers.fx.appendChild(g);
        setTimeout(() => g.remove(), Motion.ms(1600));
    }
}
