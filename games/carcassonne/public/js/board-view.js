/**
 * 盤面の表示と操作：タイルを SVG で描き、1 本指で動かし、2 本指（PC はホイール）で拡大・縮小する
 * 拡大・縮小はページではなく盤面だけに効かせる（ページのズームは止めている）
 * タップは、指がほとんど動かなかったときだけ onTap に渡す
 */

import { tileUse, meepleUse, PLAYER_COLORS } from './tile-art.js';
import { rotatedTile } from './tiles.js';
import * as Motion from './motion/motion.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const TAP_SLOP = 9;        // これより動いたらタップではなく移動
const MIN_TILE_PX = 22;    // 一番縮めたときのタイルの大きさ
const MAX_TILE_PX = 200;   // 一番広げたときのタイルの大きさ

const svgEl = (tag, attrs = {}) => {
    const el = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
};

export default class BoardView {
    constructor(container, { onTap } = {}) {
        this.container = container;
        this.onTap = onTap;
        this.svg = svgEl('svg', { class: 'board-svg' });
        this.world = svgEl('g');
        this.layers = {};
        ['tiles', 'candidates', 'tentative', 'meeples', 'spots', 'fx'].forEach(name => {
            this.layers[name] = svgEl('g', { class: `layer-${name}` });
            this.world.appendChild(this.layers[name]);
        });
        this.svg.appendChild(this.world);
        container.prepend(this.svg);
        this.scale = 0.7;
        this.tx = 0;
        this.ty = 0;
        this.tileEls = new Map();
        this.pointers = new Map();
        this.state = { board: [], candidates: [], tentative: null, spots: [], selected: null };
        this.bindInput();
        new ResizeObserver(() => this.onResize()).observe(container);
    }

    get width() { return this.container.clientWidth; }
    get height() { return this.container.clientHeight; }

    applyTransform() {
        this.world.setAttribute('transform', `translate(${this.tx} ${this.ty}) scale(${this.scale})`);
    }

    clampScale(s) {
        return Math.min(MAX_TILE_PX / 100, Math.max(MIN_TILE_PX / 100, s));
    }

    // 画面の点 (sx, sy) を動かさずに拡大・縮小する
    zoomAt(sx, sy, scale) {
        const next = this.clampScale(scale);
        const wx = (sx - this.tx) / this.scale;
        const wy = (sy - this.ty) / this.scale;
        this.scale = next;
        this.tx = sx - wx * next;
        this.ty = sy - wy * next;
        this.applyTransform();
    }

    toWorld(sx, sy) {
        return [(sx - this.tx) / this.scale, (sy - this.ty) / this.scale];
    }

    localPoint(event) {
        const rect = this.container.getBoundingClientRect();
        return [event.clientX - rect.left, event.clientY - rect.top];
    }

    bindInput() {
        const el = this.container;
        el.addEventListener('pointerdown', e => {
            if (e.target.closest('button')) return;
            el.setPointerCapture?.(e.pointerId);
            const [x, y] = this.localPoint(e);
            this.pointers.set(e.pointerId, { x, y });
            this.cancelTween();
            if (this.pointers.size === 1) {
                this.tap = { id: e.pointerId, x, y };
            } else {
                this.tap = null;
                this.startPinch();
            }
        });
        el.addEventListener('pointermove', e => {
            const p = this.pointers.get(e.pointerId);
            if (!p) return;
            const [x, y] = this.localPoint(e);
            if (this.pointers.size === 1) {
                if (this.tap && Math.hypot(x - this.tap.x, y - this.tap.y) > TAP_SLOP) this.tap = null;
                if (!this.tap) {
                    this.tx += x - p.x;
                    this.ty += y - p.y;
                    this.applyTransform();
                }
                p.x = x;
                p.y = y;
            } else {
                p.x = x;
                p.y = y;
                this.movePinch();
            }
        });
        const end = e => {
            if (!this.pointers.has(e.pointerId)) return;
            const tap = this.tap && this.tap.id === e.pointerId && e.type === 'pointerup' ? this.tap : null;
            this.pointers.delete(e.pointerId);
            this.tap = null;
            if (this.pointers.size >= 2) this.startPinch();
            if (tap) this.handleTap(tap.x, tap.y);
        };
        el.addEventListener('pointerup', end);
        el.addEventListener('pointercancel', end);
        el.addEventListener('wheel', e => {
            e.preventDefault();
            const [x, y] = this.localPoint(e);
            this.cancelTween();
            this.zoomAt(x, y, this.scale * Math.exp(-e.deltaY * 0.0015));
        }, { passive: false });
    }

    startPinch() {
        const [a, b] = [...this.pointers.values()];
        this.pinch = {
            dist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
            world: this.toWorld((a.x + b.x) / 2, (a.y + b.y) / 2),
            scale: this.scale
        };
    }

    movePinch() {
        if (!this.pinch) return;
        const [a, b] = [...this.pointers.values()];
        const mid = [(a.x + b.x) / 2, (a.y + b.y) / 2];
        this.scale = this.clampScale(this.pinch.scale * Math.hypot(a.x - b.x, a.y - b.y) / this.pinch.dist);
        // 2 本指の真ん中にあった盤面の点を、指の真ん中に保つ（拡大と移動を同時に）
        this.tx = mid[0] - this.pinch.world[0] * this.scale;
        this.ty = mid[1] - this.pinch.world[1] * this.scale;
        this.applyTransform();
    }

    handleTap(sx, sy) {
        const [wx, wy] = this.toWorld(sx, sy);
        const cx = Math.floor(wx / 100);
        const cy = Math.floor(wy / 100);
        // コマの位置は、指で押せる大きさ（画面で半径 22px 以上）で当たりを取る
        const radius = Math.max(16, 22 / this.scale);
        let spot = null;
        let best = Infinity;
        this.state.spots.forEach(s => {
            const d = Math.hypot(s.wx - wx, s.wy - wy);
            if (d <= radius && d < best) {
                best = d;
                spot = s;
            }
        });
        this.onTap?.({ x: cx, y: cy, spot: spot?.feature ?? null });
    }

    onResize() {
        if (!this.sized && this.width > 0) {
            this.sized = true;
            this.fit(false);
            return;
        }
        // 大きさが変わっても、真ん中に見えていた所を真ん中に保つ
        if (this.lastSize) {
            this.tx += (this.width - this.lastSize[0]) / 2;
            this.ty += (this.height - this.lastSize[1]) / 2;
            this.applyTransform();
        }
        this.lastSize = [this.width, this.height];
    }

    // 盤面の全部（置ける場所を含む）が見えるように合わせる
    fit(animate = true) {
        const cells = [...this.state.board, ...this.state.candidates];
        if (cells.length === 0 || this.width === 0) return;
        const xs = cells.map(c => c.x);
        const ys = cells.map(c => c.y);
        const minX = Math.min(...xs), maxX = Math.max(...xs) + 1;
        const minY = Math.min(...ys), maxY = Math.max(...ys) + 1;
        const pad = 16;
        const scale = this.clampScale(Math.min(
            (this.width - pad * 2) / ((maxX - minX) * 100),
            (this.height - pad * 2) / ((maxY - minY) * 100),
            1.1
        ));
        const tx = this.width / 2 - ((minX + maxX) / 2) * 100 * scale;
        const ty = this.height / 2 - ((minY + maxY) / 2) * 100 * scale;
        this.moveTo(tx, ty, scale, animate);
        this.lastSize = [this.width, this.height];
    }

    // マスが画面の中に見えるように、必要なだけ動かす
    ensureVisible(x, y, margin = 24) {
        const size = 100 * this.scale;
        const left = this.tx + x * size;
        const top = this.ty + y * size;
        let dx = 0;
        let dy = 0;
        if (left < margin) dx = margin - left;
        else if (left + size > this.width - margin) dx = this.width - margin - (left + size);
        if (top < margin) dy = margin - top;
        else if (top + size > this.height - margin) dy = this.height - margin - (top + size);
        if (dx || dy) this.moveTo(this.tx + dx, this.ty + dy, this.scale, true);
    }

    moveTo(tx, ty, scale, animate) {
        this.cancelTween();
        const reduce = !Motion.enabled(); // 速さが「なし」（動きを減らす設定を含む）
        if (!animate || reduce) {
            Object.assign(this, { tx, ty, scale });
            this.applyTransform();
            return;
        }
        const from = { tx: this.tx, ty: this.ty, scale: this.scale };
        const start = performance.now();
        const step = now => {
            const t = Math.min(1, (now - start) / Motion.ms(280));
            const e = 1 - (1 - t) ** 3;
            this.tx = from.tx + (tx - from.tx) * e;
            this.ty = from.ty + (ty - from.ty) * e;
            this.scale = from.scale + (scale - from.scale) * e;
            this.applyTransform();
            this.tween = t < 1 ? requestAnimationFrame(step) : null;
        };
        this.tween = requestAnimationFrame(step);
    }

    cancelTween() {
        if (this.tween) cancelAnimationFrame(this.tween);
        this.tween = null;
    }

    /**
     * 描く
     * board：[{ x, y, type, rot, meeple }]、candidates：[{ x, y }]、
     * tentative：{ x, y, type, rot } 仮に置いたタイル、spots：コマを置ける要素（仮のタイルの上）、selected：選んだ要素
     * seat：手番の人（仮のコマの色）、dropKey：落とす演出をするマス
     */
    render(state) {
        this.state = { ...this.state, ...state };
        const { board, candidates, tentative, spots, selected, seat, dropKey, last } = this.state;
        this.renderTiles(board, dropKey);
        // 直前に置かれたタイルの枠（どこに置かれたかが分かるように）と、置ける場所
        const lastFrame = last && !tentative ? `<rect class="last-placed" x="${last.x * 100 + 2}" y="${last.y * 100 + 2}" width="96" height="96" rx="3"/>` : '';
        this.layers.candidates.innerHTML = lastFrame + candidates.map(c => `<rect class="candidate" x="${c.x * 100 + 4}" y="${c.y * 100 + 4}" width="92" height="92" rx="6"/>`).join('');
        // 仮に置いたタイルと、コマを置ける位置
        this.state.spots = [];
        if (tentative) {
            this.layers.tentative.innerHTML = `${tileUse(tentative.type, tentative.rot, tentative.x, tentative.y)}<rect class="tentative-frame" x="${tentative.x * 100 + 1.5}" y="${tentative.y * 100 + 1.5}" width="97" height="97" rx="3"/>`;
            const features = rotatedTile(tentative.type, tentative.rot).features;
            this.state.spots = (spots ?? []).map(fi => ({
                feature: fi, wx: tentative.x * 100 + features[fi].spot[0], wy: tentative.y * 100 + features[fi].spot[1], kind: features[fi].kind
            }));
            this.layers.spots.innerHTML = this.state.spots.map(s => (s.feature === selected
                ? `<g class="meeple-new">${meepleUse(s.wx, s.wy, seat, { lying: s.kind === 'field', size: 30 })}</g>`
                : `<circle class="spot" cx="${s.wx}" cy="${s.wy}" r="11"/>`)).join('');
        } else {
            this.layers.tentative.innerHTML = '';
            this.layers.spots.innerHTML = '';
        }
        this.renderMeeples(board, dropKey);
    }

    renderTiles(board, dropKey) {
        const keys = new Set();
        board.forEach(t => {
            const key = `${t.x},${t.y}`;
            keys.add(key);
            if (this.tileEls.has(key)) return;
            const g = svgEl('g', { class: key === dropKey ? 'tile drop' : 'tile' });
            g.style.transformOrigin = `${t.x * 100 + 50}px ${t.y * 100 + 50}px`;
            g.innerHTML = tileUse(t.type, t.rot, t.x, t.y);
            this.layers.tiles.appendChild(g);
            this.tileEls.set(key, g);
        });
        for (const [key, el] of this.tileEls) {
            if (!keys.has(key)) {
                el.remove();
                this.tileEls.delete(key);
            }
        }
    }

    renderMeeples(board, dropKey) {
        this.layers.meeples.innerHTML = board.filter(t => t.meeple).map(t => {
            const f = rotatedTile(t.type, t.rot).features[t.meeple.feature];
            const cls = `${t.x},${t.y}` === dropKey ? 'meeple-on drop-meeple' : 'meeple-on';
            return `<g class="${cls}">${meepleUse(t.x * 100 + f.spot[0], t.y * 100 + f.spot[1], t.meeple.seat, { lying: f.kind === 'field', size: 28 })}</g>`;
        }).join('');
    }

    // 得点の演出：数えたタイルを縁取り、得点を浮かべる
    showScore(event, delay = 0) {
        const color = event.winners.length === 1 ? PLAYER_COLORS[event.winners[0]] : '#fff7df';
        const g = svgEl('g', { class: 'score-fx' });
        g.style.animationDelay = `${Motion.ms(delay)}ms`;
        const cells = event.cells;
        g.innerHTML = cells.map(([x, y]) => `<rect class="score-cell" x="${x * 100 + 3}" y="${y * 100 + 3}" width="94" height="94" rx="4" style="stroke:${color}"/>`).join('');
        // 得点は、コマのいたマスの真ん中に出す（いなければ数えたタイルの真ん中）
        const at = event.meeples[0] ? [event.meeples[0].x, event.meeples[0].y] : cells[0];
        const label = svgEl('text', { x: at[0] * 100 + 50, y: at[1] * 100 + 58, class: 'score-label' });
        label.style.fill = color;
        label.textContent = event.winners.length > 0 ? `+${event.points}` : '0';
        g.appendChild(label);
        this.layers.fx.appendChild(g);
        setTimeout(() => g.remove(), Motion.ms(1900 + delay));
    }

    clear() {
        this.tileEls.forEach(el => el.remove());
        this.tileEls.clear();
        this.layers.fx.innerHTML = '';
        this.sized = false;
    }
}
