/**
 * 地図の描画と、拡大・移動・タップ
 * - 線と都市は、地図と地域が決まったときに一度だけ描く。家・建てられる都市の光・費用は、毎回描き直す
 * - 拡大：2本指でつまむ、マウスのホイール、＋−のボタン。1本指でドラッグすると動かす
 * - タップ：都市が十分に大きければ、その都市を選ぶ。小さいときは、指の届く範囲に都市が1つだけならそれを選び、
 *   2つ以上あればそこを拡大する（縦持ちのスマホでも、指で選びやすいように）
 */

import { MAPS } from './maps.js';
import { REGION_COLORS, PLAYER_COLORS } from './art.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 1000;
const H = 1000;
const R = 15;                // 都市の丸の半径（地図の座標）
const MAX_ZOOM = 4;
const TAP_PX = 22;
const PICK_PX = 26;          // 都市の丸がこの直径（px）以上なら、その都市をそのまま選ぶ
const DRAG_PX = 8;

const el = (name, attrs = {}) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
};

export default class MapView {
    constructor(root, { onPick } = {}) {
        this.root = root;
        this.onPick = onPick;
        this.svg = el('svg', { class: 'map-svg', role: 'img', 'aria-label': '地図' });
        this.layers = {};
        ['links', 'costs', 'cities', 'houses', 'marks'].forEach(name => {
            this.layers[name] = el('g', { class: `layer-${name}` });
            this.svg.append(this.layers[name]);
        });
        root.append(this.svg);
        this.key = null;
        this.pos = {};
        this.k = 1;
        this.cx = W / 2;
        this.cy = H / 2;
        this.pointers = new Map();
        this.gesture = null;
        this.bindInput();
        new ResizeObserver(() => this.resize()).observe(root);
    }

    // 地図の範囲（都市の位置から、少し余白を取る）
    setMap(mapId, regions) {
        const key = `${mapId}:${regions.join(',')}`;
        if (key === this.key) return;
        this.key = key;
        const map = MAPS[mapId];
        const ya = map.aspect ?? 1;
        const xs = map.cities.map(c => c.x);
        const ys = map.cities.map(c => c.y * ya);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        const span = Math.max(x1 - x0, y1 - y0);
        this.bw = ((x1 - x0) / span) * (W - 120) + 120;
        this.bh = ((y1 - y0) / span) * (H - 120) + 120;
        this.pos = Object.fromEntries(map.cities.map(c => [c.id, { x: 60 + ((c.x - x0) / span) * (W - 120), y: 60 + ((c.y * ya - y0) / span) * (H - 120) }]));
        const active = new Set(map.cities.filter(c => regions.includes(c.region)).map(c => c.id));
        this.active = active;
        // 全体表示では、使う地域の都市が収まるように寄せる
        const on = [...active].map(id => this.pos[id]);
        const ax = on.map(p => p.x);
        const ay = on.map(p => p.y);
        this.home = { x0: Math.min(...ax) - 50, x1: Math.max(...ax) + 50, y0: Math.min(...ay) - 40, y1: Math.max(...ay) + 50 };
        const { links, costs, cities } = this.layers;
        links.replaceChildren();
        costs.replaceChildren();
        cities.replaceChildren();
        map.links.forEach(([a, b, cost]) => {
            const pa = this.pos[a];
            const pb = this.pos[b];
            const on = active.has(a) && active.has(b);
            links.append(el('line', { x1: pa.x, y1: pa.y, x2: pb.x, y2: pb.y, class: on ? 'link' : 'link off' }));
            if (!on || cost === 0) return;
            const mx = (pa.x + pb.x) / 2;
            const my = (pa.y + pb.y) / 2;
            const g = el('g', { transform: `translate(${mx.toFixed(1)} ${my.toFixed(1)})`, class: 'cost' });
            g.append(el('circle', { r: 8.5 }));
            const t = el('text', { y: 3.6 });
            t.textContent = cost;
            g.append(t);
            costs.append(g);
        });
        map.cities.forEach(c => {
            const p = this.pos[c.id];
            const on = active.has(c.id);
            const g = el('g', { transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`, class: on ? 'city' : 'city off' });
            g.append(el('circle', { r: R, fill: on ? REGION_COLORS[c.region] : '#5b5f66' }));
            g.append(el('circle', { r: R - 4.5, class: 'inner' }));
            const t = el('text', { y: R + 11, class: 'name' });
            t.textContent = c.name;
            g.append(t);
            cities.append(g);
        });
        this.resetZoom();
    }

    // state：{ houses, pick（選べる都市と費用 { city: cost }）, selected }
    render({ houses, pick = {}, selected = null }) {
        this.pick = pick;
        const { houses: layer, marks } = this.layers;
        layer.replaceChildren();
        Object.entries(houses).forEach(([city, seats]) => {
            const p = this.pos[city];
            if (!p) return;
            seats.forEach((seat, i) => {
                const a = (-90 + i * 120) * Math.PI / 180;
                const x = p.x + Math.cos(a) * 5.2;
                const y = p.y + Math.sin(a) * 5.2;
                layer.append(el('path', { d: `M${(x - 4.6).toFixed(1)} ${(y + 4).toFixed(1)}v-4.4l4.6-4 4.6 4v4.4z`, fill: PLAYER_COLORS[seat], class: 'house', 'data-house': `${city}:${seat}` }));
            });
        });
        marks.replaceChildren();
        Object.entries(pick).forEach(([city, cost]) => {
            const p = this.pos[city];
            const g = el('g', { transform: `translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})`, class: city === selected ? 'pick selected' : 'pick' });
            g.append(el('circle', { r: R + 4 }));
            const tag = el('g', { transform: `translate(${R + 6} ${-R - 2})`, class: 'price' });
            tag.append(el('rect', { x: -2, y: -9, width: 26, height: 13, rx: 4 }));
            const t = el('text', { x: 11, y: 1 });
            t.textContent = cost;
            tag.append(t);
            g.append(tag);
            marks.append(g);
        });
    }

    // ---- 拡大と移動（キングダムビルダーの盤と同じ作り） ----

    get scale() {
        return Math.min(this.cw / this.bw, this.ch / this.bh) * this.k;
    }

    resize() {
        const rect = this.root.getBoundingClientRect();
        this.cw = rect.width;
        this.ch = rect.height;
        this.apply();
    }

    resetZoom() {
        const h = this.home;
        const base = Math.min(this.cw / this.bw, this.ch / this.bh);
        const fit = h && this.cw ? Math.min(this.cw / (h.x1 - h.x0), this.ch / (h.y1 - h.y0)) : base;
        this.k = Math.min(MAX_ZOOM, Math.max(1, fit / base));
        this.cx = h ? (h.x0 + h.x1) / 2 : this.bw / 2;
        this.cy = h ? (h.y0 + h.y1) / 2 : this.bh / 2;
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
        if (!this.cw || !this.ch || !this.bw) return;
        const s = this.scale;
        const vw = this.cw / s;
        const vh = this.ch / s;
        const clamp = (c, v, full) => (v >= full ? full / 2 : Math.min(full - v / 2, Math.max(v / 2, c)));
        this.cx = clamp(this.cx, vw, this.bw);
        this.cy = clamp(this.cy, vh, this.bh);
        this.vx = this.cx - vw / 2;
        this.vy = this.cy - vh / 2;
        this.svg.setAttribute('viewBox', `${this.vx.toFixed(2)} ${this.vy.toFixed(2)} ${vw.toFixed(2)} ${vh.toFixed(2)}`);
        this.root.classList.toggle('zoomed', this.k > 1.01);
    }

    toMap(clientX, clientY) {
        const rect = this.svg.getBoundingClientRect();
        const s = this.scale;
        return { x: this.vx + (clientX - rect.left) / s, y: this.vy + (clientY - rect.top) / s };
    }

    // 画面上の位置（ページの座標）。確かめるスクリプトからも使う
    screenOf(city) {
        const rect = this.svg.getBoundingClientRect();
        const p = this.pos[city];
        return { x: rect.left + (p.x - this.vx) * this.scale, y: rect.top + (p.y - this.vy) * this.scale };
    }

    tap(point) {
        const px = R * 2 * this.scale;
        const ids = Object.keys(this.pos).filter(id => this.active.has(id));
        const dist = (id) => Math.hypot(this.pos[id].x - point.x, this.pos[id].y - point.y);
        if (px >= PICK_PX) {
            const hit = ids.find(id => dist(id) <= R + 6);
            if (hit) this.onPick?.(hit);
            return;
        }
        const near = ids.filter(id => dist(id) <= TAP_PX / this.scale + R);
        if (near.length === 1) this.onPick?.(near[0]);
        else if (near.length > 1) this.zoomBy(Math.max(2, 36 / px), point);
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
                this.gesture = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), k: this.k, mid: this.toMap((a.x + b.x) / 2, (a.y + b.y) / 2) };
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
            if (g?.type === 'tap' && this.pointers.size === 0 && event.type === 'pointerup') this.tap(this.toMap(event.clientX, event.clientY));
            if (this.pointers.size === 0) this.gesture = null;
            else if (g?.type === 'pinch') this.gesture = { type: 'done' };
        };
        svg.addEventListener('pointerup', end);
        svg.addEventListener('pointercancel', end);
        svg.addEventListener('wheel', (event) => {
            event.preventDefault();
            this.zoomBy(event.deltaY < 0 ? 1.25 : 0.8, this.toMap(event.clientX, event.clientY));
        }, { passive: false });
    }
}
