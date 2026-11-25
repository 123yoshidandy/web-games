/**
 * 得点（公式のルールブックどおり）
 * - 出口：同じつながり（ネットワーク）でつながった出口の数ごとに、表の点（2つで4点 … 12で45点）
 * - 一番長い道・一番長い線路：つながった同じ種類の道・線路のマスの、枝分かれやループを含まない一本の流れの長さ（1マス1点）
 *   駅では途切れない。高架は、道として・線路として、それぞれの流れに1回ずつ数える
 * - 中央の9マス：描いたマス1つにつき1点
 * - 減点：ほかの道・線路にも外周にもつながっていない端1つにつき −1（外周に向いた端は、出口でなくても減点しない）
 */

import { SIZE, DIR, EXITS, exitAt, inside, index, opposite, shapeOf, CENTER } from './tiles.js';

export const NETWORK_POINTS = [0, 0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 45];

// 区間（マスの中でつながった辺のまとまり）の一覧と、そのつながりを作る
// node：{ cell, group, edges: [辺], types: Set }。links：隣の区間とのつながり（種類つき）
export function buildGraph(cells) {
    const nodes = [];
    const nodeAt = new Map();   // `${cell}:${group}` → node の番号
    for (let i = 0; i < cells.length; i++) {
        const c = cells[i];
        if (!c) continue;
        const shape = shapeOf(c.kind, c.o);
        for (let g = 0; g < shape.groupCount; g++) {
            const edges = [0, 1, 2, 3].filter(d => shape.group[d] === g && shape.edges[d]);
            if (edges.length === 0) continue;
            nodeAt.set(`${i}:${g}`, nodes.length);
            nodes.push({ cell: i, group: g, edges, types: new Set(edges.map(d => shape.edges[d])), links: [], exits: [] });
        }
    }
    let openEnds = 0;
    const ends = [];   // つながっていない端：{ node, type, target（向いたマスの番号）, dead（描いてあるマスに向いていて、もうつながらない）}
    nodes.forEach((node, n) => {
        const c = cells[node.cell];
        const shape = shapeOf(c.kind, c.o);
        const x = node.cell % SIZE;
        const y = Math.floor(node.cell / SIZE);
        node.edges.forEach(d => {
            const t = shape.edges[d];
            const nx = x + DIR[d][0];
            const ny = y + DIR[d][1];
            if (!inside(nx, ny)) {
                const exit = exitAt(nx, ny);
                if (exit && exit.type === t) node.exits.push(exit.id);
                return;   // 外周に向いた端は減点しない
            }
            const other = cells[index(nx, ny)];
            const os = other ? shapeOf(other.kind, other.o) : null;
            if (!os || os.edges[opposite(d)] !== t) {
                openEnds++;
                ends.push({ node: n, type: t, target: index(nx, ny), dead: !!other });
                return;
            }
            const m = nodeAt.get(`${index(nx, ny)}:${os.group[opposite(d)]}`);
            node.links.push({ to: m, type: t });
        });
    });
    return { nodes, openEnds, ends };
}

// ネットワークごとの出口の数
export function networks(graph) {
    const { nodes } = graph;
    const seen = new Array(nodes.length).fill(false);
    const result = [];
    for (let s = 0; s < nodes.length; s++) {
        if (seen[s]) continue;
        const stack = [s];
        seen[s] = true;
        const exits = new Set();
        const members = [];
        while (stack.length) {
            const n = stack.pop();
            members.push(n);
            nodes[n].exits.forEach(e => exits.add(e));
            nodes[n].links.forEach(l => {
                if (!seen[l.to]) {
                    seen[l.to] = true;
                    stack.push(l.to);
                }
            });
        }
        result.push({ exits: [...exits], members });
    }
    return result;
}

// 一番長い道・線路（区間を一度ずつしか通らない一番長い道のりの、区間の数）
// budget を超えて探したら、それまでに見つかった一番長いものを返す（CPU の見積もりと、極端に枝分かれした盤で止まらないため）
export function longestRoute(graph, type, budget = Infinity) {
    const { nodes } = graph;
    const usable = nodes.map(n => n.types.has(type));
    const adj = nodes.map(n => n.links.filter(l => l.type === type).map(l => l.to));
    let best = 0;
    let steps = 0;
    const visited = new Array(nodes.length).fill(false);
    const dfs = (n, length) => {
        if (length > best) best = length;
        if (++steps > budget) return;
        for (const m of adj[n]) {
            if (visited[m]) continue;
            visited[m] = true;
            dfs(m, length + 1);
            visited[m] = false;
            if (steps > budget) return;
        }
    };
    // 端（つながりが1つ以下）から始めれば十分なことが多いが、ループもあるので全部の区間から始める
    const starts = nodes.map((_, i) => i).filter(i => usable[i] && adj[i].length > 0)
        .sort((a, b) => adj[a].length - adj[b].length);
    if (starts.length === 0) return usable.some(Boolean) ? 1 : 0;
    for (const s of starts) {
        visited[s] = true;
        dfs(s, 1);
        visited[s] = false;
        if (steps > budget) break;
    }
    return best;
}

export function scoreBoard(cells, { budget = 2e6 } = {}) {
    const graph = buildGraph(cells);
    const nets = networks(graph);
    const network = nets.reduce((sum, n) => sum + NETWORK_POINTS[Math.min(n.exits.length, 12)], 0);
    const road = longestRoute(graph, 'road', budget);
    const rail = longestRoute(graph, 'rail', budget);
    let center = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (CENTER(x, y) && cells[index(x, y)]) center++;
    const errors = graph.openEnds;
    return {
        network, road, rail, center, errors,
        total: network + road + rail + center - errors,
        networks: nets.filter(n => n.exits.length > 0).map(n => n.exits.length).sort((a, b) => b - a),
        exitsUsed: new Set(nets.flatMap(n => n.exits)).size
    };
}

export { EXITS };
