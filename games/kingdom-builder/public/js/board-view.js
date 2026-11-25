/**
 * 盤面（20×20 の六角マス）の描画と、拡大・移動・タップ
 * - 地形と盤面の境目は、ゲームの初めに一度だけ描く。家・タイルの残り・置けるマスの光は、毎回描き直す
 * - 拡大：2本指でつまむ、マウスのホイール、＋−のボタン。1本指でドラッグすると動かす
 * - タップ：マスが十分に大きければ、そのマスを選ぶ。小さいときは、指の届く範囲に選べるマスが1つだけならそれを選び、
 *   2つ以上あればそこを拡大する（縦持ちのスマホでも、指で選びやすいように）
 */

import { CELLS, SIZE, NEIGHBORS_BY_DIR, rowOf, colOf, sectorOf } from './hex.js';
import { HEX_R, HEX_W, HEX_POINTS, PLAYER_COLORS, PLAYER_LINES } from './art.js';

const NS = 'http://www.w3.org/2000/svg';
const MARGIN = 3;
const ROW_H = HEX_R * 1.5;
export const BOARD_W = HEX_W * (SIZE + 0.5) + MARGIN * 2;
export const BOARD_H = ROW_H * (SIZE - 1) + HEX_R * 2 + MARGIN * 2;
const MAX_ZOOM = 4.5;
const TAP_PX = 22;          // 指の届く範囲（画面の px）
const PICK_HEX_PX = 30;     // マスがこの幅（px）以上なら、そのマスをそのまま選ぶ
const DRAG_PX = 8;

export function centerOf(cell) {
    const r = rowOf(cell);
    return { x: MARGIN + HEX_W * (colOf(cell) + (r % 2 ? 0.5 : 0)) + HEX_W / 2, y: MARGIN + HEX_R + ROW_H * r };
}
const CENTERS = Array.from({ length: CELLS }, (_, cell) => centerOf(cell));

function corner(cell, k) {
    const { x, y } = CENTERS[cell];
    const a = Math.PI / 180 * (60 * k - 90);
    return [x + HEX_R * Math.cos(a), y + HEX_R * Math.sin(a)];
}
// 方向ごとの辺（hex.js の方向：0 右、1 右上、2 左上）の両端の頂点
const EDGE_CORNERS = [[1, 2], [0, 1], [5, 0]];

const el = (name, attrs = {}) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
};

export default class BoardView {
    // root：盤面を入れる要素。onPick(cell)：選べるマスを選んだ。onInfo(cell)：選べないマスをタップした
    constructor(root, { onPick, onInfo } = {}) {
        this.root = root;
        this.onPick = onPick;
        this.onInfo = onInfo;
        this.svg = el('svg', { class: 'board', role: 'img', 'aria-label': '盤面' });
        this.layers = {};
        ['terrain', 'borders', 'locs', 'houses', 'marks'].forEach(name => {
            this.layers[name] = el('g', { class: `layer-${name}` });
            this.svg.append(this.layers[name]);
        });
        root.append(this.svg);
        this.terrainKey = null;
        this.pick = new Set();
        this.k = 1;
        this.cx = BOARD_W / 2;
        this.cy = BOARD_H / 2;
        this.cw = 0;
        this.ch = 0;
        this.pointers = new Map();
        this.gesture = null;
        this.bindInput();
        new ResizeObserver(() => this.resize()).observe(root);
    }

    // ---- 描画 ----

    setMap(terrain, locations) {
        if (terrain === this.terrainKey) return;
        this.terrainKey = terrain;
        const { terrain: gt, borders, locs } = this.layers;
        gt.replaceChildren();
        borders.replaceChildren();
        for (let cell = 0; cell < CELLS; cell++) {
            const { x, y } = CENTERS[cell];
            gt.append(el('use', { href: `#t-${terrain[cell]}`, x, y }));
        }
        // マスの線と、盤面（区画）の境目
        const thin = [];
        const thick = [];
        for (let cell = 0; cell < CELLS; cell++) {
            for (let dir = 0; dir < 3; dir++) {
                const n = NEIGHBORS_BY_DIR[cell][dir];
                if (n < 0) continue;
                const [a, b] = EDGE_CORNERS[dir].map(k => corner(cell, k));
                (sectorOf(n) !== sectorOf(cell) ? thick : thin).push(`M${a[0].toFixed(2)} ${a[1].toFixed(2)}L${b[0].toFixed(2)} ${b[1].toFixed(2)}`);
            }
        }
        borders.append(el('path', { d: thin.join(''), class: 'grid' }), el('path', { d: thick.join(''), class: 'sector' }));
        this.locCells = locations.map(l => ({ cell: l.cell, type: l.type }));
        locs.replaceChildren();
        this.resetZoom();
    }

    // state：{ owner, locations, pick（選べるマス）, selected, recent（さっき建った家）}
    render(state) {
        const { houses, marks, locs } = this.layers;
        this.pick = new Set(state.pick ?? []);
        // 場所のしるしと、残りのタイル
        locs.replaceChildren();
        state.locations.forEach(l => {
            const { x, y } = CENTERS[l.cell];
            const g = el('g', { transform: `translate(${x} ${y})` });
            g.append(el('use', { href: `#l-${l.type}`, transform: 'translate(0 -1.2) scale(.78)' }));
            for (let i = 0; i < 2; i++) {
                g.append(el('rect', { x: -3.6 + i * 4, y: 4.4, width: 3.2, height: 2.6, rx: .6, class: i < l.tiles ? 'tile-left' : 'tile-gone' }));
            }
            locs.append(g);
        });
        houses.replaceChildren();
        state.owner.forEach((seat, cell) => {
            if (seat < 0) return;
            const { x, y } = CENTERS[cell];
            const g = el('g', { transform: `translate(${x} ${y + .4})`, class: 'house' });
            g.append(el('use', { href: '#house', fill: PLAYER_COLORS[seat], stroke: PLAYER_LINES[seat], 'stroke-width': .9 }));
            houses.append(g);
        });
        marks.replaceChildren();
        (state.recent ?? []).forEach(cell => {
            const { x, y } = CENTERS[cell];
            marks.append(el('circle', { cx: x, cy: y, r: 7.4, class: 'recent' }));
        });
        this.pick.forEach(cell => {
            const { x, y } = CENTERS[cell];
            marks.append(el('polygon', { points: HEX_POINTS, transform: `translate(${x} ${y}) scale(.86)`, class: state.picking === 'source' ? 'pick source' : 'pick' }));
        });
        if (state.selected >= 0) {
            const { x, y } = CENTERS[state.selected];
            marks.append(el('polygon', { points: HEX_POINTS, transform: `translate(${x} ${y}) scale(.9)`, class: 'selected' }));
        }
    }

    // ---- 拡大と移動 ----

    get scale() {
        return Math.min(this.cw / BOARD_W, this.ch / BOARD_H) * this.k;
    }

    resize() {
        const rect = this.root.getBoundingClientRect();
        this.cw = rect.width;
        this.ch = rect.height;
        this.apply();
    }

    resetZoom() {
        this.k = 1;
        this.cx = BOARD_W / 2;
        this.cy = BOARD_H / 2;
        this.apply();
    }

    zoomBy(factor, point = { x: this.cx, y: this.cy }) {
        const k = Math.min(MAX_ZOOM, Math.max(1, this.k * factor));
        const ratio = this.k / k;
        // point の位置を画面の同じところに残す
        this.cx = point.x + (this.cx - point.x) * ratio;
        this.cy = point.y + (this.cy - point.y) * ratio;
        this.k = k;
        this.apply();
    }

    apply() {
        if (!this.cw || !this.ch) return;
        const s = this.scale;
        const vw = this.cw / s;
        const vh = this.ch / s;
        const clamp = (c, v, full) => (v >= full ? full / 2 : Math.min(full - v / 2, Math.max(v / 2, c)));
        this.cx = clamp(this.cx, vw, BOARD_W);
        this.cy = clamp(this.cy, vh, BOARD_H);
        this.vx = this.cx - vw / 2;
        this.vy = this.cy - vh / 2;
        this.svg.setAttribute('viewBox', `${this.vx.toFixed(2)} ${this.vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`);
        this.root.classList.toggle('zoomed', this.k > 1.01);
    }

    toBoard(clientX, clientY) {
        const rect = this.svg.getBoundingClientRect();
        const s = this.scale;
        return { x: this.vx + (clientX - rect.left) / s, y: this.vy + (clientY - rect.top) / s };
    }

    cellAt({ x, y }) {
        const r0 = Math.round((y - MARGIN - HEX_R) / ROW_H);
        let best = -1;
        let bestD = Infinity;
        for (let r = r0 - 1; r <= r0 + 1; r++) {
            if (r < 0 || r >= SIZE) continue;
            const c0 = Math.round((x - MARGIN - HEX_W / 2) / HEX_W - (r % 2 ? 0.5 : 0));
            for (let c = c0 - 1; c <= c0 + 1; c++) {
                if (c < 0 || c >= SIZE) continue;
                const p = CENTERS[r * SIZE + c];
                const d = Math.hypot(p.x - x, p.y - y);
                if (d < bestD) { bestD = d; best = r * SIZE + c; }
            }
        }
        return bestD <= HEX_R ? best : -1;
    }

    tap(point) {
        const hexPx = HEX_W * this.scale;
        const exact = this.cellAt(point);
        if (hexPx >= PICK_HEX_PX) {
            if (this.pick.has(exact)) this.onPick?.(exact);
            else if (exact >= 0) this.onInfo?.(exact);
            return;
        }
        const reach = TAP_PX / this.scale + HEX_W / 2;
        const near = [...this.pick].filter(cell => Math.hypot(CENTERS[cell].x - point.x, CENTERS[cell].y - point.y) <= reach);
        if (near.length === 1) this.onPick?.(near[0]);
        else if (near.length > 1) this.zoomBy(Math.max(2, 44 / hexPx), point);
        else if (exact >= 0) this.onInfo?.(exact);
    }

    bindInput() {
        const svg = this.svg;
        svg.addEventListener('pointerdown', (event) => {
            try {
                svg.setPointerCapture(event.pointerId);
            } catch { /* 捕まえられなくても、タップと移動は受け取れる */ }
            this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (this.pointers.size === 1) {
                this.gesture = { type: 'tap', start: { x: event.clientX, y: event.clientY }, cx: this.cx, cy: this.cy };
            } else if (this.pointers.size === 2) {
                const [a, b] = [...this.pointers.values()];
                this.gesture = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), k: this.k, mid: this.toBoard((a.x + b.x) / 2, (a.y + b.y) / 2) };
            }
        });
        svg.addEventListener('pointermove', (event) => {
            if (!this.pointers.has(event.pointerId)) return;
            this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const g = this.gesture;
            if (!g) return;
            if (g.type === 'pinch' && this.pointers.size >= 2) {
                const [a, b] = [...this.pointers.values()];
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                if (g.dist > 0) this.zoomBy((g.k * dist / g.dist) / this.k, g.mid);
                return;
            }
            const dx = event.clientX - g.start.x;
            const dy = event.clientY - g.start.y;
            if (g.type === 'tap' && Math.hypot(dx, dy) > DRAG_PX) g.type = 'pan';
            if (g.type === 'pan') {
                const s = this.scale;
                this.cx = g.cx - dx / s;
                this.cy = g.cy - dy / s;
                this.apply();
            }
        });
        const end = (event) => {
            if (!this.pointers.has(event.pointerId)) return;
            this.pointers.delete(event.pointerId);
            const g = this.gesture;
            if (g?.type === 'tap' && this.pointers.size === 0 && event.type === 'pointerup') this.tap(this.toBoard(event.clientX, event.clientY));
            if (this.pointers.size === 0) this.gesture = null;
            else if (g?.type === 'pinch') this.gesture = { type: 'done' };
        };
        svg.addEventListener('pointerup', end);
        svg.addEventListener('pointercancel', end);
        svg.addEventListener('wheel', (event) => {
            event.preventDefault();
            this.zoomBy(event.deltaY < 0 ? 1.25 : 0.8, this.toBoard(event.clientX, event.clientY));
        }, { passive: false });
    }
}
