/**
 * スリザーリンクのロジック。DOM に触れない（サーバーとテストでもそのまま動く）
 *
 * ルール：点と点の間に線を引き、1つの輪を作る。輪は交わらず、枝分かれしない。数字は、そのマスのまわり4辺のうち線を引く辺の数
 * 問題：{ width, height, clues: [0〜3 か null …] }（マスごとの数字。左上から行ごと）
 * 状態：{ edges: [0|1|2 …] }（辺ごとに 0 未定・1 線・2 ×）
 * 入力：{ edges: [辺の番号…], value: 0|1|2 }（なぞった・押した辺をまとめて同じ値にする）
 *
 * 辺の番号：横の辺（上から r 本目の横線の、左から c 番目）が r * width + c、その後に縦の辺（上から r 段目の、左から c 本目）が
 * (height + 1) * width + r * (width + 1) + c。点の番号は r * (width + 1) + c
 */

import { createRandom, randomInt, shuffle } from '../../random.js';

export const EMPTY = 0;
export const LINE = 1;
export const CROSS = 2;

export const SIZES = { easy: 5, normal: 7, hard: 10 };
// 輪の内側にするマスの割合の目安
const INSIDE_RATIO = { easy: 0.5, normal: 0.55, hard: 0.55 };
// 数字を外せるかを確かめるときの、場合分けの手数の上限（超えたら外さない。深い場合分けのいる問題にしない）
export const NODE_BUDGET = { normal: 300, hard: 300 };

// ---------- 盤面の形 ----------

const geometryCache = new Map();
export function geometry(width, height) {
    const key = `${width}x${height}`;
    if (geometryCache.has(key)) return geometryCache.get(key);
    const horizontal = (height + 1) * width;
    const edgeCount = horizontal + height * (width + 1);
    const vertex = (r, c) => r * (width + 1) + c;
    const hEdge = (r, c) => r * width + c;
    const vEdge = (r, c) => horizontal + r * (width + 1) + c;
    const edgeEnds = [];
    const edgeCells = [];
    for (let r = 0; r <= height; r++) {
        for (let c = 0; c < width; c++) {
            edgeEnds.push([vertex(r, c), vertex(r, c + 1)]);
            edgeCells.push([r > 0 ? (r - 1) * width + c : -1, r < height ? r * width + c : -1].filter(x => x >= 0));
        }
    }
    for (let r = 0; r < height; r++) {
        for (let c = 0; c <= width; c++) {
            edgeEnds.push([vertex(r, c), vertex(r + 1, c)]);
            edgeCells.push([c > 0 ? r * width + c - 1 : -1, c < width ? r * width + c : -1].filter(x => x >= 0));
        }
    }
    const cellEdges = [];
    for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) cellEdges.push([hEdge(r, c), vEdge(r, c + 1), hEdge(r + 1, c), vEdge(r, c)]);
    }
    const vertexCount = (height + 1) * (width + 1);
    const vertexEdges = Array.from({ length: vertexCount }, () => []);
    edgeEnds.forEach(([a, b], e) => { vertexEdges[a].push(e); vertexEdges[b].push(e); });
    const geo = { width, height, horizontal, edgeCount, vertexCount, edgeEnds, edgeCells, cellEdges, vertexEdges };
    geometryCache.set(key, geo);
    return geo;
}

export const geometryOf = (puzzle) => geometry(puzzle.width, puzzle.height);

// ---------- 理屈で決める（解く・ヒント） ----------
// 解くときの値：-1 未定・0 ×・1 線

// 1つの決まりから決まる辺を1組さがす。見つからなければ null、矛盾していれば { contradiction: true }
// preferLine なら、線が決まるものを先に返す（ヒント用）
export function findDeduction(geo, clues, e, { preferLine = false } = {}) {
    let fallback = null;
    const offer = (found) => {
        if (!preferLine || found.value === 1) return found;
        if (!fallback) fallback = found;
        return null;
    };
    // マスの数字
    for (let cell = 0; cell < clues.length; cell++) {
        const clue = clues[cell];
        if (clue === null || clue === undefined) continue;
        let lines = 0;
        const unknown = [];
        for (const edge of geo.cellEdges[cell]) {
            if (e[edge] === 1) lines++;
            else if (e[edge] < 0) unknown.push(edge);
        }
        if (lines > clue || lines + unknown.length < clue) return { contradiction: true };
        if (!unknown.length) continue;
        if (lines === clue) {
            const found = offer({ rule: 'cell-full', cell, edges: unknown, value: 0 });
            if (found) return found;
        } else if (lines + unknown.length === clue) {
            const found = offer({ rule: 'cell-need', cell, edges: unknown, value: 1 });
            if (found) return found;
        }
    }
    // 点：線は0本か2本
    for (let v = 0; v < geo.vertexCount; v++) {
        let lines = 0;
        const unknown = [];
        for (const edge of geo.vertexEdges[v]) {
            if (e[edge] === 1) lines++;
            else if (e[edge] < 0) unknown.push(edge);
        }
        if (lines > 2 || (lines === 1 && !unknown.length)) return { contradiction: true };
        if (!unknown.length) continue;
        let found = null;
        if (lines === 2) found = offer({ rule: 'vertex-full', vertex: v, edges: unknown, value: 0 });
        else if (lines === 1 && unknown.length === 1) found = offer({ rule: 'vertex-continue', vertex: v, edges: unknown, value: 1 });
        else if (lines === 0 && unknown.length === 1) found = offer({ rule: 'vertex-dead', vertex: v, edges: unknown, value: 0 });
        if (found) return found;
    }
    // 小さな輪
    const loop = loopDeduction(geo, clues, e);
    if (loop) {
        if (loop.contradiction) return loop;
        const found = offer(loop);
        if (found) return found;
    }
    return fallback;
}

// 線のつながりを調べる。輪が閉じていれば、それ以外の線がないか。線の両端をつなぐ辺は、ほかに線が残るなら ×
function loopDeduction(geo, clues, e) {
    const degree = new Uint8Array(geo.vertexCount);
    let total = 0;
    for (let edge = 0; edge < geo.edgeCount; edge++) {
        if (e[edge] !== 1) continue;
        total++;
        degree[geo.edgeEnds[edge][0]]++;
        degree[geo.edgeEnds[edge][1]]++;
    }
    if (!total) return null;
    const seen = new Uint8Array(geo.edgeCount);
    const lineEdgeAt = (v, except) => {
        for (const edge of geo.vertexEdges[v]) if (edge !== except && e[edge] === 1) return edge;
        return -1;
    };
    // 片方の端から、もう片方の端までたどる
    for (let v = 0; v < geo.vertexCount; v++) {
        if (degree[v] !== 1) continue;
        let at = v;
        let edge = lineEdgeAt(v, -1);
        if (seen[edge]) continue;
        let length = 0;
        while (edge >= 0) {
            seen[edge] = 1;
            length++;
            const [a, b] = geo.edgeEnds[edge];
            at = a === at ? b : a;
            edge = degree[at] === 2 ? lineEdgeAt(at, edge) : -1;
        }
        const end = at;
        const closing = geo.vertexEdges[v].find(x => e[x] < 0 && (geo.edgeEnds[x][0] === end || geo.edgeEnds[x][1] === end));
        if (closing === undefined) continue;
        // ほかにも線があるなら、ここで閉じると輪が2つになる。この線だけなら、閉じて数字がすべて合うときだけ閉じられる
        if (length < total || !closesCorrectly(geo, clues, e, closing)) {
            return { rule: 'loop', vertex: v, edges: [closing], value: 0 };
        }
    }
    // 端のない線（閉じた輪）があれば、それですべてでなければ矛盾。すべてなら、残りの辺は ×
    for (let edge = 0; edge < geo.edgeCount; edge++) {
        if (e[edge] !== 1 || seen[edge]) continue;
        let length = 0;
        let at = geo.edgeEnds[edge][0];
        let current = edge;
        while (current >= 0 && !seen[current]) {
            seen[current] = 1;
            length++;
            const [a, b] = geo.edgeEnds[current];
            at = a === at ? b : a;
            current = lineEdgeAt(at, current);
        }
        if (length < total) return { contradiction: true };
        const rest = [];
        for (let x = 0; x < geo.edgeCount; x++) if (e[x] < 0) rest.push(x);
        if (rest.length) return { rule: 'loop-done', edges: rest, value: 0 };
        return null;
    }
    return null;
}

// closing の辺を線にし、残りの未定の辺を × にしたとき、数字がすべて合うか
function closesCorrectly(geo, clues, e, closing) {
    for (let cell = 0; cell < clues.length; cell++) {
        const clue = clues[cell];
        if (clue === null || clue === undefined) continue;
        let lines = 0;
        for (const edge of geo.cellEdges[cell]) if (e[edge] === 1 || edge === closing) lines++;
        if (lines !== clue) return false;
    }
    return true;
}

// 決まりを当てられるだけ当てる（e を書き換える）。矛盾すれば false
// findDeduction と同じ決まりを、速さのために1周でまとめて当てる
export function propagate(geo, clues, e) {
    const { cellEdges, vertexEdges } = geo;
    for (;;) {
        let changed = false;
        for (let cell = 0; cell < clues.length; cell++) {
            const clue = clues[cell];
            if (clue === null || clue === undefined) continue;
            const edges = cellEdges[cell];
            let lines = 0;
            let unknown = 0;
            for (let k = 0; k < 4; k++) {
                const v = e[edges[k]];
                if (v === 1) lines++;
                else if (v < 0) unknown++;
            }
            if (lines > clue || lines + unknown < clue) return false;
            if (!unknown || (lines !== clue && lines + unknown !== clue)) continue;
            const value = lines === clue ? 0 : 1;
            for (let k = 0; k < 4; k++) if (e[edges[k]] < 0) e[edges[k]] = value;
            changed = true;
        }
        for (let v = 0; v < vertexEdges.length; v++) {
            const edges = vertexEdges[v];
            let lines = 0;
            let unknown = 0;
            let last = -1;
            for (let k = 0; k < edges.length; k++) {
                const x = e[edges[k]];
                if (x === 1) lines++;
                else if (x < 0) {
                    unknown++;
                    last = edges[k];
                }
            }
            if (lines > 2 || (lines === 1 && !unknown)) return false;
            if (!unknown) continue;
            if (lines === 2) {
                for (let k = 0; k < edges.length; k++) if (e[edges[k]] < 0) e[edges[k]] = 0;
                changed = true;
            } else if (unknown === 1) {
                e[last] = lines;
                changed = true;
            }
        }
        if (changed) continue;
        const loop = loopDeduction(geo, clues, e);
        if (!loop) return true;
        if (loop.contradiction) return false;
        for (const edge of loop.edges) e[edge] = loop.value;
    }
}

// ---------- 解く（解の数を limit まで数える） ----------

// 理屈と場合分けで解く。e0 は始めの値（省けば何も決まっていない）
export function countSolutions(puzzle, limit = 2, { maxNodes = 200_000, start = null } = {}) {
    const geo = geometryOf(puzzle);
    const clues = puzzle.clues;
    let count = 0;
    let first = null;
    let nodes = 0;
    const e0 = start ? Int8Array.from(start) : new Int8Array(geo.edgeCount).fill(-1);

    // 場合分けする辺：線の端の点から伸びる辺を先に選ぶ（すぐに決まりやすい）
    const pickEdge = (e) => {
        let any = -1;
        for (let v = 0; v < geo.vertexCount; v++) {
            let lines = 0;
            let unknown = -1;
            for (const edge of geo.vertexEdges[v]) {
                if (e[edge] === 1) lines++;
                else if (e[edge] < 0) unknown = edge;
            }
            if (lines === 1 && unknown >= 0) return unknown;
            if (any < 0 && unknown >= 0) any = unknown;
        }
        return any;
    };

    const search = (e) => {
        if (count >= limit || ++nodes > maxNodes) return;
        const edge = pickEdge(e);
        if (edge < 0) {
            if (!e.includes(1)) return;
            count++;
            if (!first) first = e.slice();
            return;
        }
        for (const value of [1, 0]) {
            const next = e.slice();
            next[edge] = value;
            if (propagate(geo, clues, next)) search(next);
            if (count >= limit) return;
        }
    };

    if (propagate(geo, clues, e0)) search(e0);
    return { count, edges: first ? Array.from(first) : null, complete: nodes <= maxNodes };
}

// 理屈だけ（場合分けなし）で全部決まるか
export function solvesByLogic(puzzle) {
    const geo = geometryOf(puzzle);
    const e = new Int8Array(geo.edgeCount).fill(-1);
    return propagate(geo, puzzle.clues, e) && !e.includes(-1);
}

// ---------- 判定 ----------

// 線の辺（1 の辺）が、1つの輪になっていて、数字がすべて合うか
export function isSolution(puzzle, lines) {
    const geo = geometryOf(puzzle);
    for (let cell = 0; cell < puzzle.clues.length; cell++) {
        const clue = puzzle.clues[cell];
        if (clue === null || clue === undefined) continue;
        if (geo.cellEdges[cell].filter(edge => lines[edge]).length !== clue) return false;
    }
    const degree = new Uint8Array(geo.vertexCount);
    let total = 0;
    let startEdge = -1;
    for (let edge = 0; edge < geo.edgeCount; edge++) {
        if (!lines[edge]) continue;
        total++;
        startEdge = edge;
        degree[geo.edgeEnds[edge][0]]++;
        degree[geo.edgeEnds[edge][1]]++;
    }
    if (!total || degree.some(d => d !== 0 && d !== 2)) return false;
    // 1つの輪か：1本からたどって、すべての線を通るか
    let length = 0;
    let at = geo.edgeEnds[startEdge][0];
    let current = startEdge;
    do {
        length++;
        const [a, b] = geo.edgeEnds[current];
        at = a === at ? b : a;
        current = geo.vertexEdges[at].find(edge => edge !== current && lines[edge]);
    } while (current !== startEdge && length <= total);
    return length === total;
}

// ---------- 生成 ----------

// 輪の内側にするマスの集まりを、でたらめに広げて作る。内側も外側もひとつながりで、点で斜めに接しない（輪が交わらない）
function randomRegion(width, height, random, target) {
    const size = width * height;
    const inside = new Uint8Array(size);
    const neighbors = (i) => {
        const r = Math.floor(i / width);
        const c = i % width;
        const list = [];
        if (r > 0) list.push(i - width);
        if (r < height - 1) list.push(i + width);
        if (c > 0) list.push(i - 1);
        if (c < width - 1) list.push(i + 1);
        return list;
    };
    // 外側のマスが、盤面の外までつながっているか
    const outsideConnected = () => {
        const reached = new Uint8Array(size);
        const stack = [];
        let outside = 0;
        for (let i = 0; i < size; i++) {
            if (inside[i]) continue;
            outside++;
            const r = Math.floor(i / width);
            const c = i % width;
            if (r === 0 || c === 0 || r === height - 1 || c === width - 1) {
                reached[i] = 1;
                stack.push(i);
            }
        }
        let count = stack.length;
        while (stack.length) {
            for (const n of neighbors(stack.pop())) {
                if (!inside[n] && !reached[n]) {
                    reached[n] = 1;
                    count++;
                    stack.push(n);
                }
            }
        }
        return count === outside;
    };
    // マス i のまわりの4つの点で、斜めにだけ接していないか
    const noPinch = (i) => {
        const r0 = Math.floor(i / width);
        const c0 = i % width;
        for (const [r, c] of [[r0, c0], [r0, c0 + 1], [r0 + 1, c0], [r0 + 1, c0 + 1]]) {
            if (r < 1 || c < 1 || r > height - 1 || c > width - 1) continue;
            const a = inside[(r - 1) * width + c - 1];
            const b = inside[(r - 1) * width + c];
            const d = inside[r * width + c - 1];
            const f = inside[r * width + c];
            if (a === f && b === d && a !== b) return false;
        }
        return true;
    };
    const start = (1 + randomInt(random, height - 2)) * width + 1 + randomInt(random, width - 2);
    inside[start] = 1;
    let count = 1;
    let fails = 0;
    while (count < target && fails < size * 4) {
        const frontier = [];
        for (let i = 0; i < size; i++) if (!inside[i] && neighbors(i).some(n => inside[n])) frontier.push(i);
        if (!frontier.length) break;
        const cell = frontier[randomInt(random, frontier.length)];
        inside[cell] = 1;
        if (noPinch(cell) && outsideConnected()) {
            count++;
        } else {
            inside[cell] = 0;
            fails++;
        }
    }
    return inside;
}

// 内側のマスの集まりから、輪の辺（内側と外側の境目）を求める
function loopOf(geo, inside) {
    return geo.edgeCells.map(cells => {
        const sides = cells.map(cell => inside[cell]);
        if (sides.length === 1) return sides[0] ? 1 : 0;
        return sides[0] !== sides[1] ? 1 : 0;
    });
}

// 同じシードと難しさからは、同じ問題になる
// 輪をでたらめに作り、すべてのマスに数字を置いてから、解が1つのままの数字を外していく
// やさしいは、場合分けなしの理屈だけで解ける問題にする
export function generate(seed, difficulty = 'normal') {
    const size = SIZES[difficulty] ?? SIZES.normal;
    const ratio = INSIDE_RATIO[difficulty] ?? INSIDE_RATIO.normal;
    const random = createRandom(seed);
    const geo = geometry(size, size);
    for (let attempt = 0; attempt < 50; attempt++) {
        const inside = randomRegion(size, size, random, Math.round(size * size * ratio));
        const lines = loopOf(geo, inside);
        const clues = geo.cellEdges.map(edges => edges.filter(edge => lines[edge]).length);
        const puzzle = { width: size, height: size, clues };
        const unique = difficulty === 'easy'
            ? () => solvesByLogic(puzzle)
            : () => { const result = countSolutions(puzzle, 2, { maxNodes: NODE_BUDGET[difficulty] ?? NODE_BUDGET.normal }); return result.complete && result.count === 1; };
        const order = shuffle(Array.from({ length: size * size }, (_, i) => i), random);
        for (const cell of order) {
            const keep = clues[cell];
            clues[cell] = null;
            if (!unique()) clues[cell] = keep;
        }
        if (unique()) return puzzle;
    }
    throw new Error('スリザーリンクの問題を作れませんでした');
}
