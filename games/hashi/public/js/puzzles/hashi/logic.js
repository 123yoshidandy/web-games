/**
 * 橋をかけろのロジック。DOM に触れない（サーバーとテストでもそのまま動く）
 *
 * ルール：島（丸の数字）どうしを、たて・よこにまっすぐな橋でつなぐ。島の数字は、その島から出る橋の本数
 *         2つの島の間にかけられる橋は2本まで。橋は交わらない。すべての島が1つにつながる
 * 問題：{ width, height, islands: [[マス, 数字]…] }（マスは左上から行ごとの番号。マスの順に並ぶ）
 * 状態：{ bridges: [本数…] }（bridges[e] は、橋をかけられる所 e（edgesOf の順）の本数 0〜2）
 * 入力：{ type: 'bridge', a, b, count }（島 a と島 b の間の橋を count 本にする。ほかの橋と交わるときは何もしない）
 */

import { createRandom, randomInt, shuffle } from '../../random.js';

export const SIZES = { easy: 7, normal: 9, hard: 11 };
// 島の数の目安
const ISLAND_RANGE = { easy: [9, 12], normal: [16, 20], hard: [24, 30] };
// 2本の橋になる割合と、すでにある島どうしに橋を足して輪を作る割合
const DOUBLE_RATE = 0.35;
const LOOP_RATE = { easy: 0.1, normal: 0.2, hard: 0.3 };

// ---------- 橋をかけられる所 ----------

// 島どうしが、間にほかの島をはさまずに見える組（右と下だけを見る）。cells は間のマス、crosses は交わる所の番号
function buildEdges(puzzle) {
    const { width: w, height: h, islands } = puzzle;
    const at = new Map(islands.map(([cell], i) => [cell, i]));
    const edges = [];
    islands.forEach(([cell], a) => {
        const r = Math.floor(cell / w);
        const c = cell % w;
        for (const [dr, dc, horizontal] of [[0, 1, true], [1, 0, false]]) {
            const cells = [];
            for (let rr = r + dr, cc = c + dc; rr < h && cc < w; rr += dr, cc += dc) {
                const here = rr * w + cc;
                if (at.has(here)) {
                    edges.push({ a, b: at.get(here), cells, horizontal });
                    break;
                }
                cells.push(here);
            }
        }
    });
    const owner = new Map();
    edges.forEach((edge, e) => edge.cells.forEach(cell => {
        if (!owner.has(cell)) owner.set(cell, []);
        owner.get(cell).push(e);
    }));
    edges.forEach(edge => { edge.crosses = []; });
    for (const list of owner.values()) {
        for (const e of list) for (const f of list) if (e !== f && !edges[e].crosses.includes(f)) edges[e].crosses.push(f);
    }
    const incident = islands.map(() => []);
    edges.forEach((edge, e) => {
        incident[edge.a].push(e);
        incident[edge.b].push(e);
    });
    const byPair = new Map(edges.map((edge, e) => [`${edge.a},${edge.b}`, e]));
    return { edges, incident, byPair };
}

const edgeCache = new Map();
export function edgesOf(puzzle) {
    const key = JSON.stringify(puzzle);
    if (!edgeCache.has(key)) {
        if (edgeCache.size > 20) edgeCache.delete(edgeCache.keys().next().value);
        edgeCache.set(key, buildEdges(puzzle));
    }
    return edgeCache.get(key);
}

// 島 a と島 b の間の所の番号（なければ -1）
export function edgeBetween(puzzle, a, b) {
    const { byPair } = edgesOf(puzzle);
    return byPair.get(a < b ? `${a},${b}` : `${b},${a}`) ?? -1;
}

// ---------- 解く ----------

// 島がすべてつながるか（use[e] が真の所を橋とみなす）
function allConnected(islandCount, edges, use) {
    const parent = Array.from({ length: islandCount }, (_, i) => i);
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    let groups = islandCount;
    edges.forEach((edge, e) => {
        if (!use(e)) return;
        const x = find(edge.a);
        const y = find(edge.b);
        if (x !== y) {
            parent[x] = y;
            groups--;
        }
    });
    return groups <= 1;
}

// 本数の幅（lo〜hi）を、島の数字と交わりから狭める。矛盾したら false
// 島の数字 n：ほかの所の hi を全部足しても n に届かない分は、この所に必ずかかる（lo）。ほかの lo の合計を引いた残りより多くはかからない（hi）
export function propagate(puzzle, graph, lo, hi) {
    const { islands } = puzzle;
    const { edges, incident } = graph;
    for (let changed = true; changed;) {
        changed = false;
        for (let i = 0; i < islands.length; i++) {
            const n = islands[i][1];
            let sumLo = 0;
            let sumHi = 0;
            for (const e of incident[i]) {
                sumLo += lo[e];
                sumHi += hi[e];
            }
            if (sumLo > n || sumHi < n) return false;
            for (const e of incident[i]) {
                const newLo = Math.max(lo[e], n - (sumHi - hi[e]));
                const newHi = Math.min(hi[e], n - (sumLo - lo[e]));
                if (newLo > newHi) return false;
                if (newLo !== lo[e] || newHi !== hi[e]) {
                    sumLo += newLo - lo[e];
                    sumHi += newHi - hi[e];
                    lo[e] = newLo;
                    hi[e] = newHi;
                    changed = true;
                }
            }
        }
        for (let e = 0; e < edges.length; e++) {
            if (lo[e] === 0) continue;
            for (const f of edges[e].crosses) {
                if (lo[f] > 0) return false;
                if (hi[f] > 0) {
                    hi[f] = 0;
                    changed = true;
                }
            }
        }
    }
    // かけられる橋をすべてかけても、島が1つにつながらないなら矛盾
    return allConnected(islands.length, edges, e => hi[e] > 0);
}

// 最初の本数の幅（2本まで、島の数字まで）
export function initialBounds(puzzle, graph) {
    const { islands } = puzzle;
    const lo = new Int8Array(graph.edges.length);
    const hi = Int8Array.from(graph.edges, edge => Math.min(2, islands[edge.a][1], islands[edge.b][1]));
    return { lo, hi };
}

// 解を limit 個まで数える。solution は1つ目の解の bridges
export function countSolutions(puzzle, limit = 2) {
    const graph = edgesOf(puzzle);
    const { lo, hi } = initialBounds(puzzle, graph);
    let count = 0;
    let solution = null;
    let nodes = 0;
    const search = (lo, hi) => {
        if (count >= limit || nodes++ > 200000) return;
        if (!propagate(puzzle, graph, lo, hi)) return;
        let pick = -1;
        for (let e = 0; e < lo.length; e++) if (lo[e] < hi[e]) {
            pick = e;
            break;
        }
        if (pick < 0) {
            if (!allConnected(puzzle.islands.length, graph.edges, e => lo[e] > 0)) return;
            count++;
            if (!solution) solution = Array.from(lo);
            return;
        }
        for (let v = hi[pick]; v >= lo[pick] && count < limit; v--) {
            const nextLo = lo.slice();
            const nextHi = hi.slice();
            nextLo[pick] = v;
            nextHi[pick] = v;
            search(nextLo, nextHi);
        }
    };
    search(lo, hi);
    // 探しきれなかったら、解が1つとは言えないので2つとみなす
    if (nodes > 200000 && count < limit) count = limit;
    return { count, solution };
}

// ---------- 作る ----------

// 島から島へ橋を伸ばして盤を作る。島の数字は、作った橋の本数
function layout(width, height, difficulty, random) {
    const [minIslands, maxIslands] = ISLAND_RANGE[difficulty];
    const target = minIslands + randomInt(random, maxIslands - minIslands + 1);
    const kind = new Int8Array(width * height); // 0 空き 1 島 2 橋
    const islands = [];
    const bridges = []; // [島のマス, 島のマス, 本数]
    const nearIsland = (cell) => {
        const r = Math.floor(cell / width);
        const c = cell % width;
        return (r > 0 && kind[cell - width] === 1) || (r < height - 1 && kind[cell + width] === 1)
            || (c > 0 && kind[cell - 1] === 1) || (c < width - 1 && kind[cell + 1] === 1);
    };
    const start = randomInt(random, width * height);
    kind[start] = 1;
    islands.push(start);
    const directions = [[0, 1], [1, 0], [0, -1], [-1, 0]];
    for (let tries = 0; islands.length < target && tries < 400; tries++) {
        const from = islands[randomInt(random, islands.length)];
        const [dr, dc] = directions[randomInt(random, 4)];
        const options = [];
        const path = [];
        for (let r = Math.floor(from / width) + dr, c = from % width + dc; r >= 0 && c >= 0 && r < height && c < width; r += dr, c += dc) {
            const cell = r * width + c;
            if (kind[cell] !== 0) break;
            if (path.length >= 1 && !nearIsland(cell)) options.push(path.length);
            path.push(cell);
        }
        if (!options.length) continue;
        const at = options[randomInt(random, options.length)];
        const to = path[at];
        path.slice(0, at).forEach(cell => { kind[cell] = 2; });
        kind[to] = 1;
        islands.push(to);
        bridges.push([from, to, random() < DOUBLE_RATE ? 2 : 1]);
    }
    if (islands.length < minIslands) return null;

    // すでにある島どうしが見えていれば、ときどき橋を足して輪を作る
    const order = islands.slice().sort((x, y) => x - y);
    const draft = { width, height, islands: order.map(cell => [cell, 0]) };
    const { edges } = buildEdges(draft);
    const used = new Set(bridges.map(([x, y]) => `${Math.min(x, y)},${Math.max(x, y)}`));
    for (const edge of shuffle(edges.slice(), random)) {
        const x = order[edge.a];
        const y = order[edge.b];
        if (used.has(`${x},${y}`) || random() >= LOOP_RATE[difficulty]) continue;
        if (!edge.cells.length || edge.cells.some(cell => kind[cell] !== 0)) continue;
        edge.cells.forEach(cell => { kind[cell] = 2; });
        bridges.push([x, y, random() < DOUBLE_RATE ? 2 : 1]);
        used.add(`${x},${y}`);
    }
    const degree = new Map(order.map(cell => [cell, 0]));
    bridges.forEach(([x, y, n]) => {
        degree.set(x, degree.get(x) + n);
        degree.set(y, degree.get(y) + n);
    });
    return { width, height, islands: order.map(cell => [cell, degree.get(cell)]) };
}

// 同じシードと難しさなら同じ問題。解が1つになるまで作り直す
export function generate(seed, difficulty = 'normal') {
    const size = SIZES[difficulty] ?? SIZES.normal;
    const level = SIZES[difficulty] ? difficulty : 'normal';
    const random = createRandom(seed);
    for (let attempt = 0; attempt < 500; attempt++) {
        const puzzle = layout(size, size, level, random);
        if (!puzzle) continue;
        if (countSolutions(puzzle, 2).count === 1) return puzzle;
    }
    throw new Error('橋をかけろの問題を作れませんでした');
}
