/**
 * ぬりかべの画面
 * マスを押すかなぞると、下の「塗る」「・」で選んだ印を付ける（なぞったマスをまとめて。数字のマスは飛ばす）
 * 最初のマスがすでに同じ印なら、なぞったマスの印を消す。指を離したときに1つの入力として送る
 * 大きさどおりに閉じた島の数字は薄くする
 */

import { injectStyle, el, observeSize, cellAt } from '../common/dom.js';
import { neighborsOf, WALL, DOT, EMPTY } from './logic.js';

const CSS = `
.nrk { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 100%; }
.nrk-cells { display: grid; grid-template-columns: repeat(var(--w), var(--cell)); grid-template-rows: repeat(var(--h), var(--cell));
  box-sizing: content-box; border: 2px solid var(--ink); touch-action: none; background: var(--cell-bg); cursor: pointer; }
.nrk-cell { border-right: 1px solid var(--line); border-bottom: 1px solid var(--line); position: relative; display: flex; align-items: center; justify-content: center;
  font-size: calc(var(--cell) * .58); font-weight: 800; color: var(--ink); font-variant-numeric: tabular-nums; line-height: 1; }
.nrk-cell.last-c { border-right: none; }
.nrk-cell.last-r { border-bottom: none; }
.nrk-cell.wall { background: var(--ink-soft); }
.nrk-cell.dot::after { content: ''; width: 22%; height: 22%; border-radius: 50%; background: var(--accent); }
.nrk-cell.done { color: var(--ink-faint); }
.nrk-cell.error { color: var(--error); }
.nrk-cell.error.wall { background: var(--error); }
.nrk-cell.error.dot::after { background: var(--error); }
.nrk-cell.preview { box-shadow: inset 0 0 0 2px var(--accent); }
.nrk-cell.recommended { box-shadow: inset 0 0 0 3px var(--hint); }
.nrk-cell.wall.recommended { box-shadow: inset 0 0 0 3px var(--hint), inset 0 0 0 5px var(--cell-bg); }
.nrk.solved .nrk-cells { border-color: var(--accent-strong); }
.nrk.solved .nrk-cell { border-color: transparent; }
.nrk.solved .nrk-cell.wall { background: var(--accent-strong); }
.nrk.solved .nrk-cell.dot::after { display: none; }
.nrk-tools { display: flex; gap: 8px; }
.nrk-tools button { min-width: 88px; min-height: 40px; }
.nrk-tools .tool-icon { display: inline-block; width: 14px; height: 14px; margin-right: 6px; vertical-align: -2px; }
.nrk-tools .tool-wall { background: currentColor; border-radius: 2px; }
.nrk-tools .tool-dot { width: 8px; height: 8px; margin: 0 9px 1px 3px; border-radius: 50%; background: currentColor; vertical-align: 1px; }
`;

const TOOLS_HEIGHT = 50; // 「塗る」「・」の行と、その上の隙間

export function render(container, puzzle, initial, { onInput = () => {}, readOnly = false } = {}) {
    injectStyle('nurikabe', CSS);
    const { width: w, height: h, numbers } = puzzle;
    const nb = neighborsOf(w, h);
    let state = initial;
    let decoration = {};
    let mode = WALL;
    let stroke = null; // なぞっている途中 { cells, value }

    const cells = numbers.map((n, i) => {
        const classes = ['nrk-cell'];
        if (i % w === w - 1) classes.push('last-c');
        if (Math.floor(i / w) === h - 1) classes.push('last-r');
        return el('div', { class: classes.join(' '), 'data-cell': i, text: n ? String(n) : '' });
    });
    const cellsEl = el('div', { class: 'nrk-cells', role: 'grid', 'aria-label': '盤面' }, cells);
    const wallButton = el('button', { type: 'button', class: 'tool', 'aria-pressed': 'true', 'data-tool': 'wall' }, [el('span', { class: 'tool-icon tool-wall' }), '塗る']);
    const dotButton = el('button', { type: 'button', class: 'tool', 'aria-pressed': 'false', 'data-tool': 'dot' }, [el('span', { class: 'tool-icon tool-dot' }), '・を付ける']);
    const tools = el('div', { class: 'nrk-tools' }, [wallButton, dotButton]);
    const root = el('div', { class: 'nrk' }, [cellsEl, tools]);
    root.style.setProperty('--w', w);
    root.style.setProperty('--h', h);
    container.replaceChildren(root);

    const setMode = (next) => {
        mode = next;
        wallButton.setAttribute('aria-pressed', String(mode === WALL));
        dotButton.setAttribute('aria-pressed', String(mode === DOT));
    };
    wallButton.addEventListener('click', () => setMode(WALL));
    dotButton.addEventListener('click', () => setMode(DOT));

    const stopObserving = observeSize(container, ({ width, height }) => {
        const cell = Math.max(16, Math.floor(Math.min((width - 8) / w, (height - TOOLS_HEIGHT - 8) / h, 56)));
        root.style.setProperty('--cell', `${cell}px`);
    });

    // 大きさどおりに閉じた島（数字1つ・「・」と数字だけで大きさがそろい、まわりがすべて壁か盤の外）の数字のマス
    const doneNumbers = (shown) => {
        const done = new Set();
        numbers.forEach((n, start) => {
            if (!n) return;
            const seen = new Set([start]);
            const stack = [start];
            let closed = true;
            let count = 0;
            while (stack.length && closed) {
                const cell = stack.pop();
                count++;
                for (const next of nb[cell]) {
                    if (seen.has(next)) continue;
                    if (numbers[next] || shown[next] === DOT) {
                        seen.add(next);
                        stack.push(next);
                    } else if (shown[next] !== WALL) closed = false;
                }
            }
            if (closed && count === n && [...seen].filter(cell => numbers[cell]).length === 1) done.add(start);
        });
        return done;
    };

    const paint = () => {
        const shown = state.cells.slice();
        if (stroke) stroke.cells.forEach(cell => { shown[cell] = stroke.value; });
        const highlight = new Set(decoration.highlight ?? []);
        const errors = new Set(decoration.errors ?? []);
        const preview = new Set(stroke?.cells ?? []);
        const done = doneNumbers(shown);
        cells.forEach((node, i) => {
            node.classList.toggle('wall', !numbers[i] && shown[i] === WALL);
            node.classList.toggle('dot', !numbers[i] && shown[i] === DOT);
            node.classList.toggle('done', done.has(i));
            node.classList.toggle('error', errors.has(i));
            node.classList.toggle('preview', preview.has(i));
            node.classList.toggle('recommended', highlight.has(i));
        });
        root.classList.toggle('solved', Boolean(decoration.solved));
    };

    const cellFrom = (event, clamp) => {
        const rect = cellsEl.getBoundingClientRect();
        const x = clamp ? Math.min(rect.right - 1, Math.max(rect.left + 1, event.clientX)) : event.clientX;
        const y = clamp ? Math.min(rect.bottom - 1, Math.max(rect.top + 1, event.clientY)) : event.clientY;
        return cellAt(rect, w, h, x, y);
    };
    const onDown = (event) => {
        if (readOnly || decoration.solved || event.button > 0) return;
        const cell = cellFrom(event, false);
        if (cell < 0) return;
        event.preventDefault();
        cellsEl.setPointerCapture?.(event.pointerId);
        stroke = { cells: numbers[cell] ? [] : [cell], value: !numbers[cell] && state.cells[cell] === mode ? EMPTY : mode };
        paint();
    };
    const onMove = (event) => {
        if (!stroke) return;
        const cell = cellFrom(event, true);
        if (cell < 0 || numbers[cell] || stroke.cells.includes(cell)) return;
        stroke.cells.push(cell);
        paint();
    };
    const onUp = () => {
        if (!stroke) return;
        const { cells: strokeList, value } = stroke;
        stroke = null;
        paint();
        if (strokeList.length) onInput({ cells: strokeList, value });
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
