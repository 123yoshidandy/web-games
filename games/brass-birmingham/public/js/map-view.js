/**
 * 地図の描画と、拡大・移動・タップ（power-grid の盤と同じ作り）
 * - つながり・町の枠・商人の町は、人数が決まったときに一度だけ描く。タイル・リンク・商人タイル・選べる印は毎回描き直す
 * - 拡大：2本指でつまむ、マウスのホイール、＋−のボタン。1本指でドラッグすると動かす
 * - タップ：選べるもの（建てる場所・リンク・売るタイル）が指の届く範囲に1つだけならそれを選ぶ。2つ以上なら、そこを拡大する
 */

import { LOCATIONS, MERCHANTS, LINKS, LINK_BY_ID, INDUSTRIES, PLAYER_COLORS } from './data.js';
import { inPlay } from './rules.js';
import { INDUSTRY_COLORS, INDUSTRY_TEXT, industryIcon } from './art.js';

const NS = 'http://www.w3.org/2000/svg';
const SW = 40;               // 建てる場所の大きさ（地図の座標）
const GAP = 4;
const PAD = 5;
const MW = 30;               // 商人タイルの大きさ
const MAX_ZOOM = 5;
const TAP_PX = 22;           // 指の届く範囲
const PICK_PX = 28;          // 選ぶものがこの大きさ（px）以上なら、そのまま選ぶ
const DRAG_PX = 8;

const el = (name, attrs = {}, text = null) => {
    const node = document.createElementNS(NS, name);
    Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
    if (text !== null) node.textContent = text;
    return node;
};

// 町の中の、建てる場所の左上の位置
export function slotRect(loc, idx) {
    const def = LOCATIONS[loc];
    const n = def.slots.length;
    const w = n * SW + (n - 1) * GAP;
    return { x: def.x - w / 2 + idx * (SW + GAP), y: def.y - SW / 2, w: SW, h: SW };
}

function merchantSlotRect(m, idx) {
    const def = MERCHANTS[m];
    const w = def.slots * MW + (def.slots - 1) * GAP;
    return { x: def.x - w / 2 + idx * (MW + GAP), y: def.y - MW / 2, w: MW, h: MW };
}

const placePos = (id) => LOCATIONS[id] ?? MERCHANTS[id];

// リンクの線（3つの町にまたがるものは、2つ目の町への線の中ほどから3つ目へ枝を出す）
function linkSegments(link) {
    const [a, b, c] = link.ends.map(placePos);
    const segs = [[a, b]];
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    if (c) segs.push([mid, c]);
    return { segs, mid: c ? { x: (mid.x * 2 + c.x) / 3, y: (mid.y * 2 + c.y) / 3 } : mid };
}

export const BONUS_TEXT = { money: (b) => `£${b.amount}`, vp: (b) => `${b.amount}点`, income: (b) => `収入+${b.amount}`, develop: () => '開発' };

export default class MapView {
    constructor(root, { onPick } = {}) {
        this.root = root;
        this.onPick = onPick;
        this.svg = el('svg', { class: 'map-svg', role: 'img', 'aria-label': '地図' });
        this.layers = {};
        ['links', 'built', 'towns', 'tiles', 'merchants', 'marks'].forEach(name => {
            this.layers[name] = el('g', { class: `layer-${name}` });
            this.svg.append(this.layers[name]);
        });
        root.append(this.svg);
        this.key = null;
        this.k = 1;
        this.targets = [];
        this.pointers = new Map();
        this.gesture = null;
        this.bindInput();
        new ResizeObserver(() => this.resize()).observe(root);
    }

    // 人数が決まったら、変わらない部分を描く
    setup(state) {
        const key = String(state.numPlayers);
        if (key === this.key) return;
        this.key = key;
        const xs = [];
        const ys = [];
        Object.values(LOCATIONS).concat(Object.values(MERCHANTS)).forEach(p => { xs.push(p.x); ys.push(p.y); });
        this.bounds = { x0: Math.min(...xs) - 110, x1: Math.max(...xs) + 110, y0: Math.min(...ys) - 50, y1: Math.max(...ys) + 60 };
        this.bw = this.bounds.x1 - this.bounds.x0;
        this.bh = this.bounds.y1 - this.bounds.y0;
        const { links, towns } = this.layers;
        links.replaceChildren();
        towns.replaceChildren();
        for (const link of LINKS) {
            const on = link.ends.every(e => inPlay(state, e));
            const { segs } = linkSegments(link);
            const cls = `link ${link.canal ? 'canal' : ''} ${link.rail ? 'rail' : ''} ${on ? '' : 'off'}`;
            segs.forEach(([a, b]) => links.append(el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: cls })));
        }
        for (const [id, def] of Object.entries(LOCATIONS)) {
            const on = inPlay(state, id);
            const g = el('g', { class: `town ${on ? '' : 'off'} ${def.farm ? 'farm' : ''}` });
            const n = def.slots.length;
            const w = n * SW + (n - 1) * GAP + PAD * 2;
            g.append(el('rect', { x: def.x - w / 2, y: def.y - SW / 2 - PAD, width: w, height: SW + PAD * 2, rx: 7, class: 'town-box' }));
            g.append(el('text', { x: def.x, y: def.y + SW / 2 + PAD + 15, class: 'town-name' }, def.name));
            def.slots.forEach((allowed, i) => {
                const r = slotRect(id, i);
                const slotG = el('g', { class: 'slot-empty' });
                slotG.append(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 4, class: 'slot-bg' }));
                allowed.forEach((ind, j) => {
                    const cx = r.x + r.w / 2 + (allowed.length === 1 ? 0 : (j === 0 ? -9 : 9));
                    const cy = r.y + r.h / 2;
                    slotG.append(el('circle', { cx, cy, r: 8.5, fill: INDUSTRY_COLORS[ind], class: 'slot-ind' }));
                    slotG.append(el('text', { x: cx, y: cy + 4, class: 'slot-ind-text', fill: INDUSTRY_TEXT[ind] }, INDUSTRIES[ind].short));
                });
                g.append(slotG);
            });
            towns.append(g);
        }
        this.resetZoom();
    }

    // marks：{ slots, links }（直前のアクションの印）。pick：{ slots: [slot], links: [id] }（選べるもの）。selected：{ slots, links }
    render(state, { marks = null, pick = null, selected = null } = {}) {
        this.state = state;
        const { tiles, built, merchants, marks: markLayer } = this.layers;
        built.replaceChildren();
        for (const [id, owner] of Object.entries(state.links)) {
            const { segs } = linkSegments(LINK_BY_ID[id]);
            segs.forEach(([a, b], i) => {
                built.append(el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: `built-link ${state.era}`, stroke: PLAYER_COLORS[owner], 'data-link': `${id}:${i}` }));
            });
        }
        tiles.replaceChildren();
        for (const [slot, tile] of Object.entries(state.board)) {
            const [loc, idx] = slot.split(':');
            const node = this.tileNode(slotRect(loc, Number(idx)), tile);
            node.setAttribute('data-slot', slot); // 動き（ui.js）が、前に描いたタイルと比べる目印
            tiles.append(node);
        }
        merchants.replaceChildren();
        for (const [m, def] of Object.entries(MERCHANTS)) {
            const on = inPlay(state, m);
            const g = el('g', { class: `merchant ${on ? '' : 'off'}` });
            const w = def.slots * MW + (def.slots - 1) * GAP + PAD * 2;
            g.append(el('rect', { x: def.x - w / 2, y: def.y - MW / 2 - PAD, width: w, height: MW + PAD * 2, rx: 12, class: 'merchant-box' }));
            g.append(el('text', { x: def.x, y: def.y - MW / 2 - PAD - 6, class: 'merchant-name' }, def.name));
            g.append(el('text', { x: def.x, y: def.y + MW / 2 + PAD + 14, class: 'merchant-bonus' }, `ビール→${BONUS_TEXT[def.bonus.type](def.bonus)}`));
            for (let i = 0; i < def.slots; i++) {
                const r = merchantSlotRect(m, i);
                const info = state.merchants[`${m}:${i}`];
                g.append(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 5, class: `merchant-slot ${info?.tile ?? 'none'}` }));
                if (info && info.tile !== 'blank') {
                    const label = info.tile === 'any' ? '全' : INDUSTRIES[info.tile].short;
                    g.append(el('text', { x: r.x + r.w / 2, y: r.y + r.h / 2 + 2, class: 'merchant-tile-text' }, label));
                    if (info.beer > 0) g.append(el('circle', { cx: r.x + r.w - 5, cy: r.y + 5, r: 5, class: 'beer-dot' }));
                }
            }
            merchants.append(g);
        }
        markLayer.replaceChildren();
        this.targets = [];
        const markSlots = new Set(marks?.slots ?? []);
        const markLinks = new Set(marks?.links ?? []);
        const selSlots = new Set(selected?.slots ?? []);
        const selLinks = new Set(selected?.links ?? []);
        markSlots.forEach(slot => {
            const r = this.slotRectOf(slot);
            if (r) markLayer.append(el('rect', { x: r.x - 3, y: r.y - 3, width: r.w + 6, height: r.h + 6, rx: 6, class: 'last-mark' }));
        });
        markLinks.forEach(id => {
            const { mid } = linkSegments(LINK_BY_ID[id]);
            markLayer.append(el('circle', { cx: mid.x, cy: mid.y, r: 10, class: 'last-mark' }));
        });
        for (const id of pick?.links ?? []) {
            const { segs, mid } = linkSegments(LINK_BY_ID[id]);
            segs.forEach(([a, b]) => markLayer.append(el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: selLinks.has(id) ? 'pick-link selected' : 'pick-link' })));
            markLayer.append(el('circle', { cx: mid.x, cy: mid.y, r: 11, class: selLinks.has(id) ? 'pick-dot selected' : 'pick-dot' }));
            this.targets.push({ kind: 'link', id, x: mid.x, y: mid.y, r: 11 });
        }
        selLinks.forEach(id => {
            if ((pick?.links ?? []).includes(id)) return;
            const { segs } = linkSegments(LINK_BY_ID[id]);
            segs.forEach(([a, b]) => markLayer.append(el('line', { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: 'pick-link selected' })));
        });
        for (const slot of pick?.slots ?? []) {
            const r = this.slotRectOf(slot);
            if (!r) continue;
            markLayer.append(el('rect', { x: r.x - 2, y: r.y - 2, width: r.w + 4, height: r.h + 4, rx: 6, class: selSlots.has(slot) ? 'pick-slot selected' : 'pick-slot' }));
            this.targets.push({ kind: 'slot', id: slot, x: r.x + r.w / 2, y: r.y + r.h / 2, r: r.w / 2 });
        }
        selSlots.forEach(slot => {
            if ((pick?.slots ?? []).includes(slot)) return;
            const r = this.slotRectOf(slot);
            if (r) markLayer.append(el('rect', { x: r.x - 2, y: r.y - 2, width: r.w + 4, height: r.h + 4, rx: 6, class: 'pick-slot selected' }));
        });
    }

    slotRectOf(slot) {
        const [loc, idx] = slot.split(':');
        if (LOCATIONS[loc]) return slotRect(loc, Number(idx));
        if (MERCHANTS[loc]) return merchantSlotRect(loc, Number(idx));
        return null;
    }

    tileNode(r, tile) {
        const g = el('g', { class: `tile ${tile.flipped ? 'flipped' : ''}` });
        const color = PLAYER_COLORS[tile.owner];
        g.append(el('rect', { x: r.x, y: r.y, width: r.w, height: r.h, rx: 4, class: 'tile-bg', fill: tile.flipped ? color : INDUSTRY_COLORS[tile.industry], stroke: color }));
        g.append(industryIcon(tile.industry, r.x + r.w / 2, r.y + 15, tile.flipped ? '#fff' : INDUSTRY_TEXT[tile.industry]));
        g.append(el('text', { x: r.x + r.w / 2, y: r.y + r.h - 5, class: 'tile-level', fill: tile.flipped ? '#fff' : INDUSTRY_TEXT[tile.industry] }, tile.flipped ? '済' : `${tile.level}`));
        if (tile.cubes > 0) {
            const cls = tile.industry === 'coal' ? 'cube coal' : tile.industry === 'iron' ? 'cube iron' : 'cube beer';
            for (let i = 0; i < Math.min(6, tile.cubes); i++) {
                g.append(el('rect', { x: r.x + 2 + (i % 3) * 6, y: r.y + r.h - 13 + Math.floor(i / 3) * -6 - 0, width: 5, height: 5, rx: tile.industry === 'brewery' ? 2.5 : 1, class: cls }));
            }
        }
        if (tile.flipped) g.append(el('text', { x: r.x + r.w - 3, y: r.y + 10, class: 'tile-vp' }, tileVp(tile)));
        return g;
    }

    // ---- 拡大と移動 ----

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
        this.k = 1;
        this.cx = this.bounds ? (this.bounds.x0 + this.bounds.x1) / 2 : 0;
        this.cy = this.bounds ? (this.bounds.y0 + this.bounds.y1) / 2 : 0;
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

    // 地図の座標の点を、画面の真ん中に寄せて拡大する
    // 建てる場所が指で選べるくらいに見えていれば、拡大しない（広い画面）
    focus(point, k = 2.4) {
        if (SW * this.scale >= PICK_PX) return;
        this.k = Math.max(this.k, k);
        this.cx = point.x;
        this.cy = point.y;
        this.apply();
    }

    apply() {
        if (!this.cw || !this.ch || !this.bw) return;
        const s = this.scale;
        const vw = this.cw / s;
        const vh = this.ch / s;
        const { x0, x1, y0, y1 } = this.bounds;
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

    // 地図の座標から画面の座標へ（確かめるスクリプトからも使う）
    toScreen(point) {
        const rect = this.svg.getBoundingClientRect();
        return { x: rect.left + (point.x - this.vx) * this.scale, y: rect.top + (point.y - this.vy) * this.scale };
    }

    targetPoint(kind, id) {
        return this.targets.find(t => t.kind === kind && t.id === id) ?? null;
    }

    tap(point) {
        if (this.targets.length === 0) return;
        const s = this.scale;
        const dist = (t) => Math.hypot(t.x - point.x, t.y - point.y);
        const sizePx = Math.min(...this.targets.map(t => t.r * 2)) * s;
        if (sizePx >= PICK_PX) {
            const hit = this.targets.filter(t => dist(t) <= t.r + 6).sort((a, b) => dist(a) - dist(b))[0];
            if (hit) this.onPick?.(hit.kind, hit.id);
            return;
        }
        const near = this.targets.filter(t => dist(t) <= TAP_PX / s + t.r);
        if (near.length === 1) this.onPick?.(near[0].kind, near[0].id);
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

function tileVp(tile) {
    return INDUSTRIES[tile.industry].tiles[tile.level - 1].vp;
}
