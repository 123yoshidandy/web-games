/**
 * お絵かきロジックの画面
 * マスを押すかなぞると、下の「塗る」「×」で選んだ印を付ける（なぞりは最初に動いた向きの行か列に沿う）
 * 最初のマスがすでに同じ印なら、なぞったマスの印を消す。指を離したときに1つの入力として送る
 */

import { injectStyle, el, observeSize, cellAt } from '../common/dom.js';
import { runsOf, FILLED, CROSS, EMPTY } from './logic.js';

const CSS = `
.nono { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 100%; }
.nono-board { display: grid; grid-template-columns: var(--row-clue-w) calc(var(--cell) * var(--w) + 4px); grid-template-rows: var(--col-clue-h) calc(var(--cell) * var(--h) + 4px); font-size: var(--clue-font); line-height: 1; }
.nono-cols { grid-column: 2; grid-row: 1; padding: 0 2px; display: grid; grid-template-columns: repeat(var(--w), var(--cell)); align-items: end; }
.nono-rows { grid-column: 1; grid-row: 2; padding: 2px 0; display: grid; grid-template-rows: repeat(var(--h), var(--cell)); }
.nono-clue { display: flex; gap: .3em; color: var(--ink); font-weight: 700; font-variant-numeric: tabular-nums; }
.nono-cols .nono-clue { flex-direction: column; align-items: center; justify-content: end; padding-bottom: .3em; gap: .15em; }
.nono-rows .nono-clue { justify-content: end; align-items: center; padding-right: .4em; }
.nono-clue:nth-child(odd) { background: var(--clue-band); }
.nono-clue.done { color: var(--ink-faint); }
.nono-clue.error { color: var(--error); }
.nono-cells { grid-column: 2; grid-row: 2; display: grid; grid-template-columns: repeat(var(--w), var(--cell)); grid-template-rows: repeat(var(--h), var(--cell));
  box-sizing: content-box; border: 2px solid var(--ink); touch-action: none; background: var(--cell-bg); cursor: pointer; }
.nono-cell { border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); position: relative; }
.nono-cell.edge-r { border-right: 2px solid var(--ink-soft); }
.nono-cell.edge-b { border-bottom: 2px solid var(--ink-soft); }
.nono-cell.last-c { border-right: none; }
.nono-cell.last-r { border-bottom: none; }
.nono-cell.filled { background: var(--ink); }
.nono-cell.cross::before, .nono-cell.cross::after { content: ''; position: absolute; left: 22%; right: 22%; top: 50%; height: 1.5px; background: var(--ink-soft); }
.nono-cell.cross::before { transform: rotate(45deg); }
.nono-cell.cross::after { transform: rotate(-45deg); }
.nono-cell.preview { box-shadow: inset 0 0 0 2px var(--accent); }
.nono-cell.recommended { box-shadow: inset 0 0 0 3px var(--hint); }
.nono.solved .nono-cell { border-color: transparent; }
.nono.solved .nono-cell.filled { background: var(--accent-strong); }
.nono.solved .nono-cell.cross::before, .nono.solved .nono-cell.cross::after { display: none; }
.nono.solved .nono-cells { border-color: var(--accent-strong); }
.nono-tools { display: flex; gap: 8px; }
.nono-tools button { min-width: 88px; min-height: 40px; }
.nono-tools .tool-icon { display: inline-block; width: 14px; height: 14px; margin-right: 6px; vertical-align: -2px; }
.nono-tools .tool-fill { background: currentColor; border-radius: 2px; }
`;

const TOOLS_HEIGHT = 50; // 「塗る」「×」の行と、その上の隙間

export function render(container, puzzle, initial, { onInput = () => {}, readOnly = false } = {}) {
    injectStyle('nonogram', CSS);
    const { width: w, height: h } = puzzle;
    let state = initial;
    let decoration = {};
    let mode = FILLED;
    let stroke = null; // なぞっている途中 { start, cells, value }

    const colClues = puzzle.cols.map(clue => el('div', { class: 'nono-clue' }, (clue.length ? clue : [0]).map(n => el('span', { text: String(n) }))));
    const rowClues = puzzle.rows.map(clue => el('div', { class: 'nono-clue' }, (clue.length ? clue : [0]).map(n => el('span', { text: String(n) }))));
    const cells = Array.from({ length: w * h }, (_, i) => {
        const r = Math.floor(i / w);
        const c = i % w;
        const classes = ['nono-cell'];
        if ((c + 1) % 5 === 0 && c < w - 1) classes.push('edge-r');
        if ((r + 1) % 5 === 0 && r < h - 1) classes.push('edge-b');
        if (c === w - 1) classes.push('last-c');
        if (r === h - 1) classes.push('last-r');
        return el('div', { class: classes.join(' '), 'data-cell': i });
    });
    const cellsEl = el('div', { class: 'nono-cells', role: 'grid', 'aria-label': '盤面' }, cells);
    const board = el('div', { class: 'nono-board' }, [
        el('div'),
        el('div', { class: 'nono-cols' }, colClues),
        el('div', { class: 'nono-rows' }, rowClues),
        cellsEl
    ]);
    const fillButton = el('button', { type: 'button', class: 'tool', 'aria-pressed': 'true', 'data-tool': 'fill' }, [el('span', { class: 'tool-icon tool-fill' }), '塗る']);
    const crossButton = el('button', { type: 'button', class: 'tool', 'aria-pressed': 'false', 'data-tool': 'cross' }, ['× を付ける']);
    const tools = el('div', { class: 'nono-tools' }, [fillButton, crossButton]);
    const root = el('div', { class: 'nono' }, [board, tools]);
    root.style.setProperty('--w', w);
    root.style.setProperty('--h', h);
    container.replaceChildren(root);

    const setMode = (next) => {
        mode = next;
        fillButton.setAttribute('aria-pressed', String(mode === FILLED));
        crossButton.setAttribute('aria-pressed', String(mode === CROSS));
    };
    fillButton.addEventListener('click', () => setMode(FILLED));
    crossButton.addEventListener('click', () => setMode(CROSS));

    // 入れ物に収まる大きさ（数字の欄の幅は、いちばん長い数字の並びに合わせる）
    const maxRowChars = Math.max(1, ...puzzle.rows.map(clue => (clue.length ? clue : [0]).reduce((sum, n) => sum + String(n).length + 0.6, 0.4)));
    const maxColCount = Math.max(1, ...puzzle.cols.map(clue => Math.max(1, clue.length)));
    const stopObserving = observeSize(container, ({ width, height }) => {
        const availableH = height - TOOLS_HEIGHT;
        let cell = 40;
        let font = 14;
        for (let i = 0; i < 3; i++) {
            const rowClueW = maxRowChars * font * 0.62;
            const colClueH = maxColCount * font * 1.15 + font * 0.4;
            cell = Math.floor(Math.min((width - rowClueW - 4) / w, (availableH - colClueH - 4) / h, 44));
            font = Math.max(9, Math.min(16, cell * 0.56));
        }
        cell = Math.max(12, cell);
        root.style.setProperty('--cell', `${cell}px`);
        root.style.setProperty('--clue-font', `${font}px`);
        root.style.setProperty('--row-clue-w', `${Math.ceil(maxRowChars * font * 0.62)}px`);
        root.style.setProperty('--col-clue-h', `${Math.ceil(maxColCount * font * 1.15 + font * 0.4)}px`);
    });

    const paint = () => {
        const shown = state.cells.slice();
        if (stroke) stroke.cells.forEach(cell => { shown[cell] = stroke.value; });
        const highlight = new Set(decoration.highlight ?? []);
        const preview = new Set(stroke?.cells ?? []);
        cells.forEach((node, i) => {
            node.classList.toggle('filled', shown[i] === FILLED);
            node.classList.toggle('cross', shown[i] === CROSS);
            node.classList.toggle('preview', preview.has(i));
            node.classList.toggle('recommended', highlight.has(i));
        });
        const errors = new Set((decoration.errors ?? []).map(e => `${e.kind}:${e.index}`));
        const lineDone = (indexes, clue) => {
            const runs = runsOf(indexes.map(i => (state.cells[i] === FILLED ? 1 : 0)));
            return runs.length === clue.length && runs.every((run, k) => run === clue[k]);
        };
        rowClues.forEach((node, r) => {
            const indexes = Array.from({ length: w }, (_, c) => r * w + c);
            node.classList.toggle('done', lineDone(indexes, puzzle.rows[r]));
            node.classList.toggle('error', errors.has(`row:${r}`));
        });
        colClues.forEach((node, c) => {
            const indexes = Array.from({ length: h }, (_, r) => r * w + c);
            node.classList.toggle('done', lineDone(indexes, puzzle.cols[c]));
            node.classList.toggle('error', errors.has(`col:${c}`));
        });
        root.classList.toggle('solved', Boolean(decoration.solved));
    };

    // なぞり：最初に動いた向き（行か列）に沿って、始めのマスから今のマスまで
    const strokeCells = (start, current) => {
        const sr = Math.floor(start / w);
        const sc = start % w;
        const cr = Math.floor(current / w);
        const cc = current % w;
        if (!stroke.axis && current !== start) stroke.axis = Math.abs(cr - sr) > Math.abs(cc - sc) ? 'col' : 'row';
        if (stroke.axis === 'col') {
            const step = cr >= sr ? 1 : -1;
            return Array.from({ length: Math.abs(cr - sr) + 1 }, (_, k) => (sr + k * step) * w + sc);
        }
        const step = cc >= sc ? 1 : -1;
        return Array.from({ length: Math.abs(cc - sc) + 1 }, (_, k) => sr * w + sc + k * step);
    };

    const onDown = (event) => {
        if (readOnly || decoration.solved || event.button > 0) return;
        const cell = cellAt(cellsEl.getBoundingClientRect(), w, h, event.clientX, event.clientY);
        if (cell < 0) return;
        event.preventDefault();
        cellsEl.setPointerCapture?.(event.pointerId);
        stroke = { start: cell, axis: null, cells: [cell], value: state.cells[cell] === mode ? EMPTY : mode };
        paint();
    };
    const onMove = (event) => {
        if (!stroke) return;
        const rect = cellsEl.getBoundingClientRect();
        // 盤面の外に出ても、端のマスまでとみなす
        const x = Math.min(rect.right - 1, Math.max(rect.left + 1, event.clientX));
        const y = Math.min(rect.bottom - 1, Math.max(rect.top + 1, event.clientY));
        const cell = cellAt(rect, w, h, x, y);
        if (cell < 0) return;
        const next = strokeCells(stroke.start, cell);
        if (next.length !== stroke.cells.length || next.some((c, i) => c !== stroke.cells[i])) {
            stroke.cells = next;
            paint();
        }
    };
    const onUp = () => {
        if (!stroke) return;
        const { cells: strokeList, value } = stroke;
        stroke = null;
        paint();
        onInput({ cells: strokeList, value });
    };
    cellsEl.addEventListener('pointerdown', onDown);
    cellsEl.addEventListener('pointermove', onMove);
    cellsEl.addEventListener('pointerup', onUp);
    cellsEl.addEventListener('pointercancel', onUp);
    if (readOnly) tools.hidden = true;

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
