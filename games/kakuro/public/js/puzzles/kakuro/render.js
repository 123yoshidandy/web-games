/**
 * カックロの画面
 * 白いマスを押して選び、下の数字のボタン（キーボードの数字でもよい）で入れる。「メモ」にすると、候補の数字を小さく書く
 * 黒いマスには斜線を引き、右上によこの和、左下にたての和を書く。選んだマスのよこ・たての続きを薄く色付けし、和が合った続きの数字は薄くする
 * ヒントで光ったマスは、そのまま選ぶ
 */

import { injectStyle, el, svg, observeSize, cellAt } from '../common/dom.js';
import { layout } from './logic.js';

const CSS = `
.kkr { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 100%; }
.kkr svg { display: block; touch-action: none; cursor: pointer; }
.kkr .white { fill: var(--cell-bg); }
.kkr .white.peer { fill: var(--clue-band); }
.kkr .white.selected { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 3; }
.kkr .white.recommended { fill: var(--hint-fill); stroke: var(--hint); stroke-width: 3; }
.kkr .black { fill: var(--ink-soft); }
.kkr .slash { stroke: var(--cell-bg); stroke-opacity: .55; stroke-width: 1; }
.kkr .grid { stroke: var(--ink); stroke-width: 1; fill: none; }
.kkr .frame { fill: none; stroke: var(--ink); stroke-width: 2.5; }
.kkr text { font-variant-numeric: tabular-nums; pointer-events: none; }
.kkr .sum { fill: var(--cell-bg); font-weight: 700; }
.kkr .sum.done { fill-opacity: .45; }
.kkr .sum.active { fill: #fff; }
.kkr .value { fill: var(--accent-strong); font-weight: 600; text-anchor: middle; dominant-baseline: central; }
.kkr .value.error { fill: var(--error); }
.kkr .note { fill: var(--ink-soft); text-anchor: middle; dominant-baseline: central; }
.kkr.solved .frame { stroke: var(--accent-strong); }
.kkr.solved .value { fill: var(--ink); }
.kkr-pad { display: flex; flex-direction: column; gap: 6px; }
.kkr-pad .row { display: flex; gap: 5px; }
.kkr-pad button { flex: 1 1 0; min-width: 0; min-height: 44px; padding: 0; border-radius: 10px; border: 1.5px solid var(--line); background: var(--panel, var(--cell-bg)); color: var(--ink); }
.kkr-pad .digit { font-size: 22px; font-weight: 700; font-variant-numeric: tabular-nums; }
.kkr-pad .tool { font-size: 15px; font-weight: 700; }
.kkr-pad .tool[aria-pressed="true"] { background: var(--accent); border-color: var(--accent-strong); color: #fff; }
.kkr-pad.memo .digit { color: var(--accent-strong); font-size: 17px; }
.kkr-pad button:active { background: var(--accent-soft); }
`;

const PAD_GAP = 10;
const PAD_ROW = 44;

export function render(container, puzzle, initial, { onInput = () => {}, readOnly = false } = {}) {
    injectStyle('kakuro', CSS);
    const { width: w, height: h, clues } = puzzle;
    const { runs, cellRuns } = layout(puzzle);
    let state = initial;
    let decoration = {};
    let selected = -1;
    let memo = false;
    let lastHighlight = '';

    const root = el('div', { class: 'kkr' });
    const board = svg('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': '盤面' });
    root.append(board);

    // 動かない部分：白いマス（選択やヒントの色）・黒いマスと斜線・罫線
    const cellRects = clues.map((clue, i) => {
        const x = i % w;
        const y = Math.floor(i / w);
        const rect = svg('rect', { class: clue ? 'black' : 'white', x, y, width: 1, height: 1, 'vector-effect': 'non-scaling-stroke', 'data-cell': i });
        board.append(rect);
        if (clue && (clue[0] || clue[1])) board.append(svg('line', { class: 'slash', x1: x, y1: y, x2: x + 1, y2: y + 1, 'vector-effect': 'non-scaling-stroke' }));
        return rect;
    });
    for (let k = 1; k < w; k++) board.append(svg('line', { class: 'grid', x1: k, y1: 0, x2: k, y2: h, 'vector-effect': 'non-scaling-stroke' }));
    for (let k = 1; k < h; k++) board.append(svg('line', { class: 'grid', x1: 0, y1: k, x2: w, y2: k, 'vector-effect': 'non-scaling-stroke' }));
    board.append(svg('rect', { class: 'frame', x: 0, y: 0, width: w, height: h, 'vector-effect': 'non-scaling-stroke' }));

    // 和の数字（run ごとに1つ。よこは右上、たては左下）
    const sumTexts = runs.map(run => {
        const x = run.clue % w;
        const y = Math.floor(run.clue / w);
        const text = run.dir === 'right'
            ? svg('text', { class: 'sum', x: x + 0.93, y: y + 0.36, 'font-size': 0.34, 'text-anchor': 'end' })
            : svg('text', { class: 'sum', x: x + 0.07, y: y + 0.9, 'font-size': 0.34, 'text-anchor': 'start' });
        text.textContent = String(run.sum);
        board.append(text);
        return text;
    });
    const textLayer = svg('g');
    board.append(textLayer);

    // 数字のボタン（1 行に 1〜9）と、「メモ」「消す」
    const digitButtons = Array.from({ length: 9 }, (_, i) => el('button', { type: 'button', class: 'digit', 'data-digit': i + 1, 'aria-label': `${i + 1} を入れる` }, [String(i + 1)]));
    const memoButton = el('button', { type: 'button', class: 'tool', 'aria-pressed': 'false', 'data-tool': 'memo' }, ['メモ']);
    const eraseButton = el('button', { type: 'button', class: 'tool', 'data-tool': 'erase' }, ['消す']);
    const pad = el('div', { class: 'kkr-pad' }, [el('div', { class: 'row' }, digitButtons), el('div', { class: 'row' }, [memoButton, eraseButton])]);
    if (!readOnly) root.append(pad);
    container.replaceChildren(root);

    const stopObserving = observeSize(container, ({ width, height }) => {
        const padHeight = readOnly ? 0 : PAD_ROW * 2 + 6 + PAD_GAP;
        const cell = Math.max(16, Math.floor(Math.min((width - 4) / w, (height - padHeight - 4) / h, 60)));
        board.setAttribute('width', cell * w);
        board.setAttribute('height', cell * h);
        pad.style.width = `${Math.min(width - 4, Math.max(cell * w, 300))}px`;
    });

    const paint = () => {
        const errors = new Set(decoration.errors ?? []);
        const lit = new Set(decoration.highlight ?? []);
        const activeRuns = new Set(selected >= 0 ? cellRuns[selected].filter(r => r >= 0) : []);
        const peers = new Set([...activeRuns].flatMap(r => runs[r].cells));
        cellRects.forEach((rect, i) => {
            if (clues[i]) return;
            rect.classList.toggle('recommended', lit.has(i));
            rect.classList.toggle('selected', i === selected && !lit.has(i));
            rect.classList.toggle('peer', peers.has(i) && i !== selected);
        });
        runs.forEach((run, r) => {
            const digits = run.cells.map(cell => state.values[cell]);
            const done = digits.every(Boolean) && new Set(digits).size === digits.length && digits.reduce((a, b) => a + b, 0) === run.sum;
            sumTexts[r].classList.toggle('done', done);
            sumTexts[r].classList.toggle('active', activeRuns.has(r));
        });
        const texts = [];
        clues.forEach((clue, i) => {
            if (clue) return;
            const x = (i % w) + 0.5;
            const y = Math.floor(i / w) + 0.5;
            if (state.values[i]) {
                const text = svg('text', { class: `value${errors.has(i) ? ' error' : ''}`, x, y: y + 0.03, 'font-size': 0.62 });
                text.textContent = String(state.values[i]);
                texts.push(text);
                return;
            }
            const notes = state.notes[i];
            if (!notes) return;
            for (let d = 1; d <= 9; d++) {
                if (!(notes & (1 << d))) continue;
                const k = d - 1;
                const text = svg('text', { class: 'note', x: (i % w) + ((k % 3) + 0.5) / 3, y: Math.floor(i / w) + (Math.floor(k / 3) + 0.5) / 3 + 0.02, 'font-size': 0.27 });
                text.textContent = String(d);
                texts.push(text);
            }
        });
        textLayer.replaceChildren(...texts);
        pad.classList.toggle('memo', memo);
        root.classList.toggle('solved', Boolean(decoration.solved));
    };

    const enter = (digit) => {
        if (readOnly || decoration.solved || selected < 0 || clues[selected]) return;
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
        const cell = cellAt(board.getBoundingClientRect(), w, h, event.clientX, event.clientY);
        if (cell < 0 || clues[cell]) return;
        event.preventDefault();
        select(cell);
    });
    digitButtons.forEach((button, i) => button.addEventListener('click', () => enter(i + 1)));
    eraseButton.addEventListener('click', () => enter(0));
    memoButton.addEventListener('click', () => setMemo(!memo));

    // 矢印の向きに、黒いマスを飛ばして次の白いマスへ
    const move = (dx, dy) => {
        if (selected < 0) {
            const first = clues.findIndex(clue => !clue);
            if (first >= 0) select(first);
            return;
        }
        let x = selected % w;
        let y = Math.floor(selected / w);
        for (;;) {
            x += dx;
            y += dy;
            if (x < 0 || y < 0 || x >= w || y >= h) return;
            if (!clues[y * w + x]) return select(y * w + x);
        }
    };

    // キーボード：数字で入れる・0 や Backspace で消す・矢印で動く・M でメモの切り替え
    const onKey = (event) => {
        if (event.ctrlKey || event.metaKey || event.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(event.target?.tagName ?? '')) return;
        if (!root.isConnected || decoration.solved) return;
        const moves = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
        if (/^[1-9]$/.test(event.key)) enter(Number(event.key));
        else if (['0', 'Backspace', 'Delete'].includes(event.key)) enter(0);
        else if (event.key === 'm' || event.key === 'M') setMemo(!memo);
        else if (moves[event.key]) move(...moves[event.key]);
        else return;
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
