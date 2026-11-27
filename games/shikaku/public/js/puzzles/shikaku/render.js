/**
 * 四角に切れの画面
 * マスからマスへなぞると、その2マスを角にした長方形を描く（なぞっている間は、面積つきの下書きを見せる）
 * 長方形を押して離すと消す。何もないマスを押して離すと、1マスの長方形を描く
 */

import { injectStyle, svg, observeSize, cellAt } from '../common/dom.js';
import { areaOf, containsCell } from './logic.js';

const CSS = `
.shikaku { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.shikaku svg { display: block; touch-action: none; cursor: pointer; }
.shikaku .bg { fill: var(--cell-bg); }
.shikaku .grid { stroke: var(--line); stroke-width: 1; }
.shikaku .frame { fill: none; stroke: var(--ink); stroke-width: 2; }
.shikaku .cell-mark { fill: transparent; }
.shikaku .cell-mark.recommended { fill: var(--hint-fill); }
.shikaku .area { stroke: var(--ink); stroke-width: 2.5; stroke-linejoin: round; }
.shikaku .area.error { stroke: var(--error); stroke-dasharray: 6 4; }
.shikaku .area.preview { fill: var(--accent); fill-opacity: .18; stroke: var(--accent); stroke-dasharray: 4 3; }
.shikaku .hint-frame { fill: none; stroke: var(--hint); stroke-width: 3; stroke-dasharray: 3 4; }
.shikaku .clue { fill: var(--ink); font-weight: 800; text-anchor: middle; dominant-baseline: central; font-variant-numeric: tabular-nums; pointer-events: none; }
.shikaku .size { fill: var(--accent-strong); font-weight: 800; text-anchor: middle; dominant-baseline: central; pointer-events: none; paint-order: stroke; stroke: var(--paper); stroke-width: 3; }
.shikaku.solved .frame { stroke: var(--accent-strong); stroke-width: 3; }
`;

// 長方形の色（うすく塗るので、明るい画面でも暗い画面でも読める）
const COLORS = ['#e07a5f', '#3d85c6', '#6aa84f', '#e6a23c', '#8e6cc4', '#2aa198', '#d35d8f', '#9a9a2e'];

export function render(container, puzzle, initial, { onInput = () => {}, readOnly = false } = {}) {
    injectStyle('shikaku', CSS);
    const { width: w, height: h, clues } = puzzle;
    let state = initial;
    let decoration = {};
    let drag = null; // { from, to }

    const root = document.createElement('div');
    root.className = 'shikaku';
    const board = svg('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': '盤面' });
    root.append(board);
    container.replaceChildren(root);

    board.append(svg('rect', { class: 'bg', x: 0, y: 0, width: w, height: h }));
    const marks = Array.from({ length: w * h }, (_, i) => {
        const mark = svg('rect', { class: 'cell-mark', x: i % w, y: Math.floor(i / w), width: 1, height: 1 });
        board.append(mark);
        return mark;
    });
    const areaLayer = svg('g');
    board.append(areaLayer);
    for (let c = 1; c < w; c++) board.append(svg('line', { class: 'grid', x1: c, y1: 0, x2: c, y2: h, 'vector-effect': 'non-scaling-stroke' }));
    for (let r = 1; r < h; r++) board.append(svg('line', { class: 'grid', x1: 0, y1: r, x2: w, y2: r, 'vector-effect': 'non-scaling-stroke' }));
    const outlineLayer = svg('g');
    board.append(outlineLayer);
    clues.forEach(([cell, n]) => {
        const label = svg('text', { class: 'clue', x: (cell % w) + 0.5, y: Math.floor(cell / w) + 0.5, 'font-size': n >= 10 ? 0.5 : 0.6 });
        label.textContent = String(n);
        board.append(label);
    });
    const topLayer = svg('g');
    board.append(topLayer);
    board.append(svg('rect', { class: 'frame', x: 0, y: 0, width: w, height: h, 'vector-effect': 'non-scaling-stroke' }));

    const stopObserving = observeSize(container, ({ width, height }) => {
        const cell = Math.floor(Math.min(width / w, height / h, 60));
        board.setAttribute('width', cell * w);
        board.setAttribute('height', cell * h);
    });

    const box = ([top, left, bottom, right], inset = 0.04) => ({
        x: left + inset, y: top + inset, width: right - left + 1 - inset * 2, height: bottom - top + 1 - inset * 2
    });
    const rectOf = (a, b) => {
        const [ra, ca, rb, cb] = [Math.floor(a / w), a % w, Math.floor(b / w), b % w];
        return [Math.min(ra, rb), Math.min(ca, cb), Math.max(ra, rb), Math.max(ca, cb)];
    };
    // 長方形の色は、中の数字のマスで決める（描き直しても同じ色）
    const colorOf = (rect) => {
        const clue = clues.findIndex(([cell]) => containsCell(rect, w, cell));
        return COLORS[(clue < 0 ? rect[0] * 7 + rect[1] : clue) % COLORS.length];
    };

    const paint = () => {
        const errors = new Set(decoration.errors ?? []);
        areaLayer.replaceChildren(...state.rects.map(rect => svg('rect', { ...box(rect, 0), fill: colorOf(rect), 'fill-opacity': 0.22 })));
        outlineLayer.replaceChildren(...state.rects.map((rect, i) => svg('rect', {
            ...box(rect), class: `area${errors.has(i) ? ' error' : ''}`, fill: 'none', rx: 0.08, 'vector-effect': 'non-scaling-stroke'
        })));
        const top = [];
        const highlight = decoration.highlight ?? [];
        if (highlight.length) {
            const rows = highlight.map(x => Math.floor(x / w));
            const cols = highlight.map(x => x % w);
            top.push(svg('rect', { ...box([Math.min(...rows), Math.min(...cols), Math.max(...rows), Math.max(...cols)], 0.1), class: 'hint-frame', rx: 0.1, 'vector-effect': 'non-scaling-stroke' }));
        }
        if (drag && drag.to !== drag.from) {
            const rect = rectOf(drag.from, drag.to);
            const rows = rect[2] - rect[0] + 1;
            const cols = rect[3] - rect[1] + 1;
            top.push(svg('rect', { ...box(rect), class: 'area preview', rx: 0.08, 'vector-effect': 'non-scaling-stroke' }));
            const label = svg('text', { class: 'size', x: (rect[1] + rect[3] + 1) / 2, y: (rect[0] + rect[2] + 1) / 2, 'font-size': 0.42 });
            label.textContent = `${cols}×${rows}=${areaOf(rect)}`;
            top.push(label);
        }
        topLayer.replaceChildren(...top);
        const lit = new Set(highlight);
        marks.forEach((mark, i) => mark.classList.toggle('recommended', lit.has(i)));
        root.classList.toggle('solved', Boolean(decoration.solved));
    };

    board.addEventListener('pointerdown', (event) => {
        if (readOnly || decoration.solved || event.button > 0) return;
        const cell = cellAt(board.getBoundingClientRect(), w, h, event.clientX, event.clientY);
        if (cell < 0) return;
        event.preventDefault();
        board.setPointerCapture?.(event.pointerId);
        drag = { from: cell, to: cell };
    });
    board.addEventListener('pointermove', (event) => {
        if (!drag) return;
        const rect = board.getBoundingClientRect();
        // 盤面の外へ出たら、いちばん近い端のマスにする
        const x = Math.min(Math.max(event.clientX, rect.left + 1), rect.right - 1);
        const y = Math.min(Math.max(event.clientY, rect.top + 1), rect.bottom - 1);
        const cell = cellAt(rect, w, h, x, y);
        if (cell < 0 || cell === drag.to) return;
        drag.to = cell;
        paint();
    });
    const finish = (event) => {
        if (!drag) return;
        const { from, to } = drag;
        drag = null;
        if (event.type === 'pointerup') {
            const tapped = from === to;
            if (tapped && state.rects.some(rect => containsCell(rect, w, from))) onInput({ type: 'erase', cell: from });
            else {
                const [top, left, bottom, right] = rectOf(from, to);
                onInput({ type: 'rect', top, left, bottom, right });
            }
        }
        paint();
    };
    board.addEventListener('pointerup', finish);
    board.addEventListener('pointercancel', finish);

    paint();
    return {
        update(next, options = {}) {
            state = next;
            decoration = options;
            paint();
        },
        destroy() {
            stopObserving();
            root.remove();
        }
    };
}
