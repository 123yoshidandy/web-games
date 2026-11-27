/**
 * スリザーリンクの画面
 * 辺を押すと、下の「線」「×」で選んだ印を付ける（同じ印なら消す）。点から点へなぞると、通った辺にまとめて付ける
 * なぞりの最初の辺がすでに同じ印なら、なぞった辺の印を消す。指を離したときに1つの入力として送る
 * ヒントの光らせるもの（highlight）は辺の番号
 */

import { injectStyle, el, svg, observeSize } from '../common/dom.js';
import { geometryOf, LINE, CROSS, EMPTY } from './logic.js';

const CSS = `
.slither { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; width: 100%; height: 100%; }
.slither svg { display: block; touch-action: none; cursor: pointer; }
.slither .bg { fill: var(--cell-bg); stroke: none; }
.slither .clue { fill: var(--ink); font-weight: 700; text-anchor: middle; dominant-baseline: central; font-variant-numeric: tabular-nums; pointer-events: none; }
.slither .clue.done { fill: var(--ink-faint); }
.slither .clue.error { fill: var(--error); }
.slither .dot { fill: var(--ink); }
.slither .dot.error { fill: var(--error); }
.slither .edge { stroke: var(--ink); stroke-linecap: round; }
.slither .edge.preview { stroke: var(--accent); }
.slither .cross { stroke: var(--ink-soft); stroke-linecap: round; }
.slither .cross.preview { stroke: var(--accent); }
.slither .hint-edge { stroke: var(--hint); stroke-linecap: round; opacity: .55; }
.slither.solved .edge { stroke: var(--accent-strong); }
.slither.solved .cross { display: none; }
.slither-tools { display: flex; gap: 8px; }
.slither-tools button { min-width: 88px; min-height: 40px; }
.slither-tools .tool-icon { display: inline-block; width: 16px; height: 3px; margin-right: 6px; vertical-align: 3px; background: currentColor; border-radius: 2px; }
`;

const TOOLS_HEIGHT = 50; // 「線」「×」の行と、その上の隙間
const MARGIN = 0.4; // 盤面のまわりの余白（マスの大きさを1として）
const EDGE_REACH = 0.35; // 押した位置が、辺からこれより近ければ、その辺を押したことにする（マスの大きさを1として）

export function render(container, puzzle, initial, { onInput = () => {}, readOnly = false } = {}) {
    injectStyle('slitherlink', CSS);
    const { width: w, height: h, clues } = puzzle;
    const geo = geometryOf(puzzle);
    let state = initial;
    let decoration = {};
    let mode = LINE;
    let stroke = null; // なぞっている途中 { x, y, vertices, edges, value, dragging }

    const vb = [-MARGIN, -MARGIN, w + MARGIN * 2, h + MARGIN * 2];
    const board = svg('svg', { viewBox: vb.join(' '), role: 'img', 'aria-label': '盤面' });
    board.append(svg('rect', { class: 'bg', x: 0, y: 0, width: w, height: h }));
    const vertexXY = (v) => [v % (w + 1), Math.floor(v / (w + 1))];
    const edgeXY = (edge) => {
        const [a, b] = geo.edgeEnds[edge];
        return [...vertexXY(a), ...vertexXY(b)];
    };

    const clueNodes = clues.map((clue, cell) => {
        if (clue === null) return null;
        const node = svg('text', { class: 'clue', x: (cell % w) + 0.5, y: Math.floor(cell / w) + 0.53, 'font-size': 0.62 });
        node.textContent = String(clue);
        board.append(node);
        return node;
    });
    const hintLayer = svg('g');
    const markLayer = svg('g');
    const dotLayer = svg('g');
    board.append(hintLayer, markLayer, dotLayer);
    const dots = Array.from({ length: geo.vertexCount }, (_, v) => {
        const [x, y] = vertexXY(v);
        const dot = svg('circle', { class: 'dot', cx: x, cy: y, r: 0.07 });
        dotLayer.append(dot);
        return dot;
    });

    const lineButton = el('button', { type: 'button', class: 'tool', 'aria-pressed': 'true', 'data-tool': 'line' }, [el('span', { class: 'tool-icon' }), '線']);
    const crossButton = el('button', { type: 'button', class: 'tool', 'aria-pressed': 'false', 'data-tool': 'cross' }, ['× を付ける']);
    const tools = el('div', { class: 'slither-tools' }, [lineButton, crossButton]);
    const root = el('div', { class: 'slither' }, [board, tools]);
    container.replaceChildren(root);
    if (readOnly) tools.hidden = true;

    const setMode = (next) => {
        mode = next;
        lineButton.setAttribute('aria-pressed', String(mode === LINE));
        crossButton.setAttribute('aria-pressed', String(mode === CROSS));
    };
    lineButton.addEventListener('click', () => setMode(LINE));
    crossButton.addEventListener('click', () => setMode(CROSS));

    const stopObserving = observeSize(container, ({ width, height }) => {
        const available = readOnly ? height : height - TOOLS_HEIGHT;
        const unit = Math.max(12, Math.floor(Math.min(width / vb[2], available / vb[3], 60)));
        board.setAttribute('width', Math.round(unit * vb[2]));
        board.setAttribute('height', Math.round(unit * vb[3]));
    });

    const paint = () => {
        const shown = state.edges.slice();
        const preview = new Set();
        if (stroke?.edges.length) stroke.edges.forEach(edge => { shown[edge] = stroke.value; preview.add(edge); });
        const marks = [];
        shown.forEach((value, edge) => {
            const [x1, y1, x2, y2] = edgeXY(edge);
            const extra = preview.has(edge) ? ' preview' : '';
            if (value === LINE) marks.push(svg('line', { class: `edge${extra}`, x1, y1, x2, y2, 'stroke-width': 0.12 }));
            else if (value === CROSS) {
                const cx = (x1 + x2) / 2;
                const cy = (y1 + y2) / 2;
                // スマホのむずかしい（1マス 30px ほど）でも見える大きさにする
                const d = 0.12;
                marks.push(svg('path', { class: `cross${extra}`, d: `M${cx - d} ${cy - d}L${cx + d} ${cy + d}M${cx + d} ${cy - d}L${cx - d} ${cy + d}`, 'stroke-width': 0.055 }));
            }
        });
        markLayer.replaceChildren(...marks);
        hintLayer.replaceChildren(...(decoration.highlight ?? []).filter(edge => edge >= 0 && edge < geo.edgeCount).map(edge => {
            const [x1, y1, x2, y2] = edgeXY(edge);
            return svg('line', { class: 'hint-edge recommended', x1, y1, x2, y2, 'stroke-width': 0.3 });
        }));
        const errors = decoration.errors ?? [];
        const errorCells = new Set(errors.filter(x => x.kind === 'cell').map(x => x.index));
        const errorVertices = new Set(errors.filter(x => x.kind === 'vertex').map(x => x.index));
        clueNodes.forEach((node, cell) => {
            if (!node) return;
            const lines = geo.cellEdges[cell].filter(edge => state.edges[edge] === LINE).length;
            // 0 は最初から本数が合っているので、4辺すべてに × を付けたときだけ薄くする
            const done = clues[cell] > 0 ? lines === clues[cell] : geo.cellEdges[cell].every(edge => state.edges[edge] === CROSS);
            node.classList.toggle('done', done);
            node.classList.toggle('error', errorCells.has(cell));
        });
        dots.forEach((dot, v) => dot.classList.toggle('error', errorVertices.has(v)));
        root.classList.toggle('solved', Boolean(decoration.solved));
    };

    // 画面の位置を、盤面の座標（マスの大きさを1として、左上の点が 0, 0）にする
    const toBoard = (event) => {
        const rect = board.getBoundingClientRect();
        return [(event.clientX - rect.left) / rect.width * vb[2] + vb[0], (event.clientY - rect.top) / rect.height * vb[3] + vb[1]];
    };
    const vertexAt = (x, y) => {
        const c = Math.min(w, Math.max(0, Math.round(x)));
        const r = Math.min(h, Math.max(0, Math.round(y)));
        return { v: r * (w + 1) + c, d: Math.hypot(x - c, y - r) };
    };
    // いちばん近い辺
    const edgeAt = (x, y) => {
        const hr = Math.round(y);
        const hc = Math.floor(x);
        const vc = Math.round(x);
        const vr = Math.floor(y);
        const options = [];
        if (hr >= 0 && hr <= h && hc >= 0 && hc < w) options.push([Math.abs(y - hr), hr * w + hc]);
        if (vc >= 0 && vc <= w && vr >= 0 && vr < h) options.push([Math.abs(x - vc), geo.horizontal + vr * (w + 1) + vc]);
        options.sort((a, b) => a[0] - b[0]);
        // 辺から 0.35 マスまでを押せる所にする（線の両側に、むずかしいでも 12px ほど）。マスの真ん中や数字を押しても、どの辺にもしない
        return options.length && options[0][0] < EDGE_REACH ? options[0][1] : -1;
    };
    const edgeBetween = (a, b) => geo.vertexEdges[a].find(edge => geo.edgeEnds[edge].includes(b)) ?? -1;

    // なぞり：今いる点が、最後の点と同じ行・列なら、間の辺をまとめて足す。1つ前の点に戻ったら、最後の辺を外す
    const extend = (v) => {
        const path = stroke.vertices;
        const last = path[path.length - 1];
        if (v === last) return false;
        if (path.length >= 2 && v === path[path.length - 2]) {
            path.pop();
            stroke.edges.pop();
            return true;
        }
        const [lx, ly] = vertexXY(last);
        const [x, y] = vertexXY(v);
        if (lx !== x && ly !== y) return false;
        const step = lx === x ? Math.sign(y - ly) * (w + 1) : Math.sign(x - lx);
        let changed = false;
        for (let at = last; at !== v;) {
            const next = at + step;
            const edge = edgeBetween(at, next);
            if (edge < 0 || stroke.edges.includes(edge)) break;
            if (!stroke.edges.length) stroke.value = state.edges[edge] === mode ? EMPTY : mode;
            stroke.edges.push(edge);
            path.push(next);
            at = next;
            changed = true;
        }
        return changed;
    };

    board.addEventListener('pointerdown', (event) => {
        if (readOnly || decoration.solved || event.button > 0) return;
        const [x, y] = toBoard(event);
        event.preventDefault();
        board.setPointerCapture?.(event.pointerId);
        stroke = { x, y, vertices: [vertexAt(x, y).v], edges: [], value: mode, dragging: false };
    });
    board.addEventListener('pointermove', (event) => {
        if (!stroke) return;
        const [x, y] = toBoard(event);
        if (!stroke.dragging && Math.hypot(x - stroke.x, y - stroke.y) < 0.4) return;
        stroke.dragging = true;
        const { v, d } = vertexAt(x, y);
        if (d < 0.38 && extend(v)) paint();
    });
    const finish = (event) => {
        if (!stroke) return;
        const { edges, value, dragging, x, y } = stroke;
        stroke = null;
        if (edges.length) {
            paint();
            onInput({ edges: edges.slice(), value });
            return;
        }
        if (!dragging && event.type === 'pointerup') {
            const edge = edgeAt(x, y);
            if (edge >= 0) onInput({ edges: [edge], value: state.edges[edge] === mode ? EMPTY : mode });
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
