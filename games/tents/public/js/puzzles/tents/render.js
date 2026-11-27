/**
 * テントの画面
 * マスを押して離すと、テント → 芝生 → 空 の順に変える。押したまま別のマスへなぞると、なぞったマスに芝生を付ける
 * （始めのマスが芝生なら、なぞったマスの芝生を消す。テントと木のマスはそのまま）。指を離したときに1つの入力として送る
 * 盤面の上に列ごと、左に行ごとのテントの数を出す
 */

import { injectStyle, el, svg, observeSize, cellAt } from '../common/dom.js';
import { shapeOf, EMPTY, TENT, GRASS } from './logic.js';

const CSS = `
.tents { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; --grass: color-mix(in srgb, #7cb35a 28%, var(--cell-bg)); --leaf: #3f8a4a; --trunk: #8a5a32; --canvas: #d9822b; }
.tents svg { display: block; touch-action: none; cursor: pointer; }
.tents .bg { fill: var(--cell-bg); stroke: var(--ink); stroke-width: 2; }
.tents .grid { stroke: var(--line); stroke-width: 1; }
.tents .cell { fill: transparent; }
.tents .cell.grass { fill: var(--grass); }
.tents .cell.preview { stroke: var(--accent); stroke-width: 2; }
.tents .band { fill: var(--clue-band); }
.tents .clue { fill: var(--ink); font-weight: 800; text-anchor: middle; dominant-baseline: central; font-variant-numeric: tabular-nums; pointer-events: none; }
.tents .clue.done { fill: var(--ink-faint); }
.tents .clue.error { fill: var(--error); }
.tents .leaf { fill: var(--leaf); }
.tents .trunk { fill: var(--trunk); }
.tents .tent { fill: var(--canvas); stroke: var(--ink); stroke-width: 1.5; stroke-linejoin: round; }
.tents .tent.error { fill: var(--error); }
.tents .door { fill: var(--ink); opacity: .55; }
.tents .tuft { stroke: var(--leaf); stroke-width: 1.5; stroke-linecap: round; fill: none; opacity: .7; }
.tents .mark { fill: transparent; pointer-events: none; }
.tents .mark.recommended { fill: var(--hint-fill); stroke: var(--hint); stroke-width: 3; }
.tents.solved .bg { stroke: var(--accent-strong); }
`;

const NEXT = { [EMPTY]: TENT, [TENT]: GRASS, [GRASS]: EMPTY };

export function render(container, puzzle, initial, { onInput = () => {}, readOnly = false } = {}) {
    injectStyle('tents', CSS);
    const { width: w, height: h } = puzzle;
    const { isTree, lines } = shapeOf(puzzle);
    let state = initial;
    let decoration = {};
    let stroke = null; // 押している途中 { start, cells, value, moved }

    // 座標は、左と上に数字の欄（1マス分）をとる
    const root = el('div', { class: 'tents' });
    const board = svg('svg', { viewBox: `0 0 ${w + 1} ${h + 1}`, role: 'img', 'aria-label': '盤面' });
    root.append(board);
    container.replaceChildren(root);

    const xOf = (cell) => (cell % w) + 1;
    const yOf = (cell) => Math.floor(cell / w) + 1;
    board.append(svg('rect', { class: 'band', x: 1, y: 0, width: w, height: 1 }), svg('rect', { class: 'band', x: 0, y: 1, width: 1, height: h }));
    board.append(svg('rect', { class: 'bg', x: 1, y: 1, width: w, height: h, 'vector-effect': 'non-scaling-stroke' }));
    const cellRects = Array.from({ length: w * h }, (_, i) => {
        const rect = svg('rect', { class: 'cell', x: xOf(i), y: yOf(i), width: 1, height: 1 });
        board.append(rect);
        return rect;
    });
    for (let c = 1; c < w; c++) board.append(svg('line', { class: 'grid', x1: c + 1, y1: 1, x2: c + 1, y2: h + 1, 'vector-effect': 'non-scaling-stroke' }));
    for (let r = 1; r < h; r++) board.append(svg('line', { class: 'grid', x1: 1, y1: r + 1, x2: w + 1, y2: r + 1, 'vector-effect': 'non-scaling-stroke' }));
    const clues = lines.map(line => {
        const text = line.kind === 'row'
            ? svg('text', { class: 'clue', x: 0.5, y: line.index + 1.53, 'font-size': 0.55 })
            : svg('text', { class: 'clue', x: line.index + 1.5, y: 0.53, 'font-size': 0.55 });
        text.textContent = String(line.need);
        board.append(text);
        return text;
    });
    // 木（動かない）
    puzzle.trees.forEach(cell => {
        const x = xOf(cell) + 0.5;
        const y = yOf(cell) + 0.5;
        board.append(svg('rect', { class: 'trunk', x: x - 0.06, y: y + 0.08, width: 0.12, height: 0.3 }));
        board.append(svg('circle', { class: 'leaf', cx: x, cy: y - 0.1, r: 0.27 }));
        board.append(svg('circle', { class: 'leaf', cx: x - 0.17, cy: y + 0.06, r: 0.16 }));
        board.append(svg('circle', { class: 'leaf', cx: x + 0.17, cy: y + 0.06, r: 0.16 }));
    });
    const pieceLayer = svg('g');
    const markLayer = svg('g');
    const marks = cellRects.map((_, i) => {
        const mark = svg('rect', { class: 'mark', x: xOf(i) + 0.06, y: yOf(i) + 0.06, width: 0.88, height: 0.88, rx: 0.12, 'vector-effect': 'non-scaling-stroke' });
        markLayer.append(mark);
        return mark;
    });
    board.append(pieceLayer, markLayer);

    const stopObserving = observeSize(container, ({ width, height }) => {
        const unit = Math.floor(Math.min(width / (w + 1), height / (h + 1), 52));
        board.setAttribute('width', unit * (w + 1));
        board.setAttribute('height', unit * (h + 1));
    });

    const tent = (cell, error) => {
        const x = xOf(cell) + 0.5;
        const y = yOf(cell) + 0.5;
        const group = svg('g');
        group.append(svg('path', { class: `tent${error ? ' error' : ''}`, d: `M${x} ${y - 0.32} L${x + 0.34} ${y + 0.28} L${x - 0.34} ${y + 0.28} Z`, 'vector-effect': 'non-scaling-stroke' }));
        group.append(svg('path', { class: 'door', d: `M${x} ${y - 0.02} L${x + 0.11} ${y + 0.28} L${x - 0.11} ${y + 0.28} Z` }));
        return group;
    };
    const tuft = (cell) => {
        const x = xOf(cell) + 0.5;
        const y = yOf(cell) + 0.62;
        return svg('path', { class: 'tuft', d: `M${x - 0.12} ${y} l-0.05 -0.14 M${x} ${y} l0 -0.18 M${x + 0.12} ${y} l0.05 -0.14`, 'vector-effect': 'non-scaling-stroke' });
    };

    const paint = () => {
        const shown = state.cells.slice();
        if (stroke?.moved) stroke.cells.forEach(cell => { if (shown[cell] !== TENT) shown[cell] = stroke.value; });
        const errors = decoration.errors ?? [];
        const errorCells = new Set(errors.filter(Number.isInteger));
        const errorLines = new Set(errors.filter(e => e && typeof e === 'object').map(e => `${e.kind}:${e.index}`));
        const preview = new Set(stroke?.moved ? stroke.cells : []);
        cellRects.forEach((rect, i) => {
            rect.classList.toggle('grass', shown[i] === GRASS);
            rect.classList.toggle('preview', preview.has(i));
        });
        lines.forEach((line, k) => {
            const count = line.cells.filter(cell => shown[cell] === TENT).length;
            clues[k].classList.toggle('done', count === line.need);
            clues[k].classList.toggle('error', errorLines.has(`${line.kind}:${line.index}`));
        });
        pieceLayer.replaceChildren(...shown.map((value, cell) => {
            if (isTree[cell]) return null;
            if (value === TENT) return tent(cell, errorCells.has(cell));
            return value === GRASS ? tuft(cell) : null;
        }).filter(Boolean));
        const highlight = new Set(decoration.highlight ?? []);
        marks.forEach((mark, i) => mark.classList.toggle('recommended', highlight.has(i)));
        root.classList.toggle('solved', Boolean(decoration.solved));
    };

    // 押した位置のマス（数字の欄と盤面の外は -1）
    const cellOf = (event) => {
        const rect = board.getBoundingClientRect();
        const unit = rect.width / (w + 1);
        const inner = { left: rect.left + unit, top: rect.top + rect.height / (h + 1), width: unit * w, height: (rect.height / (h + 1)) * h };
        return cellAt(inner, w, h, event.clientX, event.clientY);
    };

    board.addEventListener('pointerdown', (event) => {
        if (readOnly || decoration.solved || event.button > 0) return;
        const cell = cellOf(event);
        if (cell < 0 || isTree[cell]) return;
        event.preventDefault();
        board.setPointerCapture?.(event.pointerId);
        stroke = { start: cell, cells: [cell], value: state.cells[cell] === GRASS ? EMPTY : GRASS, moved: false };
    });
    board.addEventListener('pointermove', (event) => {
        if (!stroke) return;
        const cell = cellOf(event);
        if (cell < 0 || isTree[cell] || stroke.cells.includes(cell)) return;
        stroke.moved = true;
        stroke.cells.push(cell);
        paint();
    });
    const finish = () => {
        if (!stroke) return;
        const { start, moved, value } = stroke;
        // なぞったときは、テントのマスは変えない
        const cells = moved ? stroke.cells.filter(cell => state.cells[cell] !== TENT) : [start];
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
