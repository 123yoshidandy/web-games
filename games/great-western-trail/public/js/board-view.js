/**
 * 道の盤（SVG）。拡大・移動ができる
 * data.js の座標は縦長で持っているので、横に寝かせて描く（画面の x = データの y、画面の y = データの x）
 * 右下の出発点から、左上のカンザスシティへ進む
 * 選べる場所（targets）を光らせ、タップで onPick(id) を呼ぶ
 */

import { TRAIL, TRADE_SPOTS, TRADE_VALUES, TRADE_OFF_TRAIL, BUILDINGS, PLAYER_COLORS, HAZARD_TYPES } from './data.js';

const NS = 'http://www.w3.org/2000/svg';
const MAX_ZOOM = 4;
const DRAG_PX = 8;
const PICK_PX = 30;   // 指で選べる大きさ
const TAP_PX = 22;

export const HAZARD_COLORS = { flood: '#3d7fc4', drought: '#d08a2e', rockfall: '#7d7a74' };
export const TEEPEE_COLORS = { green: '#3f9a52', blue: '#3a6fc0' };

// 画面の座標
export const posOf = (id) => {
    const t = TRAIL[id] ?? TRADE_OFF_TRAIL[id];
    return { x: t.y, y: t.x };
};

const BOUNDS = { x0: 0, x1: 1230, y0: 0, y1: 610 };

// 牧場主の位置（画面の座標）：席 → [x, y]。同じ場所の牧場主は横に並べる
export function pawnPositions(state) {
    const pos = new Map();
    const at = {};
    state.players.forEach(pl => {
        if (!pl.loc) return;
        const list = (at[pl.loc] ??= []);
        const p = posOf(pl.loc === 'start' ? 'start' : pl.loc);
        pos.set(pl.seat, [p.x + (list.length - (state.n - 1) / 2) * 13, p.y - 30]);
        list.push(pl.seat);
    });
    return pos;
}

function handMarks(hands, x, y) {
    return [...hands].map((h, i) => `<circle cx="${x + i * 9}" cy="${y}" r="4" class="toll ${h === 'g' ? 'toll-g' : 'toll-b'}"/>`).join('');
}

export default class BoardView {
    constructor(root, { onPick } = {}) {
        this.root = root;
        this.onPick = onPick;
        this.svg = document.createElementNS(NS, 'svg');
        this.svg.setAttribute('class', 'board-svg');
        this.svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        root.append(this.svg);
        this.k = 1;
        this.cx = (BOUNDS.x0 + BOUNDS.x1) / 2;
        this.cy = (BOUNDS.y0 + BOUNDS.y1) / 2;
        this.targets = [];
        this.pointers = new Map();
        this.gesture = null;
        this.bindInput();
        this.drawBase();
    }

    // 変わらない部分（道と森）
    drawBase() {
        const lines = [];
        Object.entries(TRAIL).forEach(([id, t]) => t.next.forEach(next => {
            const a = posOf(id);
            const b = posOf(next);
            lines.push(`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" class="trail-line"/>`);
        }));
        const woods = Object.entries(TRAIL).filter(([, t]) => t.woods).map(([id]) => {
            const p = posOf(id);
            return `<circle cx="${p.x}" cy="${p.y}" r="40" class="woods"/>`;
        });
        const tradeArea = TRADE_SPOTS.slice(0, 3).map(id => posOf(id));
        this.svg.innerHTML = `<rect x="${BOUNDS.x0}" y="${BOUNDS.y0}" width="${BOUNDS.x1 - BOUNDS.x0}" height="${BOUNDS.y1 - BOUNDS.y0}" class="board-bg" rx="18"/>
            <g class="woods-layer">${woods.join('')}</g>
            <rect x="${tradeArea[2].x - 30}" y="${tradeArea[0].y - 30}" width="${tradeArea[0].x - tradeArea[2].x + 60}" height="60" rx="10" class="trade-area"/>
            <g>${lines.join('')}</g>
            <g class="dyn"></g>`;
        this.dyn = this.svg.querySelector('.dyn');
    }

    // state：ルールの状態（ビューの state）。targets：光らせる場所の id
    render(state, targets = []) {
        this.state = state;
        const parts = [];
        Object.entries(TRAIL).forEach(([id, t]) => parts.push(this.nodeSvg(id, t, state.spots[id], targets.includes(id))));
        TRADE_SPOTS.forEach((id, i) => {
            const p = posOf(id);
            parts.push(`<text x="${p.x}" y="${p.y - 27}" class="trade-value">${TRADE_VALUES[i] > 0 ? '+' : ''}${TRADE_VALUES[i]}</text>`);
            if (!TRAIL[id]) parts.push(this.teepeeSvg(id, p, state.spots[id], targets.includes(id)));
        });
        // 牧場主
        const spots = pawnPositions(state);
        state.players.forEach(pl => {
            if (!spots.has(pl.seat)) return;
            const [x, y] = spots.get(pl.seat);
            // 動かすときは外側の g に CSS の transform をかける（内側の transform 属性はそのまま）
            parts.push(`<g class="pslot" data-seat="${pl.seat}"><g class="pawn${pl.seat === state.turn.seat && state.phase === 'play' ? ' active' : ''}" transform="translate(${x} ${y})">
                <path d="M0 0 L-7 -14 A8 8 0 1 1 7 -14 Z" fill="${PLAYER_COLORS[pl.seat]}"/></g></g>`);
        });
        this.dyn.innerHTML = parts.join('');
        this.targets = targets.map(id => ({ id, ...posOf(id), r: 26 }));
        this.root.classList.toggle('picking', targets.length > 0);
    }

    nodeSvg(id, t, tile, lit) {
        const { x, y } = posOf(id);
        const ring = lit ? `<circle cx="${x}" cy="${y}" r="31" class="target-ring"/>` : '';
        const tag = `data-id="${id}"`;
        if (t.kind === 'start') return `<g ${tag}><circle cx="${x}" cy="${y}" r="16" class="start-node"/><text x="${x}" y="${y + 4}" class="node-small">出発</text></g>`;
        if (t.kind === 'kc') return `<g ${tag}>${ring}<circle cx="${x}" cy="${y}" r="30" class="kc-node"/><text x="${x}" y="${y + 5}" class="node-label kc-label">KC</text></g>`;
        if (t.kind === 'neutral') {
            return `<g ${tag}>${ring}<rect x="${x - 24}" y="${y - 24}" width="48" height="48" rx="7" class="neutral-node"/><text x="${x}" y="${y + 8}" class="node-label">${tile.id}</text></g>`;
        }
        if (t.kind === 'plot') {
            const risk = t.risk ? `<text x="${x + 17}" y="${y - 15}" class="risk-mark">${t.risk === 'r1' ? '!' : '!!'}</text>` : '';
            if (tile?.t === 'building') {
                const def = BUILDINGS[tile.n];
                return `<g ${tag}>${ring}<rect x="${x - 22}" y="${y - 22}" width="44" height="44" rx="6" fill="${PLAYER_COLORS[tile.owner]}" class="building-node"/>
                    <text x="${x}" y="${y + 6}" class="node-label light">${tile.n}</text>${handMarks(def.hands, x - 14, y + 15)}${risk}</g>`;
            }
            return `<g ${tag}>${ring}<rect x="${x - 18}" y="${y - 18}" width="36" height="36" rx="6" class="plot-node"/>${risk}</g>`;
        }
        if (t.kind === 'hazard') {
            if (!tile) return `<g ${tag}>${ring}<circle cx="${x}" cy="${y}" r="9" class="empty-node"/></g>`;
            return `<g ${tag}>${ring}<path d="M${x} ${y - 22} L${x + 22} ${y} L${x} ${y + 22} L${x - 22} ${y} Z" fill="${HAZARD_COLORS[tile.type]}" class="hazard-node"/>
                <text x="${x}" y="${y + 5}" class="node-label light small">${tile.vp}</text>${handMarks(tile.hand, x - 4, y + 27)}
                <title>${HAZARD_TYPES[tile.type]}（${tile.vp}点）</title></g>`;
        }
        if (t.kind === 'teepee') return this.teepeeSvg(id, { x, y }, tile, lit);
        return '';
    }

    teepeeSvg(id, { x, y }, tile, lit) {
        const ring = lit ? `<circle cx="${x}" cy="${y}" r="29" class="target-ring"/>` : '';
        if (!tile) return `<g data-id="${id}">${ring}<circle cx="${x}" cy="${y}" r="9" class="empty-node"/></g>`;
        const color = TEEPEE_COLORS[tile.color];
        const hand = TRAIL[id] ? handMarks(tile.color === 'green' ? 'g' : 'b', x, y + 26) : '';
        return `<g data-id="${id}">${ring}<path d="M${x} ${y - 21} L${x + 18} ${y + 15} L${x - 18} ${y + 15} Z" fill="${color}" class="teepee-node"/>
            <path d="M${x - 5} ${y + 15} L${x} ${y + 3} L${x + 5} ${y + 15}" class="teepee-door"/>${hand}</g>`;
    }

    // ---- 拡大と移動 ----

    get scale() {
        return Math.min(this.cw / (BOUNDS.x1 - BOUNDS.x0), this.ch / (BOUNDS.y1 - BOUNDS.y0)) * this.k;
    }

    resize() {
        const rect = this.root.getBoundingClientRect();
        this.cw = rect.width;
        this.ch = rect.height;
        this.apply();
    }

    resetZoom() {
        this.k = 1;
        this.cx = (BOUNDS.x0 + BOUNDS.x1) / 2;
        this.cy = (BOUNDS.y0 + BOUNDS.y1) / 2;
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

    // 点の集まりが収まるように寄せて拡大する（場所が指で選べるくらいに見えていれば、拡大しない）
    focus(points, maxK = 2.4) {
        if (!this.cw || 52 * this.scale >= PICK_PX || points.length === 0) return;
        const xs = points.map(q => q.x);
        const ys = points.map(q => q.y);
        const base = this.scale / this.k;
        const fit = Math.min(this.cw / (Math.max(...xs) - Math.min(...xs) + 140), this.ch / (Math.max(...ys) - Math.min(...ys) + 140)) / base;
        this.k = Math.max(1, Math.min(maxK, fit));
        this.cx = (Math.min(...xs) + Math.max(...xs)) / 2;
        this.cy = (Math.min(...ys) + Math.max(...ys)) / 2;
        this.apply();
    }

    apply() {
        if (!this.cw || !this.ch) return;
        const s = this.scale;
        const vw = this.cw / s;
        const vh = this.ch / s;
        const { x0, x1, y0, y1 } = BOUNDS;
        const clamp = (c, v, lo, hi) => (v >= hi - lo ? (lo + hi) / 2 : Math.min(hi - v / 2, Math.max(lo + v / 2, c)));
        this.cx = clamp(this.cx, vw, x0, x1);
        this.cy = clamp(this.cy, vh, y0, y1);
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

    // 盤の座標から画面の座標へ（確かめるスクリプトからも使う）
    toScreen(point) {
        const rect = this.svg.getBoundingClientRect();
        return { x: rect.left + (point.x - this.vx) * this.scale, y: rect.top + (point.y - this.vy) * this.scale };
    }

    tap(point) {
        if (this.targets.length === 0) return;
        const s = this.scale;
        const dist = (t) => Math.hypot(t.x - point.x, t.y - point.y);
        const sizePx = 52 * s;
        if (sizePx >= PICK_PX) {
            const hit = this.targets.filter(t => dist(t) <= t.r + 8).sort((a, b) => dist(a) - dist(b))[0];
            if (hit) this.onPick?.(hit.id);
            return;
        }
        const near = this.targets.filter(t => dist(t) <= TAP_PX / s + t.r);
        if (near.length === 1) this.onPick?.(near[0].id);
        else if (near.length > 1) this.zoomBy(Math.max(2, PICK_PX / sizePx), point);
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
