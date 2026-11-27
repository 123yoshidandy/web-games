/**
 * 庭（六角形の盤面）の描画と、移動・拡大の操作
 * ページ全体はズームさせず、盤面だけを動かす（1本の指で移動、2本の指で拡大縮小、PC はホイール）
 * 押した場所は onTap({ hex: [q, r] } / { edge: [a, b] }) で知らせる
 */

import { MAX_BAMBOO } from './data.js';
import * as Motion from './motion/motion.js';

const SLIDE_MS = 420; // 庭師・パンダが進む長さ（普通の速さ）

const R = 40;                     // 六角形の大きさ（中心から角まで）
const SQ3 = Math.sqrt(3);
export const hexCenter = (q, r) => [R * SQ3 * (q + r / 2), R * 1.5 * r];

export const TILE_COLORS = { green: '#7cb860', yellow: '#e6c84c', pink: '#ec92ad', pond: '#5aa9d9' };
const BAMBOO_COLORS = { green: '#3f8f2f', yellow: '#c99a12', pink: '#d0507a' };

function hexPoints(cx, cy, size = R) {
    const pts = [];
    for (let i = 0; i < 6; i++) {
        const a = Math.PI / 180 * (60 * i - 30);
        pts.push(`${(cx + size * Math.cos(a)).toFixed(1)},${(cy + size * Math.sin(a)).toFixed(1)}`);
    }
    return pts.join(' ');
}

// 辺 (a, b) の両端の座標
function edgeEnds(a, b) {
    const [ax, ay] = hexCenter(...a);
    const [bx, by] = hexCenter(...b);
    const mx = (ax + bx) / 2;
    const my = (ay + by) / 2;
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    const px = -dy / len * R / 2;
    const py = dx / len * R / 2;
    return [[mx + px, my + py], [mx - px, my - py]];
}

// 改良の印（自作の小さな絵）
export function improvementIcon(kind, x, y, s = 1) {
    const g = (body) => `<g transform="translate(${x} ${y}) scale(${s})" class="imp">${body}</g>`;
    if (kind === 'watershed') {
        return g('<circle r="9" fill="#e9f5fc" stroke="#2c7fbf" stroke-width="1.5"/><path d="M0 -6 C3 -1 5 1 5 3 A5 5 0 0 1 -5 3 C-5 1 -3 -1 0 -6 Z" fill="#3b8fd6"/>');
    }
    if (kind === 'enclosure') {
        return g('<circle r="9" fill="#f6eedc" stroke="#7a5230" stroke-width="1.5"/><path d="M-5 5 V-3 M0 5 V-4 M5 5 V-3 M-7 -1 H7 M-7 3 H7" stroke="#7a5230" stroke-width="1.8" stroke-linecap="round"/>');
    }
    return g('<circle r="9" fill="#f1f6e4" stroke="#5f7d2c" stroke-width="1.5"/><path d="M0 6 V-1 M0 -1 C-1 -5 -5 -6 -6 -4 C-4 -1 -1 -1 0 -1 Z M0 1 C1 -3 5 -4 6 -2 C4 1 1 1 0 1 Z" fill="#6e9c33" stroke="#4d6d21" stroke-width="1"/>');
}

function bambooStack(cx, cy, color, n) {
    let html = '';
    for (let i = 0; i < n; i++) {
        const y = cy + 10 - i * 9;
        html += `<rect x="${cx - 5}" y="${y - 8}" width="10" height="8.5" rx="2" fill="${BAMBOO_COLORS[color]}" stroke="rgba(0,0,0,0.35)" stroke-width="0.8"/>`;
        html += `<path d="M${cx - 5} ${y - 0.2} h10" stroke="rgba(255,255,255,0.55)" stroke-width="1"/>`;
    }
    if (n > 0) html += `<path d="M${cx + 5} ${cy + 3 - (n - 1) * 9} q6 -3 9 -8" fill="none" stroke="${BAMBOO_COLORS[color]}" stroke-width="2.5" stroke-linecap="round"/>`;
    return html;
}

const gardenerToken = (x, y) => `<g transform="translate(${x} ${y})" class="piece">
    <circle r="11" fill="#f4e3b6" stroke="#6b4f24" stroke-width="1.6"/>
    <path d="M-10 1 Q0 -3 10 1 Q0 3 -10 1 Z" fill="#d9b55f" stroke="#6b4f24" stroke-width="1"/>
    <path d="M-5 0 Q0 -10 5 0 Z" fill="#e6c776" stroke="#6b4f24" stroke-width="1"/></g>`;

const pandaToken = (x, y) => `<g transform="translate(${x} ${y})" class="piece">
    <circle cx="-7" cy="-7" r="4" fill="#222"/><circle cx="7" cy="-7" r="4" fill="#222"/>
    <circle r="10.5" fill="#fff" stroke="#222" stroke-width="1.6"/>
    <ellipse cx="-4" cy="-1" rx="2.6" ry="3.4" fill="#222"/><ellipse cx="4" cy="-1" rx="2.6" ry="3.4" fill="#222"/>
    <circle cx="0" cy="4" r="1.6" fill="#222"/></g>`;

export default class BoardView {
    constructor(svg, { onTap }) {
        this.svg = svg;
        this.onTap = onTap;
        this.view = { scale: 1, tx: 0, ty: 0 };
        this.userMoved = false;
        this.tileCount = 0;
        this.pointers = new Map();
        this.bind();
    }

    // state：盤面の情報（ビュー）、marks：{ hexes: [[q,r]], edges: [[a,b]], spots: [[q,r]], fresh: [[q,r]], best: { hex: [q,r] } か { edge: [a,b] }（ヒント） }
    render(state, marks = {}) {
        let html = '<g class="world">';
        // 置ける場所（空き）
        for (const [q, r] of marks.spots ?? []) {
            const [x, y] = hexCenter(q, r);
            html += `<polygon class="spot" points="${hexPoints(x, y, R - 2)}" data-q="${q}" data-r="${r}"/>`;
        }
        for (const t of state.tiles) {
            const [x, y] = hexCenter(t.q, t.r);
            const cls = t.color === 'pond' ? 'tile pond' : `tile ${t.irrigated ? 'wet' : 'dry'}`;
            html += `<g class="${cls}" data-q="${t.q}" data-r="${t.r}">`;
            html += `<polygon class="base" points="${hexPoints(x, y, R - 0.8)}" fill="${TILE_COLORS[t.color]}"/>`;
            html += `<polygon class="tex" points="${hexPoints(x, y, R - 0.8)}" fill="url(#tex-${t.color})"/>`;
            if (t.color === 'pond') {
                html += `<path d="M${x - 16} ${y - 4} q8 -6 16 0 t16 0 M${x - 12} ${y + 8} q6 -5 12 0 t12 0" fill="none" stroke="#d6efff" stroke-width="2.4" stroke-linecap="round"/>`;
            } else {
                if (t.irrigated) html += `<polygon class="ring" points="${hexPoints(x, y, R - 4.5)}"/>`;
                html += `<g class="bamboo">${bambooStack(x, y, t.color, Math.min(t.bamboo, MAX_BAMBOO))}</g>`;
                if (t.improvement) html += improvementIcon(t.improvement, x - 17, y + 19, 0.85);
            }
            html += '</g>';
        }
        // 水路
        for (const [a, b] of state.channels) {
            const [[x1, y1], [x2, y2]] = edgeEnds(a, b);
            html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="channel"/>`;
        }
        // 候補の区画（庭師・パンダの行き先など）
        for (const [q, r] of marks.hexes ?? []) {
            const [x, y] = hexCenter(q, r);
            html += `<polygon class="cand" points="${hexPoints(x, y, R - 3)}" data-q="${q}" data-r="${r}"/>`;
        }
        for (const [q, r] of marks.fresh ?? []) {
            const [x, y] = hexCenter(q, r);
            html += `<polygon class="fresh" points="${hexPoints(x, y, R - 3)}"/>`;
        }
        // 候補の辺（水路を置ける場所）
        for (const [a, b] of marks.edges ?? []) {
            const [[x1, y1], [x2, y2]] = edgeEnds(a, b);
            const data = `data-edge="${a.join(',')}|${b.join(',')}"`;
            html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="edge-cand"/>`;
            html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="edge-hit" ${data}/>`;
        }
        // ヒントのおすすめの場所（白い太枠。押す判定は下の候補に任せる）
        if (marks.best?.hex) {
            const [x, y] = hexCenter(...marks.best.hex);
            html += `<polygon class="best" points="${hexPoints(x, y, R - 6)}"/>`;
        }
        if (marks.best?.edge) {
            const [[x1, y1], [x2, y2]] = edgeEnds(...marks.best.edge);
            html += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="best-edge"/>`;
        }
        // 庭師とパンダ（同じ区画なら少しずらす）
        const same = state.gardener[0] === state.panda[0] && state.gardener[1] === state.panda[1];
        const [gx, gy] = hexCenter(...state.gardener);
        const [px, py] = hexCenter(...state.panda);
        const pieces = { gardener: [gx + (same ? -12 : 14), gy - 14], panda: [px + (same ? 12 : -14), py - 14] };
        // 動かすときは外側の g に CSS の transform をかける（内側の transform 属性はそのまま）
        html += `<g class="piece-slot" data-piece="gardener">${gardenerToken(...pieces.gardener)}</g>`;
        html += `<g class="piece-slot" data-piece="panda">${pandaToken(...pieces.panda)}</g>`;
        html += '</g>';
        this.svg.innerHTML = html;
        this.world = this.svg.querySelector('.world');
        // 候補を選ぶ間は、ほかの区画を少し暗くして候補を浮かせる
        const selecting = (marks.hexes?.length ?? 0) + (marks.edges?.length ?? 0) + (marks.spots?.length ?? 0) > 0;
        this.svg.classList.toggle('selecting', selecting);
        // 区画が増えたら、利用者が動かしていなければ全体が収まるように合わせる
        const bounds = this.boundsOf(state, marks);
        if (state.tiles.length !== this.tileCount && !this.userMoved) this.fit(bounds);
        this.tileCount = state.tiles.length;
        this.lastBounds = bounds;
        this.apply();
        const snapshot = { pieces, bamboo: new Map(state.tiles.map(t => [`${t.q},${t.r}`, t.bamboo])) };
        if (this.prev) this.animateChanges(this.prev, snapshot);
        this.prev = snapshot;
    }

    // 前に描いた盤との差を動かす：駒は前の位置から滑らせ、新しい区画ははねて出し、竹が変わった区画は目立たせる
    // 新しい対戦を始めるときは prev を null にして、前の対戦との差を動かさない
    animateChanges(prev, now) {
        if (!Motion.enabled()) return;
        for (const name of ['gardener', 'panda']) {
            const [ox, oy] = prev.pieces[name];
            const [nx, ny] = now.pieces[name];
            if (Math.abs(ox - nx) < 0.5 && Math.abs(oy - ny) < 0.5) continue;
            const el = this.svg.querySelector(`.piece-slot[data-piece="${name}"]`);
            const length = Motion.ms(SLIDE_MS);
            const animation = el?.animate([
                { transform: `translate(${ox - nx}px, ${oy - ny}px)` },
                { transform: `translate(${(ox - nx) / 2}px, ${(oy - ny) / 2 - 10}px)`, offset: 0.5 },
                { transform: 'translate(0, 0)' }
            ], { duration: length, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'backwards' });
            if (animation) Motion.track(animation, length);
        }
        for (const [key, bamboo] of now.bamboo) {
            const [q, r] = key.split(',');
            const tile = this.svg.querySelector(`.tile[data-q="${q}"][data-r="${r}"]`);
            if (!prev.bamboo.has(key)) Motion.popIn(tile, { duration: 360 });
            else if (prev.bamboo.get(key) !== bamboo) {
                // 食べて竹がなくなったら区画を、残っていれば竹を目立たせる
                const stack = tile?.querySelector('.bamboo');
                Motion.pulse(bamboo > 0 ? stack : tile, { duration: 380, delay: 120, scale: bamboo > 0 ? 1.25 : 1.06 });
            }
        }
    }

    boundsOf(state, marks) {
        const pts = [...state.tiles.map(t => [t.q, t.r]), ...(marks.spots ?? [])];
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const [q, r] of pts) {
            const [x, y] = hexCenter(q, r);
            minX = Math.min(minX, x - R); maxX = Math.max(maxX, x + R);
            minY = Math.min(minY, y - R); maxY = Math.max(maxY, y + R);
        }
        // 置ける場所が出ていなくても、まわりに1マス分の余白
        return { minX: minX - R * 1.2, maxX: maxX + R * 1.2, minY: minY - R * 1.2, maxY: maxY + R * 1.2 };
    }

    fit(bounds = this.lastBounds) {
        if (!bounds) return;
        const { width, height } = this.svg.getBoundingClientRect();
        if (!width || !height) return;
        const scale = Math.min(width / (bounds.maxX - bounds.minX), height / (bounds.maxY - bounds.minY), 1.6);
        this.view.scale = scale;
        this.view.tx = width / 2 - (bounds.minX + bounds.maxX) / 2 * scale;
        this.view.ty = height / 2 - (bounds.minY + bounds.maxY) / 2 * scale;
        this.userMoved = false;
        this.apply();
    }

    zoomBy(factor, cx, cy) {
        const { width, height } = this.svg.getBoundingClientRect();
        cx = cx ?? width / 2;
        cy = cy ?? height / 2;
        const next = Math.max(0.3, Math.min(3, this.view.scale * factor));
        const k = next / this.view.scale;
        this.view.tx = cx - (cx - this.view.tx) * k;
        this.view.ty = cy - (cy - this.view.ty) * k;
        this.view.scale = next;
        this.userMoved = true;
        this.apply();
    }

    apply() {
        if (this.world) this.world.setAttribute('transform', `translate(${this.view.tx} ${this.view.ty}) scale(${this.view.scale})`);
    }

    bind() {
        const svg = this.svg;
        const local = e => {
            const rect = svg.getBoundingClientRect();
            return [e.clientX - rect.left, e.clientY - rect.top];
        };
        svg.addEventListener('pointerdown', e => {
            svg.setPointerCapture?.(e.pointerId);
            this.pointers.set(e.pointerId, { start: local(e), last: local(e), target: e.target });
            this.moved = false;
            if (this.pointers.size === 2) this.pinch = this.pinchState();
        });
        svg.addEventListener('pointermove', e => {
            const p = this.pointers.get(e.pointerId);
            if (!p) return;
            const now = local(e);
            if (this.pointers.size === 1) {
                if (Math.hypot(now[0] - p.start[0], now[1] - p.start[1]) > 6) this.moved = true;
                if (this.moved) {
                    this.view.tx += now[0] - p.last[0];
                    this.view.ty += now[1] - p.last[1];
                    this.userMoved = true;
                    this.apply();
                }
            }
            p.last = now;
            if (this.pointers.size === 2 && this.pinch) {
                const next = this.pinchState();
                const factor = next.dist / this.pinch.dist;
                this.zoomBy(factor, next.cx, next.cy);
                this.view.tx += next.cx - this.pinch.cx;
                this.view.ty += next.cy - this.pinch.cy;
                this.apply();
                this.pinch = next;
                this.moved = true;
            }
        });
        const end = e => {
            const p = this.pointers.get(e.pointerId);
            this.pointers.delete(e.pointerId);
            if (this.pointers.size < 2) this.pinch = null;
            if (!p || this.moved || this.pointers.size > 0) return;
            this.tap(p.target);
        };
        svg.addEventListener('pointerup', end);
        svg.addEventListener('pointercancel', e => {
            this.pointers.delete(e.pointerId);
            this.pinch = null;
        });
        svg.addEventListener('wheel', e => {
            e.preventDefault();
            const [cx, cy] = local(e);
            this.zoomBy(e.deltaY < 0 ? 1.12 : 1 / 1.12, cx, cy);
        }, { passive: false });
    }

    pinchState() {
        const [a, b] = [...this.pointers.values()].map(p => p.last);
        return { dist: Math.max(1, Math.hypot(a[0] - b[0], a[1] - b[1])), cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2 };
    }

    // 押した要素から、区画か辺を見つける
    tap(target) {
        const edge = target.closest?.('[data-edge]');
        if (edge) {
            const [a, b] = edge.dataset.edge.split('|').map(s => s.split(',').map(Number));
            this.onTap({ edge: [a, b] });
            return;
        }
        const hex = target.closest?.('[data-q]');
        if (hex) this.onTap({ hex: [Number(hex.dataset.q), Number(hex.dataset.r)] });
    }

    // 確認用：区画を押したことにする
    tapHex(q, r) {
        this.onTap({ hex: [q, r] });
    }
}
