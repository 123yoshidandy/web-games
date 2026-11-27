/**
 * ナンバーリンクの画面
 * 数字からなぞって線を引く。線の途中（か端）からなぞると、そこまでを残して引き直す。数字を押して離すと、その線を消す
 * マスが変わるたびに、その線を引き直す入力（{ type: 'path', pair, cells }）を送る
 */

import { injectStyle, el, svg, observeSize, cellAt } from '../common/dom.js';
import { endGrid, isAdjacent } from './logic.js';

const CSS = `
.nlink { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.nlink svg { display: block; touch-action: none; cursor: pointer; }
.nlink .bg { fill: var(--cell-bg); stroke: var(--ink); stroke-width: 2; }
.nlink .grid { stroke: var(--line); stroke-width: 1; }
.nlink .cell-mark { fill: transparent; }
.nlink .cell-mark.recommended { fill: var(--hint-fill); stroke: var(--hint); stroke-width: 2; }
.nlink .path { fill: none; stroke-linecap: round; stroke-linejoin: round; }
.nlink .path.error { stroke-dasharray: 2 6; }
.nlink .hint-path { fill: none; stroke: var(--hint); stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 1 7; opacity: .9; }
.nlink .end circle { stroke: var(--paper); stroke-width: 2; }
.nlink .end text { fill: #fff; font-weight: 800; text-anchor: middle; dominant-baseline: central; font-variant-numeric: tabular-nums; pointer-events: none; }
.nlink.solved .bg { stroke: var(--accent-strong); }
`;

// 数字ごとの色（となりの番号どうしが似た色にならない並び）
const COLORS = ['#d9534f', '#2f7bbf', '#3d9a50', '#e0912f', '#8a5cc2', '#1f9e9a', '#c2507f', '#7a8a2a', '#b5651d', '#4d5fd0', '#5a9e7c', '#c94c2e', '#6b6f80', '#a0782b', '#3a8fb7'];
export const colorOf = (pair) => COLORS[pair % COLORS.length];

export function render(container, puzzle, initial, { onInput = () => {}, readOnly = false } = {}) {
    injectStyle('numberlink', CSS);
    const { width: w, height: h, ends } = puzzle;
    const owners = endGrid(puzzle);
    let state = initial;
    let decoration = {};
    let drag = null; // { pair, cells }

    const root = el('div', { class: 'nlink' });
    const board = svg('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': '盤面' });
    root.append(board);
    container.replaceChildren(root);

    const center = (cell) => [(cell % w) + 0.5, Math.floor(cell / w) + 0.5];
    const pointsOf = (cells) => cells.map(cell => center(cell).join(',')).join(' ');

    // 動かない部分：背景・罫線・マスの印（ヒント）
    board.append(svg('rect', { class: 'bg', x: 0, y: 0, width: w, height: h, 'vector-effect': 'non-scaling-stroke' }));
    for (let c = 1; c < w; c++) board.append(svg('line', { class: 'grid', x1: c, y1: 0, x2: c, y2: h, 'vector-effect': 'non-scaling-stroke' }));
    for (let r = 1; r < h; r++) board.append(svg('line', { class: 'grid', x1: 0, y1: r, x2: w, y2: r, 'vector-effect': 'non-scaling-stroke' }));
    const marks = Array.from({ length: w * h }, (_, i) => {
        const mark = svg('rect', { class: 'cell-mark', x: (i % w) + 0.06, y: Math.floor(i / w) + 0.06, width: 0.88, height: 0.88, rx: 0.12, 'vector-effect': 'non-scaling-stroke', 'data-cell': i });
        board.append(mark);
        return mark;
    });
    const pathLayer = svg('g');
    const hintLayer = svg('g');
    const endLayer = svg('g');
    board.append(pathLayer, hintLayer, endLayer);
    ends.forEach(([a, b], pair) => {
        for (const cell of [a, b]) {
            const [x, y] = center(cell);
            const group = svg('g', { class: 'end', 'data-pair': pair });
            group.append(svg('circle', { cx: x, cy: y, r: 0.36, fill: colorOf(pair), 'vector-effect': 'non-scaling-stroke' }));
            const label = svg('text', { x, y, 'font-size': pair >= 9 ? 0.36 : 0.44 });
            label.textContent = String(pair + 1);
            group.append(label);
            endLayer.append(group);
        }
    });

    const stopObserving = observeSize(container, ({ width, height }) => {
        const cell = Math.floor(Math.min(width / w, height / h, 64));
        board.setAttribute('width', cell * w);
        board.setAttribute('height', cell * h);
    });

    const paint = () => {
        const paths = state.paths.map((path, pair) => (drag && drag.pair === pair ? drag.preview : path));
        const errors = new Set(decoration.errors ?? []);
        pathLayer.replaceChildren(...paths.map((path, pair) => {
            if (path.length < 2) return null;
            return svg('polyline', { class: `path${errors.has(pair) ? ' error' : ''}`, points: pointsOf(path), stroke: colorOf(pair), 'stroke-width': 0.34 });
        }).filter(Boolean));
        const highlight = decoration.highlight ?? [];
        const lit = new Set(highlight);
        marks.forEach((mark, i) => mark.classList.toggle('recommended', lit.has(i)));
        hintLayer.replaceChildren(...(highlight.length > 1 ? [svg('polyline', { class: 'hint-path', points: pointsOf(highlight), 'stroke-width': 0.14 })] : []));
        root.classList.toggle('solved', Boolean(decoration.solved));
    };

    // 押したマスから、どの線をどこから引くかを決める
    const startDrag = (cell) => {
        if (owners[cell] >= 0) return { pair: owners[cell], cells: [cell], fromEnd: true };
        const pair = state.paths.findIndex(path => path.includes(cell));
        if (pair < 0) return null;
        const path = state.paths[pair];
        return { pair, cells: path.slice(0, path.indexOf(cell) + 1), fromEnd: false };
    };

    // 今のマスまで線を伸ばす（戻ったら縮める）。一度に2マス以上飛んだら、同じ行・列なら間を埋める
    const extend = (cell) => {
        const cells = drag.cells;
        const back = cells.indexOf(cell);
        if (back >= 0) {
            cells.length = back + 1;
            return true;
        }
        const last = cells[cells.length - 1];
        const goal = ends[drag.pair][0] === cells[0] ? ends[drag.pair][1] : ends[drag.pair][0];
        if (last === goal && cells.length > 1) return false; // つながったら、それ以上は伸ばさない
        const steps = [];
        if (isAdjacent(w, last, cell)) steps.push(cell);
        else if (Math.floor(last / w) === Math.floor(cell / w) || last % w === cell % w) {
            const delta = Math.floor(last / w) === Math.floor(cell / w) ? Math.sign(cell - last) : Math.sign(cell - last) * w;
            for (let at = last + delta; ; at += delta) {
                steps.push(at);
                if (at === cell) break;
            }
        } else return false;
        let changed = false;
        for (const step of steps) {
            if (cells.includes(step)) break;
            if (owners[step] >= 0 && step !== goal) break;
            cells.push(step);
            changed = true;
            if (step === goal) break;
        }
        return changed;
    };

    const send = () => {
        const cells = drag.cells.slice();
        drag.preview = cells.length > 1 ? cells : [];
        onInput({ type: 'path', pair: drag.pair, cells });
    };

    board.addEventListener('pointerdown', (event) => {
        if (readOnly || decoration.solved || event.button > 0) return;
        const cell = cellAt(board.getBoundingClientRect(), w, h, event.clientX, event.clientY);
        if (cell < 0) return;
        const start = startDrag(cell);
        if (!start) return;
        event.preventDefault();
        board.setPointerCapture?.(event.pointerId);
        drag = { ...start, moved: false, preview: state.paths[start.pair] };
        if (!start.fromEnd) send();
        paint();
    });
    board.addEventListener('pointermove', (event) => {
        if (!drag) return;
        const cell = cellAt(board.getBoundingClientRect(), w, h, event.clientX, event.clientY);
        if (cell < 0 || cell === drag.cells[drag.cells.length - 1]) return;
        if (extend(cell)) {
            drag.moved = true;
            send();
        }
    });
    const finish = () => {
        if (!drag) return;
        // 数字を押して動かさずに離したら、その線を消す
        if (drag.fromEnd && !drag.moved) onInput({ type: 'clear', pair: drag.pair });
        drag = null;
        paint();
    };
    board.addEventListener('pointerup', finish);
    board.addEventListener('pointercancel', finish);

    paint();
    return {
        update(next, options = {}) {
            state = next;
            decoration = options;
            if (drag) drag.preview = state.paths[drag.pair];
            paint();
        },
        destroy() {
            stopObserving();
            root.remove();
        }
    };
}
