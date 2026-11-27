/**
 * 数独の画面
 * マスを押して選び、下の数字のボタン（キーボードの数字でもよい）で入れる。「メモ」にすると、候補の数字を小さく書く
 * 選んだマスの行・列・ブロックと、同じ数字を薄く色付けする。ヒントで光ったマスは、そのまま選ぶ
 */

import { injectStyle, el, svg, observeSize, cellAt } from '../common/dom.js';
import { geometry, filledGrid } from './logic.js';

const CSS = `
.sdk { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 100%; }
.sdk svg { display: block; touch-action: none; cursor: pointer; }
.sdk .bg { fill: var(--cell-bg); }
.sdk .cell { fill: transparent; }
.sdk .cell.peer { fill: var(--clue-band); }
.sdk .cell.same { fill: var(--accent-soft); }
.sdk .cell.selected { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 3; }
.sdk .cell.recommended { fill: var(--hint-fill); stroke: var(--hint); stroke-width: 3; }
.sdk .thin { stroke: var(--line); stroke-width: 1; }
.sdk .thick { stroke: var(--ink); stroke-width: 2; }
.sdk .frame { fill: none; stroke: var(--ink); stroke-width: 2.5; }
.sdk text { text-anchor: middle; dominant-baseline: central; font-variant-numeric: tabular-nums; pointer-events: none; }
.sdk .given { fill: var(--ink); font-weight: 800; }
.sdk .value { fill: var(--accent-strong); font-weight: 600; }
.sdk .value.error { fill: var(--error); }
.sdk .note { fill: var(--ink-soft); }
.sdk.solved .frame { stroke: var(--accent-strong); }
.sdk.solved .value { fill: var(--ink); }
.sdk-pad { display: flex; flex-direction: column; gap: 6px; }
.sdk-pad .row { display: flex; gap: 5px; }
.sdk-pad button { flex: 1 1 0; min-width: 0; min-height: 44px; padding: 0; border-radius: 10px; border: 1.5px solid var(--line); background: var(--panel, var(--cell-bg)); color: var(--ink); }
.sdk-pad .digit { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.sdk-pad .digit.done { color: var(--ink-faint); }
.sdk-pad .tool { font-size: 15px; font-weight: 700; }
.sdk-pad .tool[aria-pressed="true"] { background: var(--accent); border-color: var(--accent-strong); color: #fff; }
.sdk-pad.memo .digit { color: var(--accent-strong); font-size: 17px; }
.sdk-pad button:active { background: var(--accent-soft); }
`;

const PAD_GAP = 10;
const PAD_ROW = 44;

export function render(container, puzzle, initial, { onInput = () => {}, readOnly = false } = {}) {
    injectStyle('sudoku', CSS);
    const { size, boxWidth, boxHeight, givens } = puzzle;
    const geo = geometry(puzzle);
    const n = size * size;
    const noteCols = Math.ceil(Math.sqrt(size));
    const noteRows = Math.ceil(size / noteCols);
    let state = initial;
    let decoration = {};
    let selected = -1;
    let memo = false;
    let lastHighlight = '';

    const root = el('div', { class: 'sdk' });
    const board = svg('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': '盤面' });
    root.append(board);

    // 動かない部分：背景・マス（選択やヒントの色）・罫線
    board.append(svg('rect', { class: 'bg', x: 0, y: 0, width: size, height: size }));
    const cellRects = Array.from({ length: n }, (_, i) => {
        const rect = svg('rect', { class: 'cell', x: i % size, y: Math.floor(i / size), width: 1, height: 1, 'vector-effect': 'non-scaling-stroke', 'data-cell': i });
        board.append(rect);
        return rect;
    });
    for (let k = 1; k < size; k++) {
        board.append(svg('line', { class: k % boxWidth ? 'thin' : 'thick', x1: k, y1: 0, x2: k, y2: size, 'vector-effect': 'non-scaling-stroke' }));
        board.append(svg('line', { class: k % boxHeight ? 'thin' : 'thick', x1: 0, y1: k, x2: size, y2: k, 'vector-effect': 'non-scaling-stroke' }));
    }
    board.append(svg('rect', { class: 'frame', x: 0, y: 0, width: size, height: size, 'vector-effect': 'non-scaling-stroke' }));
    const textLayer = svg('g');
    board.append(textLayer);

    // 数字のボタン（1 行に全部）と、「メモ」「消す」
    const digitButtons = Array.from({ length: size }, (_, i) => el('button', { type: 'button', class: 'digit', 'data-digit': i + 1, 'aria-label': `${i + 1} を入れる` }, [String(i + 1)]));
    const memoButton = el('button', { type: 'button', class: 'tool', 'aria-pressed': 'false', 'data-tool': 'memo' }, ['メモ']);
    const eraseButton = el('button', { type: 'button', class: 'tool', 'data-tool': 'erase' }, ['消す']);
    const pad = el('div', { class: 'sdk-pad' }, [el('div', { class: 'row' }, digitButtons), el('div', { class: 'row' }, [memoButton, eraseButton])]);
    if (!readOnly) root.append(pad);
    container.replaceChildren(root);

    const stopObserving = observeSize(container, ({ width, height }) => {
        const padHeight = readOnly ? 0 : PAD_ROW * 2 + 6 + PAD_GAP;
        const cell = Math.max(16, Math.floor(Math.min((width - 4) / size, (height - padHeight - 4) / size, 56)));
        board.setAttribute('width', cell * size);
        board.setAttribute('height', cell * size);
        pad.style.width = `${Math.min(width - 4, Math.max(cell * size, 300))}px`;
    });

    const paint = () => {
        const grid = filledGrid(puzzle, state.values);
        const errors = new Set(decoration.errors ?? []);
        const lit = new Set(decoration.highlight ?? []);
        const peers = new Set(selected >= 0 ? geo.peers[selected] : []);
        const sameDigit = selected >= 0 ? grid[selected] : 0;
        cellRects.forEach((rect, i) => {
            rect.classList.toggle('recommended', lit.has(i));
            rect.classList.toggle('selected', i === selected && !lit.has(i));
            rect.classList.toggle('peer', peers.has(i));
            rect.classList.toggle('same', Boolean(sameDigit) && grid[i] === sameDigit && i !== selected);
        });
        const texts = [];
        for (let i = 0; i < n; i++) {
            const x = (i % size) + 0.5;
            const y = Math.floor(i / size) + 0.5;
            if (grid[i]) {
                const text = svg('text', { class: givens[i] ? 'given' : `value${errors.has(i) ? ' error' : ''}`, x, y: y + 0.03, 'font-size': 0.62 });
                text.textContent = String(grid[i]);
                texts.push(text);
                continue;
            }
            const notes = state.notes[i];
            if (!notes) continue;
            for (let d = 1; d <= size; d++) {
                if (!(notes & (1 << d))) continue;
                const k = d - 1;
                const text = svg('text', {
                    class: 'note',
                    x: (i % size) + (((k % noteCols) + 0.5) / noteCols),
                    y: Math.floor(i / size) + ((Math.floor(k / noteCols) + 0.5) / noteRows) + 0.02,
                    'font-size': 0.27
                });
                text.textContent = String(d);
                texts.push(text);
            }
        }
        textLayer.replaceChildren(...texts);
        // 数字を全部置き終えたボタンは薄くする
        const counts = new Array(size + 1).fill(0);
        grid.forEach(d => { counts[d]++; });
        digitButtons.forEach((button, i) => button.classList.toggle('done', counts[i + 1] >= size));
        pad.classList.toggle('memo', memo);
        root.classList.toggle('solved', Boolean(decoration.solved));
    };

    const enter = (digit) => {
        if (readOnly || decoration.solved || selected < 0 || givens[selected]) return;
        if (digit && memo && !state.values[selected]) onInput({ type: 'note', cell: selected, value: digit });
        else if (digit && state.values[selected] === digit) onInput({ type: 'set', cell: selected, value: 0 });
        else onInput({ type: 'set', cell: selected, value: digit });
    };
    const select = (cell) => {
        selected = cell;
        paint();
    };
    const setMemo = (on) => {
        memo = on;
        memoButton.setAttribute('aria-pressed', String(memo));
        paint();
    };

    board.addEventListener('pointerdown', (event) => {
        if (readOnly || event.button > 0) return;
        const cell = cellAt(board.getBoundingClientRect(), size, size, event.clientX, event.clientY);
        if (cell < 0) return;
        event.preventDefault();
        select(cell);
    });
    digitButtons.forEach((button, i) => button.addEventListener('click', () => enter(i + 1)));
    eraseButton.addEventListener('click', () => enter(0));
    memoButton.addEventListener('click', () => setMemo(!memo));

    // キーボード：数字で入れる・0 や Backspace で消す・矢印で動く・M でメモの切り替え
    const onKey = (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? '')) return;
        if (!root.isConnected || decoration.solved) return;
        const moves = { ArrowUp: -size, ArrowDown: size, ArrowLeft: -1, ArrowRight: 1 };
        if (/^[1-9]$/.test(event.key) && Number(event.key) <= size) enter(Number(event.key));
        else if (['0', 'Backspace', 'Delete'].includes(event.key)) enter(0);
        else if (event.key === 'm' || event.key === 'M') setMemo(!memo);
        else if (moves[event.key]) {
            if (selected < 0) select(0);
            else {
                const next = selected + moves[event.key];
                const sameRow = Math.abs(moves[event.key]) === 1 ? Math.floor(next / size) === Math.floor(selected / size) : true;
                if (next >= 0 && next < n && sameRow) select(next);
            }
        } else return;
        event.preventDefault();
    };
    if (!readOnly) document.addEventListener('keydown', onKey);

    paint();
    return {
        update(next, options = {}) {
            state = next;
            decoration = options;
            // ヒントで光ったマスが1つなら、そのマスを選んでおく（すぐ数字を入れられるように）
            const highlight = (options.highlight ?? []).join(',');
            if (highlight !== lastHighlight && options.highlight?.length === 1) selected = options.highlight[0];
            lastHighlight = highlight;
            paint();
        },
        destroy() {
            stopObserving();
            document.removeEventListener('keydown', onKey);
            root.remove();
        }
    };
}
