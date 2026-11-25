/**
 * 地図の描画と、拡大・移動・タップ
 * - 森・川・道は、初めに一度だけ描く。空き地の中身（兵・建物・トークン・放浪者）と光は、毎回描き直す
 * - 拡大：2本指でつまむ、マウスのホイール、＋−のボタン。1本指（マウス）でドラッグすると動かす
 * - タップ：空き地か森を選ぶ（onTap('clearing' | 'forest', id)）
 */

import { CLEARINGS, PATHS, FORESTS, RIVER } from './data.js';
import { FACTION_COLORS, SUIT_COLORS, suitIcon } from './art.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 950;
const H = 820;
const R = 60;
const MAX_ZOOM = 3.5;
const DRAG_PX = 8;
const BUILDING_MARK = { sawmill: '製', workshop: '工', recruiter: '徴', roost: '巣', base: '拠' };

const el = (name, attrs = {}, text) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text !== undefined) node.textContent = text;
    return node;
};

export default class BoardView {
    constructor(root, { onTap } = {}) {
        this.root = root;
        this.onTap = onTap;
        this.svg = el('svg', { class: 'board', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': '地図' });
        this.layers = {};
        ['ground', 'paths', 'forests', 'clearings', 'pieces', 'glow'].forEach(name => {
            this.layers[name] = el('g', { class: `layer-${name}` });
            this.svg.append(this.layers[name]);
        });
        root.append(this.svg);
        this.k = 1;
        this.cx = W / 2;
        this.cy = H / 2;
        this.pointers = new Map();
        this.gesture = null;
        this.drawStatic();
        this.bindInput();
        new ResizeObserver(() => this.applyView()).observe(root);
    }

    drawStatic() {
        const { ground, paths, forests } = this.layers;
        ground.append(el('rect', { x: 0, y: 0, width: W, height: H, class: 'ground' }));
        // 森（道に囲まれた区域）を、少し濃い緑で塗る
        FORESTS.forEach(f => {
            const pts = f.clearings.map(c => `${CLEARINGS[c].x},${CLEARINGS[c].y}`).join(' ');
            ground.append(el('polygon', { points: pts, class: 'forest-area' }));
        });
        ground.append(el('path', { d: `M${RIVER.map(p => p.join(',')).join(' L')}`, class: 'river' }));
        PATHS.forEach(([a, b]) => {
            const A = CLEARINGS[a];
            const B = CLEARINGS[b];
            paths.append(el('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: 'path-bed' }));
            paths.append(el('line', { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: 'path' }));
        });
        FORESTS.forEach(f => {
            const g = el('g', { class: 'forest', 'data-forest': f.id, transform: `translate(${f.x},${f.y})` });
            g.append(el('circle', { r: 26, class: 'forest-hit' }));
            g.append(el('path', { d: 'M0,-18 L13,4 L5,4 L15,18 L-15,18 L-5,4 L-13,4 Z', class: 'tree' }));
            forests.append(g);
        });
    }

    // view：ゲームのビュー。glow：{ clearings: Set, forests: Set }（光らせる場所）
    render(view, glow = { clearings: new Set(), forests: new Set() }, marks = {}) {
        const { clearings, pieces } = this.layers;
        clearings.replaceChildren();
        pieces.replaceChildren();
        view.map.forEach(m => clearings.append(this.clearingNode(m, glow.clearings.has(m.id), marks[m.id])));
        this.layers.forests.querySelectorAll('.forest').forEach(node => {
            node.classList.toggle('glow', glow.forests.has(Number(node.dataset.forest)));
        });
        const vb = view.vagabond;
        if (vb && vb.character) {
            const at = vb.clearing !== null ? { x: CLEARINGS[vb.clearing].x + R * 0.78, y: CLEARINGS[vb.clearing].y - R * 0.62 }
                : vb.forest !== null ? { x: FORESTS[vb.forest].x + 20, y: FORESTS[vb.forest].y - 16 } : null;
            if (at) pieces.append(this.pawnNode(at.x, at.y));
        }
    }

    clearingNode(m, glowing, mark) {
        const c = CLEARINGS[m.id];
        const g = el('g', { class: `clearing${glowing ? ' glow' : ''}${mark ? ` mark-${mark}` : ''}`, 'data-clearing': m.id, transform: `translate(${c.x},${c.y})` });
        if (glowing) g.append(el('circle', { r: R + 13, class: 'glow-ring' }));
        if (m.ruler) g.append(el('circle', { r: R + 5, class: 'ruler-ring', stroke: FACTION_COLORS[m.ruler] }));
        g.append(el('circle', { r: R, class: 'clearing-body', stroke: SUIT_COLORS[c.suit] }));
        // 番号と印
        const badge = el('g', { class: 'badge', transform: `translate(${-R * 0.72},${-R * 0.72})` });
        badge.append(el('circle', { r: 17, fill: SUIT_COLORS[c.suit] }));
        badge.append(el('text', { class: 'badge-num', y: 6 }, String(m.id + 1)));
        g.append(badge);
        // 建物の枠（遺跡も枠を1つ使う）
        const slots = [];
        m.buildings.forEach(b => slots.push({ kind: 'building', b }));
        if (m.ruin) slots.push({ kind: 'ruin' });
        while (slots.length < m.slots) slots.push({ kind: 'empty' });
        const size = 30;
        const gap = 4;
        const total = slots.length * size + (slots.length - 1) * gap;
        slots.forEach((s, i) => {
            const x = -total / 2 + i * (size + gap);
            const y = 12;
            if (s.kind === 'empty') g.append(el('rect', { x, y, width: size, height: size, rx: 5, class: 'slot' }));
            else if (s.kind === 'ruin') {
                g.append(el('rect', { x, y, width: size, height: size, rx: 5, class: 'ruin' }));
                g.append(el('text', { x: x + size / 2, y: y + 21, class: 'slot-text ruin-text' }, '遺'));
            } else {
                const color = FACTION_COLORS[s.b.faction];
                g.append(el('rect', { x, y, width: size, height: size, rx: 5, class: 'building', fill: color }));
                g.append(el('text', { x: x + size / 2, y: y + 21, class: 'slot-text' }, s.b.kind === 'base' ? suitIcon(s.b.suit) : BUILDING_MARK[s.b.kind]));
            }
        });
        // 兵（陣営ごとに数を書いた札）
        const warriors = Object.entries(m.warriors).filter(([, n]) => n > 0);
        const pw = 40;
        const wTotal = warriors.length * pw + (warriors.length - 1) * 4;
        warriors.forEach(([f, n], i) => {
            const x = -wTotal / 2 + i * (pw + 4);
            const y = -28;
            g.append(el('rect', { x, y, width: pw, height: 30, rx: 15, class: 'warrior', fill: FACTION_COLORS[f] }));
            g.append(el('text', { x: x + pw / 2, y: y + 22, class: 'warrior-num' }, String(n)));
        });
        // トークン（木材・本拠・同調者）。空き地の下の縁に並べる
        const tokens = [];
        const wood = m.tokens.filter(t => t.kind === 'wood').length;
        if (m.tokens.some(t => t.kind === 'keep')) tokens.push({ cls: 'keep', label: '本' });
        if (m.tokens.some(t => t.kind === 'sympathy')) tokens.push({ cls: 'sympathy', label: '同' });
        if (wood > 0) tokens.push({ cls: 'wood', label: wood > 1 ? `木${wood}` : '木' });
        const tw = 34;
        const tTotal = tokens.length * tw + (tokens.length - 1) * 4;
        tokens.forEach((t, i) => {
            const x = -tTotal / 2 + i * (tw + 4);
            const y = R - 14;
            g.append(el('rect', { x, y, width: tw, height: 24, rx: 12, class: `token ${t.cls}` }));
            g.append(el('text', { x: x + tw / 2, y: y + 17, class: 'token-text' }, t.label));
        });
        return g;
    }

    pawnNode(x, y) {
        const g = el('g', { class: 'pawn', transform: `translate(${x},${y})` });
        g.append(el('path', { d: 'M0,-22 a9,9 0 1 1 0.1,0 Z M-14,16 Q-14,-6 0,-6 Q14,-6 14,16 Z', class: 'pawn-body' }));
        return g;
    }

    // ---- 拡大・移動 ----

    scaleBase() {
        const rect = this.root.getBoundingClientRect();
        return Math.min(rect.width / W, rect.height / H) || 1;
    }

    applyView() {
        const k = this.k;
        const vw = W / k;
        const vh = H / k;
        this.cx = Math.min(W - vw / 2, Math.max(vw / 2, this.cx));
        this.cy = Math.min(H - vh / 2, Math.max(vh / 2, this.cy));
        this.svg.setAttribute('viewBox', `${this.cx - vw / 2} ${this.cy - vh / 2} ${vw} ${vh}`);
    }

    zoomBy(factor, anchor) {
        const before = this.k;
        this.k = Math.min(MAX_ZOOM, Math.max(1, this.k * factor));
        if (anchor && this.k !== before) {
            // 指の位置の地図の点が、拡大の前後で動かないようにする
            this.cx = anchor.x + (this.cx - anchor.x) * before / this.k;
            this.cy = anchor.y + (this.cy - anchor.y) * before / this.k;
        }
        this.applyView();
    }

    reset() {
        this.k = 1;
        this.cx = W / 2;
        this.cy = H / 2;
        this.applyView();
    }

    toMap(clientX, clientY) {
        const rect = this.root.getBoundingClientRect();
        const s = this.scaleBase() * this.k;
        return { x: this.cx + (clientX - rect.left - rect.width / 2) / s, y: this.cy + (clientY - rect.top - rect.height / 2) / s };
    }

    bindInput() {
        const svg = this.svg;
        svg.addEventListener('pointerdown', event => {
            svg.setPointerCapture?.(event.pointerId);
            this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            if (this.pointers.size === 1) this.gesture = { type: 'pan', startX: event.clientX, startY: event.clientY, cx: this.cx, cy: this.cy, moved: false, target: event.target };
            else if (this.pointers.size === 2) {
                const [a, b] = [...this.pointers.values()];
                this.gesture = { type: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), k: this.k, moved: true };
            }
        });
        svg.addEventListener('pointermove', event => {
            if (!this.pointers.has(event.pointerId)) return;
            this.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
            const g = this.gesture;
            if (!g) return;
            if (g.type === 'pan') {
                const dx = event.clientX - g.startX;
                const dy = event.clientY - g.startY;
                if (Math.hypot(dx, dy) > DRAG_PX) g.moved = true;
                if (!g.moved) return;
                const s = this.scaleBase() * this.k;
                this.cx = g.cx - dx / s;
                this.cy = g.cy - dy / s;
                this.applyView();
            } else if (g.type === 'pinch' && this.pointers.size === 2) {
                const [a, b] = [...this.pointers.values()];
                const dist = Math.hypot(a.x - b.x, a.y - b.y);
                const anchor = this.toMap((a.x + b.x) / 2, (a.y + b.y) / 2);
                this.zoomBy((g.k * dist / g.dist) / this.k, anchor);
            }
        });
        const end = event => {
            if (!this.pointers.has(event.pointerId)) return;
            this.pointers.delete(event.pointerId);
            const g = this.gesture;
            if (g && g.type === 'pan' && !g.moved && event.type === 'pointerup') this.tap(event);
            if (this.pointers.size === 0) this.gesture = null;
            else if (this.pointers.size === 1) {
                const [p] = [...this.pointers.values()];
                this.gesture = { type: 'pan', startX: p.x, startY: p.y, cx: this.cx, cy: this.cy, moved: true };
            }
        };
        svg.addEventListener('pointerup', end);
        svg.addEventListener('pointercancel', end);
        svg.addEventListener('wheel', event => {
            event.preventDefault();
            this.zoomBy(event.deltaY < 0 ? 1.15 : 1 / 1.15, this.toMap(event.clientX, event.clientY));
        }, { passive: false });
    }

    tap(event) {
        const target = document.elementFromPoint(event.clientX, event.clientY) ?? event.target;
        const clearing = target.closest?.('[data-clearing]');
        if (clearing) {
            this.onTap?.('clearing', Number(clearing.dataset.clearing));
            return;
        }
        const forest = target.closest?.('[data-forest]');
        if (forest) this.onTap?.('forest', Number(forest.dataset.forest));
        else this.onTap?.('none', -1);
    }
}
