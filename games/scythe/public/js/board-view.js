/**
 * 地図（SVG）。六角の領地・川・トンネル・遭遇の印・本拠地・建物・資源・ユニットを描く
 * 拡大と移動（2本指・ホイール・ボタン）を受け、タップした領地を onTap(hex) で知らせる
 */

import { MAP, TERRAINS, FACTIONS, RESOURCES, STRUCTURES } from './data.js';

const R = 10;                       // 六角の半径
const W = Math.sqrt(3) * R;         // 六角の幅
const MARGIN = 4;
const MAX_ZOOM = 3.2;
const DRAG_PX = 8;
const SVG_NS = 'http://www.w3.org/2000/svg';

export const RES_COLORS = { oil: '#2b2b2b', metal: '#8e9aa6', food: '#e7c04f', wood: '#8a5a2b' };
export const RES_GLYPH = { oil: '油', metal: '鉄', food: '食', wood: '木' };
const STRUCT_GLYPH = { mine: '鉱', mill: '風', armory: '武', monument: '碑' };

// 地形の小さな絵（領地の上の方に薄く描く）
const TERRAIN_ART = {
    mountain: '<path d="M-4 1.5 -1.2 -3 0.6 -0.4 1.8 -2 4 1.5Z" fill="#ffffff" opacity=".35"/>',
    forest: '<path d="M-2.6 1.6-.9-2.8.8 1.6ZM.4 1.6 2.1-1.8 3.8 1.6Z" fill="#20381a" opacity=".45"/>',
    farm: '<path d="M-4-1.5h8M-4 0h8M-4 1.5h8" stroke="#8a6c1c" stroke-width=".6" opacity=".55"/>',
    tundra: '<path d="M-4 0q1-1.2 2 0t2 0 2 0 2 0" stroke="#ffffff" stroke-width=".7" fill="none" opacity=".6"/>',
    village: '<path d="M-2.6 1.8v-2.6l2.6-2 2.6 2v2.6Z" fill="#5d3216" opacity=".45"/>',
    lake: '<path d="M-4-.6q1-1 2 0t2 0 2 0 2 0M-3 1.4q1-1 2 0t2 0 2 0" stroke="#e8f4ff" stroke-width=".6" fill="none" opacity=".7"/>',
    factory: '<g fill="#f2e3f4" opacity=".55"><circle r="2.6"/><circle r="1.1" fill="#8c6d8f"/></g>'
};

const el = (name, attrs = {}) => {
    const node = document.createElementNS(SVG_NS, name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
};

export function hexCenter(id) {
    const h = MAP.hexes[id];
    if (h.terrain === 'home') return HOME_POS[h.home];
    return { x: MARGIN + 10 + W * (h.c + 0.5 + (h.r % 2) * 0.5), y: MARGIN + 10 + R + h.r * 1.5 * R };
}

const HOME_POS = (() => {
    const board = MAP.hexes.filter(h => h.terrain !== 'home');
    const centers = board.map(h => ({ x: MARGIN + 10 + W * (h.c + 0.5 + (h.r % 2) * 0.5), y: MARGIN + 10 + R + h.r * 1.5 * R }));
    const cx = centers.reduce((a, p) => a + p.x, 0) / centers.length;
    const cy = centers.reduce((a, p) => a + p.y, 0) / centers.length;
    const out = {};
    MAP.hexes.filter(h => h.terrain === 'home').forEach(h => {
        const pts = h.adj.map(id => centers[id]);
        const mx = pts.reduce((a, p) => a + p.x, 0) / pts.length;
        const my = pts.reduce((a, p) => a + p.y, 0) / pts.length;
        const len = Math.hypot(mx - cx, my - cy) || 1;
        out[h.home] = { x: mx + (mx - cx) / len * 17, y: my + (my - cy) / len * 17 };
    });
    return out;
})();

const corner = (i) => {
    const a = Math.PI / 180 * (60 * i - 30);
    return { x: R * Math.cos(a), y: R * Math.sin(a) };
};
const HEX_POINTS = [0, 1, 2, 3, 4, 5].map(i => corner(i)).map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(' ');

// 動く部品を、描き直しの前後で見分けられる名前を付けた g に包む（piece-motion.js）。group を省くと「値」として扱う
const mk = (node, key, group, value = 1) => {
    const wrap = el('g', { 'data-mk': key, ...(group ? { 'data-mg': group } : {}), 'data-mv': value });
    wrap.append(node);
    return wrap;
};

export default class BoardView {
    constructor(root) {
        this.root = root;
        this.svg = el('svg', { class: 'board-svg' });
        root.prepend(this.svg);
        const all = MAP.hexes.map((_, id) => hexCenter(id));
        const minX = Math.min(...all.map(p => p.x)) - R - 2;
        const minY = Math.min(...all.map(p => p.y)) - R - 2;
        const maxX = Math.max(...all.map(p => p.x)) + R + 2;
        const maxY = Math.max(...all.map(p => p.y)) + R + 2;
        this.ox = minX;
        this.oy = minY;
        this.w = maxX - minX;
        this.h = maxY - minY;
        this.k = 1;
        this.cx = this.ox + this.w / 2;
        this.cy = this.oy + this.h / 2;
        this.pointers = new Map();
        this.gesture = null;
        this.drawStatic();
        this.layers = { marks: el('g'), items: el('g', { class: 'items' }), hl: el('g', { class: 'hl-layer' }) };
        this.svg.append(this.layers.marks, this.layers.hl, this.layers.items);
        this.bindInput();
        new ResizeObserver(() => this.resize()).observe(root);
        this.resize();
    }

    drawStatic() {
        const g = el('g', { class: 'terrain' });
        MAP.hexes.forEach(h => {
            const p = hexCenter(h.id);
            const hg = el('g', { transform: `translate(${p.x.toFixed(2)},${p.y.toFixed(2)})` });
            if (h.terrain === 'home') {
                const f = FACTIONS[h.home];
                hg.append(el('circle', { r: 7.5, fill: f.color, stroke: '#1d1a16', 'stroke-width': 0.8, opacity: 0.9, class: 'home' }));
                const t = el('text', { y: -3.2, 'text-anchor': 'middle', class: 'home-label', fill: f.ink });
                t.textContent = f.name.slice(0, 2);
                hg.append(t);
            } else {
                hg.append(el('polygon', { points: HEX_POINTS, fill: TERRAINS[h.terrain].color, stroke: '#3b3328', 'stroke-width': 0.5 }));
                const art = el('g', { transform: 'translate(0,-5.2)' });
                art.innerHTML = TERRAIN_ART[h.terrain] ?? '';
                hg.append(art);
                if (h.tunnel) {
                    const t = el('path', { d: 'M-8.2 3.4v-1.6a1.7 1.7 0 0 1 3.4 0v1.6', stroke: '#2a241d', 'stroke-width': 0.9, fill: '#2a241d', opacity: 0.75 });
                    hg.append(t);
                }
            }
            g.append(hg);
        });
        // 川（2つの領地の間の辺）
        const rivers = el('g', { class: 'rivers' });
        MAP.rivers.forEach(key => {
            const [a, b] = key.split('-').map(Number);
            const pa = hexCenter(a);
            const pb = hexCenter(b);
            const mx = (pa.x + pb.x) / 2;
            const my = (pa.y + pb.y) / 2;
            const dx = pb.x - pa.x;
            const dy = pb.y - pa.y;
            const len = Math.hypot(dx, dy);
            const nx = -dy / len * R / 2;
            const ny = dx / len * R / 2;
            rivers.append(el('line', { x1: mx + nx, y1: my + ny, x2: mx - nx, y2: my - ny, stroke: '#4f8fd0', 'stroke-width': 1.6, 'stroke-linecap': 'round' }));
        });
        this.svg.append(g, rivers);
    }

    // 盤面を描き直す。marks：{ hexes: Set（光らせる領地）, selected: unitId, chosen: Set（選んだ領地） }
    render(state, marks = {}) {
        this.state = state;
        const { items, hl, marks: markLayer } = this.layers;
        items.replaceChildren();
        hl.replaceChildren();
        markLayer.replaceChildren();
        // 遭遇の印
        state.encounters.forEach(id => {
            const p = hexCenter(id);
            const g = el('g', { transform: `translate(${(p.x + 5).toFixed(2)},${(p.y - 4.6).toFixed(2)})` });
            g.append(el('circle', { r: 2.3, fill: '#f4e7c5', stroke: '#7a5a1e', 'stroke-width': 0.5 }));
            g.append(el('path', { d: 'M0-1.5.45-.45 1.5 0 .45.45 0 1.5-.45.45-1.5 0-.45-.45Z', fill: '#7a5a1e' }));
            markLayer.append(g);
        });
        // 光らせる領地
        (marks.hexes ?? new Set()).forEach(id => {
            const p = hexCenter(id);
            const shape = MAP.hexes[id].terrain === 'home'
                ? el('circle', { cx: p.x, cy: p.y, r: 8.3, class: 'hl' })
                : el('polygon', { points: HEX_POINTS, transform: `translate(${p.x.toFixed(2)},${p.y.toFixed(2)}) scale(.9)`, class: 'hl' });
            hl.append(shape);
        });
        (marks.chosen ?? new Set()).forEach(id => {
            const p = hexCenter(id);
            hl.append(el('polygon', { points: HEX_POINTS, transform: `translate(${p.x.toFixed(2)},${p.y.toFixed(2)}) scale(.9)`, class: 'chosen' }));
        });
        if (marks.combat !== undefined && marks.combat !== null) {
            const p = hexCenter(marks.combat);
            hl.append(el('polygon', { points: HEX_POINTS, transform: `translate(${p.x.toFixed(2)},${p.y.toFixed(2)}) scale(.92)`, class: 'combat-hl' }));
        }
        // 建物
        state.structures.forEach(s => {
            const p = hexCenter(s.hex);
            const f = FACTIONS[state.players[s.seat].faction];
            const g = el('g', { transform: `translate(${(p.x - 5.6).toFixed(2)},${(p.y - 4.4).toFixed(2)})` });
            g.append(el('rect', { x: -2.2, y: -2.2, width: 4.4, height: 4.4, rx: 0.6, fill: f.color, stroke: '#1d1a16', 'stroke-width': 0.5 }));
            const t = el('text', { y: 1.15, 'text-anchor': 'middle', class: 'glyph', fill: f.ink });
            t.textContent = STRUCT_GLYPH[s.type];
            g.append(t);
            items.append(mk(g, `s-${s.hex}-${s.seat}-${s.type}`));
        });
        // 資源（領地の下の方に並べる）
        state.res.forEach((r, id) => {
            const list = RESOURCES.filter(k => r[k] > 0);
            if (list.length === 0) return;
            const p = hexCenter(id);
            list.forEach((k, i) => {
                const x = p.x - (list.length - 1) * 2.4 + i * 4.8;
                const g = el('g', { transform: `translate(${x.toFixed(2)},${(p.y + 6).toFixed(2)})` });
                g.append(el('rect', { x: -2.1, y: -1.7, width: 4.2, height: 3.4, rx: 0.7, fill: RES_COLORS[k], stroke: '#1d1a16', 'stroke-width': 0.35 }));
                const t = el('text', { y: 1.05, 'text-anchor': 'middle', class: 'res-n', fill: k === 'food' ? '#2b2210' : '#ffffff' });
                t.textContent = r[k];
                g.append(t);
                items.append(mk(g, `r-${id}-${k}`, `r-${k}`, r[k]));
            });
        });
        // ユニット（領地ごと・席ごとにまとめる）
        const byHex = new Map();
        state.units.forEach(u => {
            if (!byHex.has(u.hex)) byHex.set(u.hex, []);
            byHex.get(u.hex).push(u);
        });
        byHex.forEach((units, hex) => {
            const p = hexCenter(hex);
            const seats = [...new Set(units.map(u => u.seat))];
            seats.forEach((seat, si) => {
                const f = FACTIONS[state.players[seat].faction];
                const mine = units.filter(u => u.seat === seat);
                const dy = seats.length > 1 ? (si === 0 ? -2.4 : 2.6) : 0;
                const char = mine.find(u => u.kind === 'char');
                const mechs = mine.filter(u => u.kind === 'mech');
                const workers = mine.filter(u => u.kind === 'worker');
                let x = p.x - 4.2;
                const y = p.y + 0.6 + dy + (MAP.hexes[hex].terrain === 'home' ? 2 : 0);
                const sel = (u) => marks.selected !== undefined && u?.id === marks.selected;
                if (char) {
                    const g = el('g', { transform: `translate(${x.toFixed(2)},${y.toFixed(2)})`, class: sel(char) ? 'unit sel' : 'unit' });
                    g.append(el('circle', { r: 2.9, fill: f.color, stroke: '#111', 'stroke-width': 0.6 }));
                    g.append(el('circle', { r: 1.6, fill: 'none', stroke: f.ink, 'stroke-width': 0.45 }));
                    items.append(mk(g, `u-${hex}-${seat}-char`, `u-${seat}-char`));
                    x += 4.6;
                }
                if (mechs.length) {
                    const g = el('g', { transform: `translate(${x.toFixed(2)},${y.toFixed(2)})`, class: mechs.some(sel) ? 'unit sel' : 'unit' });
                    g.append(el('rect', { x: -2.6, y: -2.6, width: 5.2, height: 5.2, rx: 1.2, fill: f.color, stroke: '#111', 'stroke-width': 0.6 }));
                    const t = el('text', { y: 1.15, 'text-anchor': 'middle', class: 'glyph', fill: f.ink });
                    t.textContent = mechs.length > 1 ? mechs.length : 'M';
                    g.append(t);
                    items.append(mk(g, `u-${hex}-${seat}-mech`, `u-${seat}-mech`, mechs.length));
                    x += 4.6;
                }
                if (workers.length) {
                    const g = el('g', { transform: `translate(${x.toFixed(2)},${y.toFixed(2)})`, class: workers.some(sel) ? 'unit sel' : 'unit' });
                    g.append(el('path', { d: 'M-2 2.1v-1.4a2 2 0 0 1 4 0v1.4Z', fill: f.color, stroke: '#111', 'stroke-width': 0.5 }));
                    g.append(el('circle', { cy: -1.9, r: 1.15, fill: f.color, stroke: '#111', 'stroke-width': 0.5 }));
                    if (workers.length > 1) {
                        const t = el('text', { x: 2.9, y: 2.2, class: 'count' });
                        t.textContent = workers.length;
                        g.append(t);
                    }
                    items.append(mk(g, `u-${hex}-${seat}-worker`, `u-${seat}-worker`, workers.length));
                }
            });
        });
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

    // その領地が見えるように寄せる（拡大しているときだけ）
    reveal(hex) {
        if (this.k <= 1.01) return;
        const p = hexCenter(hex);
        this.cx = p.x;
        this.cy = p.y;
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
    }

    toBoard(clientX, clientY) {
        const rect = this.svg.getBoundingClientRect();
        const s = this.scale;
        return { x: this.vx + (clientX - rect.left) / s, y: this.vy + (clientY - rect.top) / s };
    }

    hexAt({ x, y }) {
        let best = -1;
        let bestD = Infinity;
        MAP.hexes.forEach(h => {
            const p = hexCenter(h.id);
            const d = Math.hypot(p.x - x, p.y - y);
            if (d < bestD) {
                bestD = d;
                best = h.id;
            }
        });
        return bestD <= R * 0.95 ? best : -1;
    }

    // 領地の中心（画面の座標）
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

export { STRUCTURES };
