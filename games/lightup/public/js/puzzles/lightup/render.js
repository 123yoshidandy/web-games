/**
 * ライトアップ（美術館）の画面
 * 白マスを押して離すと、明かり → ・ → 空 の順に変える。押したまま別のマスへなぞると、なぞった白マスに「・」を付ける
 * （始めのマスが「・」なら、なぞったマスの「・」を消す。明かりのマスはそのまま）。指を離したときに1つの入力として送る
 */

import { injectStyle, el, svg, observeSize, cellAt } from '../common/dom.js';
import { shapeOf, litCells, WHITE, EMPTY, LIGHT, DOT } from './logic.js';

const CSS = `
.lightup { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; --lit: color-mix(in srgb, #f4c430 32%, var(--cell-bg)); --bulb: #f2b01e; }
.lightup svg { display: block; touch-action: none; cursor: pointer; }
.lightup .bg { fill: var(--cell-bg); stroke: var(--ink); stroke-width: 2; }
.lightup .grid { stroke: var(--line); stroke-width: 1; }
.lightup .cell { fill: transparent; transition: fill .15s; }
.lightup .cell.lit { fill: var(--lit); }
.lightup .cell.preview { stroke: var(--accent); stroke-width: 2; }
.lightup .wall { fill: var(--ink); }
.lightup .wall.error { fill: var(--error); }
.lightup .num { fill: var(--paper); font-weight: 800; text-anchor: middle; dominant-baseline: central; pointer-events: none; font-variant-numeric: tabular-nums; }
.lightup .num.done { opacity: .45; }
.lightup .bulb { fill: var(--bulb); stroke: var(--ink); stroke-width: 1.5; }
.lightup .bulb.error { fill: var(--error); }
.lightup .ray { stroke: var(--bulb); stroke-width: 1.5; stroke-linecap: round; }
.lightup .dot { fill: var(--ink-soft); }
.lightup .mark { fill: transparent; pointer-events: none; }
.lightup .mark.recommended { fill: var(--hint-fill); stroke: var(--hint); stroke-width: 3; }
.lightup.solved .bg { stroke: var(--accent-strong); }
.lightup.solved .bulb { stroke: var(--accent-strong); }
`;

const NEXT = { [EMPTY]: LIGHT, [LIGHT]: DOT, [DOT]: EMPTY };

export function render(container, puzzle, initial, { onInput = () => {}, readOnly = false } = {}) {
    injectStyle('lightup', CSS);
    const { width: w, height: h, grid } = puzzle;
    const { numbered, around } = shapeOf(puzzle);
    let state = initial;
    let decoration = {};
    let stroke = null; // 押している途中 { start, cells, value, moved }

    const root = el('div', { class: 'lightup' });
    const board = svg('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': '盤面' });
    root.append(board);
    container.replaceChildren(root);

    board.append(svg('rect', { class: 'bg', x: 0, y: 0, width: w, height: h, 'vector-effect': 'non-scaling-stroke' }));
    const cellRects = grid.map((value, i) => {
        const rect = svg('rect', { class: value === WHITE ? 'cell' : 'wall', x: i % w, y: Math.floor(i / w), width: 1, height: 1, 'data-cell': i });
        board.append(rect);
        return rect;
    });
    for (let c = 1; c < w; c++) board.append(svg('line', { class: 'grid', x1: c, y1: 0, x2: c, y2: h, 'vector-effect': 'non-scaling-stroke' }));
    for (let r = 1; r < h; r++) board.append(svg('line', { class: 'grid', x1: 0, y1: r, x2: w, y2: r, 'vector-effect': 'non-scaling-stroke' }));
    const numbers = new Map(numbered.map(cell => {
        const text = svg('text', { class: 'num', x: (cell % w) + 0.5, y: Math.floor(cell / w) + 0.53, 'font-size': 0.6 });
        text.textContent = String(grid[cell]);
        board.append(text);
        return [cell, text];
    }));
    const markLayer = svg('g');
    const marks = grid.map((value, i) => {
        const mark = svg('rect', { class: 'mark', x: (i % w) + 0.06, y: Math.floor(i / w) + 0.06, width: 0.88, height: 0.88, rx: 0.12, 'vector-effect': 'non-scaling-stroke' });
        markLayer.append(mark);
        return mark;
    });
    const pieceLayer = svg('g');
    board.append(pieceLayer, markLayer);

    const stopObserving = observeSize(container, ({ width, height }) => {
        const cell = Math.floor(Math.min(width / w, height / h, 56));
        board.setAttribute('width', cell * w);
        board.setAttribute('height', cell * h);
    });

    // 明かり（電球と光の線）と「・」
    const bulb = (cell, error) => {
        const x = (cell % w) + 0.5;
        const y = Math.floor(cell / w) + 0.5;
        const group = svg('g');
        for (let k = 0; k < 8; k++) {
            const angle = (Math.PI / 4) * k;
            group.append(svg('line', { class: 'ray', x1: x + Math.cos(angle) * 0.27, y1: y + Math.sin(angle) * 0.27, x2: x + Math.cos(angle) * 0.38, y2: y + Math.sin(angle) * 0.38, 'vector-effect': 'non-scaling-stroke' }));
        }
        group.append(svg('circle', { class: `bulb${error ? ' error' : ''}`, cx: x, cy: y, r: 0.21, 'vector-effect': 'non-scaling-stroke' }));
        return group;
    };
    const dot = (cell) => svg('circle', { class: 'dot', cx: (cell % w) + 0.5, cy: Math.floor(cell / w) + 0.5, r: 0.08 });

    const paint = () => {
        const shown = state.cells.slice();
        if (stroke?.moved) stroke.cells.forEach(cell => { if (shown[cell] !== LIGHT) shown[cell] = stroke.value; });
        const errors = new Set(decoration.errors ?? []);
        const lit = litCells(puzzle, cell => shown[cell] === LIGHT);
        const preview = new Set(stroke?.moved ? stroke.cells : []);
        cellRects.forEach((rect, i) => {
            if (grid[i] === WHITE) {
                rect.classList.toggle('lit', Boolean(lit[i]));
                rect.classList.toggle('preview', preview.has(i));
            } else rect.classList.toggle('error', errors.has(i));
        });
        numbers.forEach((text, cell) => {
            text.classList.toggle('done', around[cell].filter(s => shown[s] === LIGHT).length === grid[cell] && !errors.has(cell));
        });
        pieceLayer.replaceChildren(...shown.map((value, cell) => {
            if (grid[cell] !== WHITE) return null;
            if (value === LIGHT) return bulb(cell, errors.has(cell));
            return value === DOT ? dot(cell) : null;
        }).filter(Boolean));
        const highlight = new Set(decoration.highlight ?? []);
        marks.forEach((mark, i) => mark.classList.toggle('recommended', highlight.has(i)));
        root.classList.toggle('solved', Boolean(decoration.solved));
    };

    const cellOf = (event) => cellAt(board.getBoundingClientRect(), w, h, event.clientX, event.clientY);

    board.addEventListener('pointerdown', (event) => {
        if (readOnly || decoration.solved || event.button > 0) return;
        const cell = cellOf(event);
        if (cell < 0 || grid[cell] !== WHITE) return;
        event.preventDefault();
        board.setPointerCapture?.(event.pointerId);
        stroke = { start: cell, cells: [cell], value: state.cells[cell] === DOT ? EMPTY : DOT, moved: false };
    });
    board.addEventListener('pointermove', (event) => {
        if (!stroke) return;
        const cell = cellOf(event);
        if (cell < 0 || grid[cell] !== WHITE || stroke.cells.includes(cell)) return;
        stroke.moved = true;
        stroke.cells.push(cell);
        paint();
    });
    const finish = () => {
        if (!stroke) return;
        const { start, moved, value } = stroke;
        // なぞったときは、明かりのマスは変えない
        const cells = moved ? stroke.cells.filter(cell => state.cells[cell] !== LIGHT) : [start];
        stroke = null;
        paint();
        if (!moved) onInput({ cells, value: NEXT[state.cells[start]] });
        else if (cells.length) onInput({ cells, value });
    };
    board.addEventListener('pointerup', finish);
    board.addEventListener('pointercancel', () => {
        stroke = null;
        paint();
    });

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
