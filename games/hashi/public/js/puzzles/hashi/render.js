/**
 * 橋をかけろの画面
 * 島から、となりの島の方へ指をすべらせると、その間の橋が 1本→2本→なし と変わる。橋（か島の間）を押しても同じように変わる
 * 入力は { type: 'bridge', a, b, count } を送る
 */

import { injectStyle, svg, observeSize, cellAt } from '../common/dom.js';
import { edgesOf } from './logic.js';

const CSS = `
.hashi { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; }
.hashi svg { display: block; touch-action: none; cursor: pointer; }
.hashi .bg { fill: var(--cell-bg); stroke: var(--line); stroke-width: 1; }
.hashi .dot { fill: var(--ink-faint); opacity: .35; }
.hashi .cell-mark { fill: transparent; }
.hashi .cell-mark.recommended { fill: var(--hint-fill); }
.hashi .bridge { stroke: var(--ink); stroke-linecap: round; }
.hashi .bridge.preview { stroke: var(--accent); opacity: .7; }
.hashi .island circle { fill: var(--paper); stroke: var(--ink); stroke-width: 2; }
.hashi .island text { fill: var(--ink); font-weight: 800; text-anchor: middle; dominant-baseline: central; font-variant-numeric: tabular-nums; pointer-events: none; }
.hashi .island.done circle { fill: var(--clue-band); stroke: var(--ink-soft); }
.hashi .island.done text { fill: var(--ink-soft); }
.hashi .island.error circle { stroke: var(--error); stroke-width: 3; }
.hashi .island.error text { fill: var(--error); }
.hashi .island.recommended circle { stroke: var(--hint); stroke-width: 3; }
.hashi.solved .bg { stroke: var(--accent-strong); stroke-width: 3; }
.hashi.solved .bridge { stroke: var(--accent-strong); }
`;

export function render(container, puzzle, initial, { onInput = () => {}, readOnly = false } = {}) {
    injectStyle('hashi', CSS);
    const { width: w, height: h, islands } = puzzle;
    const { edges, incident } = edgesOf(puzzle);
    const islandAt = new Map(islands.map(([cell], i) => [cell, i]));
    let state = initial;
    let decoration = {};
    let drag = null; // { cell, x, y, island, edge }

    const root = document.createElement('div');
    root.className = 'hashi';
    const board = svg('svg', { viewBox: `0 0 ${w} ${h}`, role: 'img', 'aria-label': '盤面' });
    root.append(board);
    container.replaceChildren(root);

    const center = (cell) => [(cell % w) + 0.5, Math.floor(cell / w) + 0.5];

    board.append(svg('rect', { class: 'bg', x: 0, y: 0, width: w, height: h, 'vector-effect': 'non-scaling-stroke' }));
    const marks = Array.from({ length: w * h }, (_, i) => {
        const mark = svg('rect', { class: 'cell-mark', x: i % w, y: Math.floor(i / w), width: 1, height: 1 });
        board.append(mark);
        if (!islandAt.has(i)) {
            const [x, y] = center(i);
            board.append(svg('circle', { class: 'dot', cx: x, cy: y, r: 0.05 }));
        }
        return mark;
    });
    const bridgeLayer = svg('g');
    const islandLayer = svg('g');
    board.append(bridgeLayer, islandLayer);
    const islandNodes = islands.map(([cell, n]) => {
        const [x, y] = center(cell);
        const group = svg('g', { class: 'island' });
        group.append(svg('circle', { cx: x, cy: y, r: 0.4, 'vector-effect': 'non-scaling-stroke' }));
        const label = svg('text', { x, y, 'font-size': 0.5 });
        label.textContent = String(n);
        group.append(label);
        islandLayer.append(group);
        return group;
    });

    const stopObserving = observeSize(container, ({ width, height }) => {
        const cell = Math.floor(Math.min(width / w, height / h, 56));
        board.setAttribute('width', cell * w);
        board.setAttribute('height', cell * h);
    });

    // 橋の線（1本は真ん中、2本は少しずらして並べる）
    const bridgeLines = (e, count, extra = '') => {
        const edge = edges[e];
        const [x1, y1] = center(islands[edge.a][0]);
        const [x2, y2] = center(islands[edge.b][0]);
        const offsets = count === 2 ? [-0.11, 0.11] : [0];
        return offsets.map(d => svg('line', {
            class: `bridge${extra}`,
            x1: edge.horizontal ? x1 + 0.4 : x1 + d, y1: edge.horizontal ? y1 + d : y1 + 0.4,
            x2: edge.horizontal ? x2 - 0.4 : x2 + d, y2: edge.horizontal ? y2 + d : y2 - 0.4,
            'stroke-width': 0.08
        }));
    };

    const paint = () => {
        const lines = [];
        state.bridges.forEach((count, e) => { if (count) lines.push(...bridgeLines(e, count)); });
        if (drag && drag.edge >= 0) lines.push(...bridgeLines(drag.edge, (state.bridges[drag.edge] + 1) % 3 || 0, ' preview'));
        bridgeLayer.replaceChildren(...lines);
        const errors = new Set(decoration.errors ?? []);
        const lit = new Set(decoration.highlight ?? []);
        marks.forEach((mark, i) => mark.classList.toggle('recommended', lit.has(i)));
        islandNodes.forEach((node, i) => {
            const degree = incident[i].reduce((sum, e) => sum + state.bridges[e], 0);
            node.classList.toggle('done', degree === islands[i][1]);
            node.classList.toggle('error', errors.has(i));
            node.classList.toggle('recommended', lit.has(islands[i][0]));
        });
        root.classList.toggle('solved', Boolean(decoration.solved));
    };

    // 押した位置（マスの単位）
    const pointOf = (event) => {
        const rect = board.getBoundingClientRect();
        return [(event.clientX - rect.left) / (rect.width / w), (event.clientY - rect.top) / (rect.height / h)];
    };

    // 島から、指を動かした向きにある所
    const edgeToward = (island, dx, dy) => {
        const horizontal = Math.abs(dx) >= Math.abs(dy);
        const forward = horizontal ? dx > 0 : dy > 0;
        return incident[island].find(e => {
            const edge = edges[e];
            if (edge.horizontal !== horizontal) return false;
            return forward ? edge.a === island : edge.b === island;
        }) ?? -1;
    };

    // 島の間のマスを押したら、そこを通る所（橋があればそちら、なければ押した位置に近い向き）
    const edgeAtCell = (cell, x, y) => {
        const list = edges.map((edge, e) => e).filter(e => edges[e].cells.includes(cell));
        if (list.length <= 1) return list[0] ?? -1;
        const withBridge = list.filter(e => state.bridges[e] > 0);
        if (withBridge.length === 1) return withBridge[0];
        const [cx, cy] = center(cell);
        const horizontal = Math.abs(y - cy) <= Math.abs(x - cx);
        return list.find(e => edges[e].horizontal === horizontal) ?? list[0];
    };

    const send = (e) => {
        const { a, b } = edges[e];
        onInput({ type: 'bridge', a, b, count: (state.bridges[e] + 1) % 3 });
    };

    board.addEventListener('pointerdown', (event) => {
        if (readOnly || decoration.solved || event.button > 0) return;
        const cell = cellAt(board.getBoundingClientRect(), w, h, event.clientX, event.clientY);
        if (cell < 0) return;
        event.preventDefault();
        board.setPointerCapture?.(event.pointerId);
        const [x, y] = pointOf(event);
        drag = { cell, x, y, island: islandAt.get(cell) ?? -1, edge: -1 };
    });
    board.addEventListener('pointermove', (event) => {
        if (!drag || drag.island < 0) return;
        const [x, y] = pointOf(event);
        const dx = x - drag.x;
        const dy = y - drag.y;
        const edge = Math.hypot(dx, dy) >= 0.5 ? edgeToward(drag.island, dx, dy) : -1;
        if (edge !== drag.edge) {
            drag.edge = edge;
            paint();
        }
    });
    const finish = (event) => {
        if (!drag) return;
        const current = drag;
        drag = null;
        if (event.type === 'pointerup') {
            if (current.edge >= 0) send(current.edge);
            else if (current.island < 0) {
                const [x, y] = pointOf(event);
                const edge = edgeAtCell(current.cell, x, y);
                if (edge >= 0) send(edge);
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
