/**
 * 地図（SVG）。六角の土地・川・建物・橋・町の印・選べる土地の光を描く
 * 拡大と移動（2本指・ホイール・ボタン）を受け、タップした土地を onTap(hex) で知らせる
 */

import * as Motion from './motion/motion.js';
import { TERRAIN_INFO, FACTIONS } from './data.js';
import { HEXES, BRIDGE_PAIRS } from './map.js';

const R = 10;                       // 六角の半径
const W = Math.sqrt(3) * R;         // 六角の幅
const MARGIN = 2;
const MAX_ZOOM = 3.5;
const DRAG_PX = 8;
const SVG_NS = 'http://www.w3.org/2000/svg';

// 建物の形（中心が 0,0）
export const BUILDING_PATHS = {
    D: 'M-3.6 3V-.8L0-4.2 3.6-.8V3Z',
    TP: 'M-5 3.4V-1.2L-2.2-4.2.6-1.2H5V3.4Z',
    TE: 'M-4.2 0a4.2 4.2 0 1 0 8.4 0a4.2 4.2 0 1 0-8.4 0Z',
    SH: 'M-5 4V-2.6H-3.4V-4.6H-1.4V-2.6H1.4V-4.6H3.4V-2.6H5V4Z',
    SA: 'M-5.4 4V.2A5.4 5.4 0 0 1 5.4 .2V4Z'
};

const el = (name, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
};

export function hexCenter(id) {
    const h = HEXES[id];
    return { x: MARGIN + W * (h.c + 0.5 + (h.r % 2) * 0.5), y: MARGIN + R + h.r * 1.5 * R };
}

const corner = (i) => {
    const a = Math.PI / 180 * (60 * i - 30);
    return { x: R * Math.cos(a), y: R * Math.sin(a) };
};
const HEX_POINTS = [0, 1, 2, 3, 4, 5].map(i => corner(i)).map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

// 建物の絵（SVG の文字列）。地図・説明・凡例で同じ形を使う
export function buildingSvg(type, color, { size = 22, ink = '#1b1208' } = {}) {
    return `<svg class="bld" viewBox="-6.5 -6.5 13 13" width="${size}" height="${size}" aria-hidden="true">`
        + `<path d="${BUILDING_PATHS[type]}" fill="${color}" stroke="#fff8e6" stroke-width="2" stroke-linejoin="round"/>`
        + `<path d="${BUILDING_PATHS[type]}" fill="${color}" stroke="${ink}" stroke-width=".9" stroke-linejoin="round"/></svg>`;
}

// 動く部品を、描き直しの前後で見分けられる名前を付けた g に包む（piece-motion.js）。建物は動かず、新しく出るとはねて現れる
const mk = (node, key) => {
    const wrap = el('g', { 'data-mk': key });
    wrap.append(node);
    return wrap;
};

export default class BoardView {
    constructor(root) {
        this.root = root;
        this.svg = el('svg', { class: 'board-svg' });
        root.prepend(this.svg);
        const all = HEXES.map(h => hexCenter(h.id));
        const minX = Math.min(...all.map(p => p.x)) - W / 2 - MARGIN;
        const minY = Math.min(...all.map(p => p.y)) - R - MARGIN;
        const maxX = Math.max(...all.map(p => p.x)) + W / 2 + MARGIN;
        const maxY = Math.max(...all.map(p => p.y)) + R + MARGIN;
        this.ox = minX;
        this.oy = minY;
        this.w = maxX - minX;
        this.h = maxY - minY;
        this.k = 1;
        this.cx = this.ox + this.w / 2;
        this.cy = this.oy + this.h / 2;
        this.pointers = new Map();
        this.gesture = null;
        this.layers = {
            terrain: el('g', { class: 'terrain' }),
            labels: el('g', { class: 'labels' }),
            bridges: el('g', { class: 'bridges' }),
            marks: el('g', { class: 'marks' }),
            items: el('g', { class: 'items' }),
            hl: el('g', { class: 'hl-layer' })
        };
        this.svg.append(this.layers.terrain, this.layers.labels, this.layers.bridges, this.layers.marks, this.layers.hl, this.layers.items);
        this.hexEls = HEXES.map(h => {
            const p = hexCenter(h.id);
            const poly = el('polygon', { points: HEX_POINTS, transform: `translate(${p.x.toFixed(2)},${p.y.toFixed(2)})`, class: h.land ? 'hex land' : 'hex river' });
            this.layers.terrain.append(poly);
            if (h.land) {
                const t = el('text', { x: p.x.toFixed(2), y: (p.y + 7.6).toFixed(2), class: 'hex-label', 'text-anchor': 'middle' });
                t.textContent = h.label;
                this.layers.labels.append(t);
            }
            return poly;
        });
        this.bindInput();
        new ResizeObserver(() => this.resize()).observe(root);
        this.resize();
    }

    // 盤面を描き直す。marks：{ targets: Set（選べる土地）, strong: bool（強く光らせる）, recent: Set（最近変わった土地）,
    //   bridges: [[a,b]]（架けられる橋）, picked: 選んだ土地 }
    render(state, marks = {}) {
        const { items, hl, marks: markLayer, bridges } = this.layers;
        items.replaceChildren();
        hl.replaceChildren();
        markLayer.replaceChildren();
        bridges.replaceChildren();
        state.hexes.forEach((h, id) => {
            const info = TERRAIN_INFO[h.terrain];
            // 地形が変わった土地は、色が移り変わるように見せる（描き直しのあとなので、前の色と比べる）
            if (this.hexEls[id].getAttribute('fill') && this.hexEls[id].getAttribute('fill') !== info.color && this.animateTerrain) {
                const length = Motion.ms(420);
                if (Motion.enabled()) Motion.track(this.hexEls[id].animate([{ opacity: 0.25 }, { opacity: 1 }], { duration: length, easing: 'ease-out' }), length);
            }
            this.hexEls[id].setAttribute('fill', info.color);
        });
        // 橋（架けられる場所の候補は点線）
        (marks.bridges ?? []).forEach(([a, b]) => bridges.append(this.bridgeLine(a, b, null)));
        state.bridges.forEach(b => {
            const f = FACTIONS[state.players[b.owner].faction];
            const line = this.bridgeLine(b.a, b.b, TERRAIN_INFO[f.terrain].color);
            line.setAttribute('data-mk', `br-${b.a}-${b.b}`);
            bridges.append(line);
        });
        // 最近変わった土地
        (marks.recent ?? new Set()).forEach(id => {
            const p = hexCenter(id);
            markLayer.append(el('polygon', { points: HEX_POINTS, transform: `translate(${p.x.toFixed(2)},${p.y.toFixed(2)}) scale(.94)`, class: 'recent' }));
        });
        // 選べる土地
        (marks.targets ?? new Set()).forEach(id => {
            const p = hexCenter(id);
            hl.append(el('polygon', { points: HEX_POINTS, transform: `translate(${p.x.toFixed(2)},${p.y.toFixed(2)}) scale(.86)`, class: marks.strong ? 'hl strong' : 'hl' }));
        });
        if (marks.picked !== undefined && marks.picked !== null) {
            const p = hexCenter(marks.picked);
            hl.append(el('polygon', { points: HEX_POINTS, transform: `translate(${p.x.toFixed(2)},${p.y.toFixed(2)}) scale(.86)`, class: 'picked' }));
        }
        // ヒントのおすすめの土地
        if (marks.hint !== undefined && marks.hint !== null) {
            const p = hexCenter(marks.hint);
            hl.append(el('polygon', { points: HEX_POINTS, transform: `translate(${p.x.toFixed(2)},${p.y.toFixed(2)}) scale(.78)`, class: 'recommended' }));
        }
        // 建物と町の印
        state.hexes.forEach((h, id) => {
            if (!h.building) return;
            const p = hexCenter(id);
            const f = FACTIONS[state.players[h.owner].faction];
            const color = TERRAIN_INFO[f.terrain].color;
            const g = el('g', { transform: `translate(${p.x.toFixed(2)},${(p.y + 0.4).toFixed(2)}) scale(1.1)`, class: 'bld' });
            g.append(el('path', { d: BUILDING_PATHS[h.building], fill: color, stroke: '#fff8e6', 'stroke-width': 2, 'stroke-linejoin': 'round' }));
            g.append(el('path', { d: BUILDING_PATHS[h.building], fill: color, stroke: '#1b1208', 'stroke-width': 0.9, 'stroke-linejoin': 'round' }));
            items.append(mk(g, `b-${id}-${h.building}`));
            if (h.town) {
                const t = el('g', { transform: `translate(${(p.x + 5.2).toFixed(2)},${(p.y - 5.4).toFixed(2)})`, class: 'town-mark' });
                t.append(el('circle', { r: 2.2, fill: '#f4cf5d', stroke: '#5a3e00', 'stroke-width': 0.5 }));
                t.append(el('path', { d: 'M-.9-.3a.9.9 0 1 1 1.8 0a.9.9 0 1 1-1.8 0M0 .5V1.6', stroke: '#5a3e00', 'stroke-width': 0.45, fill: 'none' }));
                items.append(mk(t, `town-${id}`));
            }
        });
        this.animateTerrain = true;
    }

    bridgeLine(a, b, color) {
        const pa = hexCenter(a);
        const pb = hexCenter(b);
        const g = el('g', { class: color ? 'bridge' : 'bridge-spot' });
        g.append(el('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, class: 'bridge-under' }));
        g.append(el('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, class: 'bridge-top', stroke: color ?? '#fff3c4' }));
        return g;
    }

    // ---- 拡大と移動 ----

    get scale() {
        return Math.min(this.cw / this.w, this.ch / this.h) * this.k;
    }

    resize() {
        const rect = this.root.getBoundingClientRect();
        this.cw = rect.width;
        this.ch = rect.height;
        this.apply();
    }

    resetZoom() {
        this.k = 1;
        this.cx = this.ox + this.w / 2;
        this.cy = this.oy + this.h / 2;
        this.apply();
    }

    zoomBy(factor, point = { x: this.cx, y: this.cy }) {
        const k = Math.min(MAX_ZOOM, Math.max(1, this.k * factor));
        const ratio = this.k / k;
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
        const clamp = (c, v, o, full) => (v >= full ? o + full / 2 : Math.min(o + full - v / 2, Math.max(o + v / 2, c)));
        this.cx = clamp(this.cx, vw, this.ox, this.w);
        this.cy = clamp(this.cy, vh, this.oy, this.h);
        this.vx = this.cx - vw / 2;
        this.vy = this.cy - vh / 2;
        this.svg.setAttribute('viewBox', `${this.vx.toFixed(2)} ${this.vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`);
        this.root.classList.toggle('zoomed', this.k > 1.01);
        this.root.classList.toggle('close-up', this.k > 1.7);
    }

    toBoard(clientX, clientY) {
        const rect = this.svg.getBoundingClientRect();
        const s = this.scale;
        return { x: this.vx + (clientX - rect.left) / s, y: this.vy + (clientY - rect.top) / s };
    }

    hexAt({ x, y }) {
        let best = -1;
        let bestD = Infinity;
        HEXES.forEach(h => {
            const p = hexCenter(h.id);
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < bestD) {
                bestD = d;
                best = h.id;
            }
        });
        return bestD <= R ? best : -1;
    }

    // 土地の中心（画面の座標）
    hexPoint(id) {
        const p = hexCenter(id);
        const rect = this.svg.getBoundingClientRect();
        const s = this.scale;
        return { x: rect.left + (p.x - this.vx) * s, y: rect.top + (p.y - this.vy) * s };
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
            if (g?.type === 'tap' && this.pointers.size === 0 && event.type === 'pointerup') {
                const hex = this.hexAt(this.toBoard(event.clientX, event.clientY));
                if (hex >= 0) this.onTap?.(hex);
            }
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

export { BRIDGE_PAIRS };
