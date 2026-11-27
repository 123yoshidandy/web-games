/**
 * 地図の描画と、拡大・移動・タップ
 * - 領域の形（六角マスの集まり）・地形の模様・境目は、ゲームの初めに一度だけ描く。部隊・印・光は、毎回描き直す
 * - 拡大：2本指でつまむ、マウスのホイール、＋−のボタン。1本指でドラッグすると動かす
 * - タップ：触れたマスの領域を選ぶ
 */

import { HEX_R, HEX_W, PLAYER_COLORS, PLAYER_TEXT, PLAYER_LINES } from './art.js';
import { TERRAINS } from './data.js';

const NS = 'http://www.w3.org/2000/svg';
const MARGIN = 4;
const ROW_H = HEX_R * 1.5;
const MAX_ZOOM = 4;
const DRAG_PX = 8;

const el = (name, attrs = {}) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    return node;
};

// 動く部品を、描き直しの前後で見分けられる名前を付けた g に包む（piece-motion.js）。group を省くと「値」として扱う
const mk = (node, key, group, value = 1) => {
    const wrap = el('g', { 'data-mk': key, ...(group ? { 'data-mg': group } : {}), 'data-mv': value });
    wrap.append(node);
    return wrap;
};

export default class BoardView {
    // root：地図を入れる要素。onTap(region)：領域をタップした（地図の外なら -1）
    constructor(root, { onTap } = {}) {
        this.root = root;
        this.onTap = onTap;
        this.svg = el('svg', { class: 'board', role: 'img', 'aria-label': '地図' });
        this.layers = {};
        ['terrain', 'art', 'borders', 'glow', 'tokens', 'labels'].forEach(name => {
            this.layers[name] = el('g', { class: `layer-${name}` });
            this.svg.append(this.layers[name]);
        });
        root.append(this.svg);
        this.map = null;
        this.k = 1;
        this.cx = 0;
        this.cy = 0;
        this.cw = 0;
        this.ch = 0;
        this.w = 1;
        this.h = 1;
        this.pointers = new Map();
        this.gesture = null;
        this.bindInput();
        new ResizeObserver(() => this.resize()).observe(root);
    }

    center(cell) {
        const { cols } = this.map;
        const r = Math.floor(cell / cols);
        const c = cell % cols;
        return { x: MARGIN + HEX_W * (c + (r % 2 ? 0.5 : 0)) + HEX_W / 2, y: MARGIN + HEX_R + ROW_H * r };
    }

    corner(cell, k) {
        const { x, y } = this.center(cell);
        const a = Math.PI / 180 * (60 * k - 90);
        return [x + HEX_R * Math.cos(a), y + HEX_R * Math.sin(a)];
    }

    // ---- 描画 ----

    setMap(map) {
        if (this.map === map) return;
        this.map = map;
        const { cols, rows } = map;
        this.w = HEX_W * (cols + 0.5) + MARGIN * 2;
        this.h = ROW_H * (rows - 1) + HEX_R * 2 + MARGIN * 2;
        const { terrain, art, borders } = this.layers;
        [terrain, art, borders].forEach(g => g.replaceChildren());
        const owner = map.owner;
        const neighbor = (cell, dir) => {
            const r = Math.floor(cell / cols);
            const c = cell % cols;
            const odd = r % 2 === 1;
            const [dr, dc] = [[-1, odd ? 1 : 0], [0, 1], [1, odd ? 1 : 0], [1, odd ? 0 : -1], [0, -1], [-1, odd ? 0 : -1]][dir];
            const nr = r + dr;
            const nc = c + dc;
            return nr < 0 || nr >= rows || nc < 0 || nc >= cols ? -1 : nr * cols + nc;
        };
        const seg = (cell, dir) => {
            const [a, b] = [this.corner(cell, dir), this.corner(cell, (dir + 1) % 6)];
            return `M${a[0].toFixed(2)} ${a[1].toFixed(2)}L${b[0].toFixed(2)} ${b[1].toFixed(2)}`;
        };
        this.outlines = map.regions.map(() => []);
        const inner = [];
        const outer = [];
        map.regions.forEach(region => {
            const d = region.cells.map(cell => {
                const pts = [0, 1, 2, 3, 4, 5].map(k => this.corner(cell, k).map(v => v.toFixed(2)).join(' '));
                return `M${pts.join('L')}Z`;
            }).join('');
            const color = TERRAINS[region.terrain].color;
            terrain.append(el('path', { d, fill: color, stroke: color, 'stroke-width': 0.8, class: `t-${region.terrain}` }));
            region.cells.forEach(cell => {
                for (let dir = 0; dir < 6; dir++) {
                    const n = neighbor(cell, dir);
                    if (n >= 0 && owner[n] === region.id) continue;
                    this.outlines[region.id].push(seg(cell, dir));
                    if (n < 0) outer.push(seg(cell, dir));
                    else if (n > cell) inner.push(seg(cell, dir));
                }
            });
            const [, a2, a3] = region.anchors;
            const p2 = this.center(a2);
            art.append(el('use', { href: `#t-${region.terrain}`, transform: `translate(${p2.x.toFixed(2)} ${p2.y.toFixed(2)}) scale(.85)` }));
            if (region.special) {
                const p3 = this.center(a3);
                art.append(el('use', { href: `#s-${region.special}`, transform: `translate(${p3.x.toFixed(2)} ${p3.y.toFixed(2)}) scale(1.05)` }));
            }
        });
        borders.append(el('path', { d: inner.join(''), class: 'border' }), el('path', { d: outer.join(''), class: 'edge' }));
        this.resetZoom();
    }

    // state：{ regions（ゲームの領域）, bands, targets: Map(region → { label（置く数）, kind（go・dice・special）}), selected, recent: Set }
    render(state) {
        const { tokens, glow, labels } = this.layers;
        [tokens, glow, labels].forEach(g => g.replaceChildren());
        const { regions } = this.map;
        (state.recent ?? new Set()).forEach(id => {
            glow.append(el('path', { d: this.outlines[id].join(''), class: 'recent' }));
        });
        state.targets?.forEach(({ label, kind }, id) => {
            glow.append(el('path', { d: this.outlines[id].join(''), class: `target ${kind}` }));
            if (label !== null && label !== undefined) {
                const p = this.center(regions[id].anchors[1]);
                const g = el('g', { transform: `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})`, class: `cost ${kind}` });
                g.append(el('circle', { r: 5.2 }));
                const text = el('text', { y: 2.3, 'text-anchor': 'middle' });
                text.textContent = label;
                g.append(text);
                labels.append(g);
            }
        });
        if (state.selected >= 0) glow.append(el('path', { d: this.outlines[state.selected].join(''), class: 'selected' }));
        state.regions.forEach((r, id) => {
            if (!r.race && !r.fort && !r.lair) return;
            const p = this.center(regions[id].anchors[0]);
            const g = el('g', { transform: `translate(${p.x.toFixed(2)} ${p.y.toFixed(2)})` });
            const mark = (name, x, y, s = 1) => g.append(el('use', { href: `#m-${name}`, transform: `translate(${x} ${y}) scale(${s})` }));
            if (r.lair) mark('lair', -7.5, -5.5);
            if (r.fort) mark('fort', 7.5, -5.5);
            if (r.hole) mark('hole', 0, -8.2);
            if (r.dragon) mark('dragon', 0, 8.6);
            if (r.hero) mark('hero', 7.5, 5.8);
            if (r.camps > 0) {
                mark('camp', -7.5, 5.8);
                if (r.camps > 1) {
                    const t = el('text', { x: -3.6, y: 9.6, class: 'mark-n' });
                    t.textContent = r.camps;
                    g.append(t);
                }
            }
            if (r.race === 'lost') {
                mark('lost', 0, 0, 1.05);
            } else if (r.race) {
                const unit = el('g');
                const band = state.bands[r.race];
                const seat = band.seat;
                unit.append(el('circle', {
                    r: 6.4, class: band.declined ? 'tok declined' : 'tok',
                    fill: band.declined ? '#625e58' : PLAYER_COLORS[seat],
                    stroke: band.declined ? PLAYER_COLORS[seat] : PLAYER_LINES[seat]
                }));
                const t = el('text', { y: 2.7, 'text-anchor': 'middle', class: 'tok-n', fill: band.declined ? '#ffffff' : PLAYER_TEXT[seat] });
                t.textContent = r.count;
                unit.append(t);
                g.append(mk(unit, `tk-${id}-${r.race}`, `tk-${r.race}`, r.count));
            }
            tokens.append(g);
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
        this.cx = this.w / 2;
        this.cy = this.h / 2;
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
        if (!this.cw || !this.ch || !this.map) return;
        const s = this.scale;
        const vw = this.cw / s;
        const vh = this.ch / s;
        const clamp = (c, v, full) => (v >= full ? full / 2 : Math.min(full - v / 2, Math.max(v / 2, c)));
        this.cx = clamp(this.cx, vw, this.w);
        this.cy = clamp(this.cy, vh, this.h);
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

    regionAt({ x, y }) {
        const { cols, rows, owner } = this.map;
        const r0 = Math.round((y - MARGIN - HEX_R) / ROW_H);
        let best = -1;
        let bestD = Infinity;
        for (let r = r0 - 1; r <= r0 + 1; r++) {
            if (r < 0 || r >= rows) continue;
            const c0 = Math.round((x - MARGIN - HEX_W / 2) / HEX_W - (r % 2 ? 0.5 : 0));
            for (let c = c0 - 1; c <= c0 + 1; c++) {
                if (c < 0 || c >= cols) continue;
                const p = this.center(r * cols + c);
                const d = Math.hypot(p.x - x, p.y - y);
                if (d < bestD) {
                    bestD = d;
                    best = r * cols + c;
                }
            }
        }
        return bestD <= HEX_R ? owner[best] : -1;
    }

    // 領域の中心（画面の座標）。演出に使う
    regionPoint(id) {
        const p = this.center(this.map.regions[id].anchors[0]);
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
            if (g?.type === 'tap' && this.pointers.size === 0 && event.type === 'pointerup') this.onTap?.(this.regionAt(this.toBoard(event.clientX, event.clientY)));
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
