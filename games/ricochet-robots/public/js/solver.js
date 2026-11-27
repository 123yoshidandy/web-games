/**
 * 最短手の探索（反復深化の深さ優先探索 IDA*）
 * - 下限の見積もり：目標のロボットが「壁までの間のどこでも止まれる」とした手数（ほかのロボットは数えない）。実際の手数より大きくならない
 * - 同じ配置（目標のロボットの位置と、ほかのロボットの位置の組。ほかは並べ替えて同じものとみなす）を、残りの手数とともに覚えて切る
 * - 打ち切りは時間ではなく、試した局面の数（budget）で決める。端末の速さで答えが変わらず、記録の再現と CPU が決定的になる
 * 結果：{ count, moves: [[ロボット, 向き], ...] }。見つからなければ null（解けない、または budget を使い切った）
 */

import { CELLS, DIR_BITS, DIR_DELTA, VORTEX } from './board.js';

export const MAX_DEPTH = 20;
export const DEFAULT_BUDGET = 2_500_000;
const TT_LIMIT = 1_500_000;
const CACHE_LIMIT = 200;

const prepared = new WeakMap();   // 壁の配列 → 止まる位置の表
const results = new Map();        // 局面 → 結果（同じ局面を何度も解かない。サーバーでは操作のたびに局面を作り直すため）

function prepare(walls) {
    let tables = prepared.get(walls);
    if (tables) return tables;
    const stop = new Int16Array(4 * CELLS);
    for (let dir = 0; dir < 4; dir++) {
        for (let cell = 0; cell < CELLS; cell++) {
            let at = cell;
            while (!(walls[at] & DIR_BITS[dir])) at += DIR_DELTA[dir];
            stop[dir * CELLS + cell] = at;
        }
    }
    tables = { stop, sig: walls.join('.'), dist: new Map() };
    prepared.set(walls, tables);
    return tables;
}

// 目標のマスまでの、どこでも止まれるとしたときの手数（着けないマスは 255）
function distanceTo(walls, tables, target) {
    let dist = tables.dist.get(target);
    if (dist) return dist;
    dist = new Uint8Array(CELLS).fill(255);
    dist[target] = 0;
    const queue = [target];
    for (let head = 0; head < queue.length; head++) {
        const cell = queue[head];
        for (let dir = 0; dir < 4; dir++) {
            let at = cell;
            while (!(walls[at] & DIR_BITS[dir])) {
                at += DIR_DELTA[dir];
                if (dist[at] === 255) {
                    dist[at] = dist[cell] + 1;
                    queue.push(at);
                }
            }
        }
    }
    tables.dist.set(target, dist);
    return dist;
}

/**
 * walls：マスごとの壁、robots：ロボットの位置、targetId：目標の id（VORTEX ならどのロボットでも）、targetCell：目標のマス
 */
export function solve(walls, robots, targetId, targetCell, { budget = DEFAULT_BUDGET, maxDepth = MAX_DEPTH } = {}) {
    const tables = prepare(walls);
    const key = `${tables.sig}|${robots.join(',')}|${targetId}|${targetCell}|${budget}|${maxDepth}`;
    if (results.has(key)) return results.get(key);
    const result = search(walls, tables, robots, targetId, targetCell, budget, maxDepth);
    results.set(key, result);
    if (results.size > CACHE_LIMIT) results.delete(results.keys().next().value);
    return result;
}

function search(walls, tables, robots, targetId, targetCell, budget, maxDepth) {
    const { stop } = tables;
    const dist = distanceTo(walls, tables, targetCell);
    const n = robots.length;
    const pos = Int16Array.from(robots);
    const anyRobot = targetId === VORTEX;
    const main = anyRobot ? -1 : Math.floor(targetId / 4);
    // 試す順：目標のロボットを先に
    const order = anyRobot ? [...Array(n).keys()] : [main, ...[...Array(n).keys()].filter(i => i !== main)];
    const others = new Int16Array(n);
    const tt = new Map();
    const path = [];
    let nodes = 0;

    const heuristic = () => {
        if (!anyRobot) return dist[pos[main]];
        let best = 255;
        for (let i = 0; i < n; i++) if (dist[pos[i]] < best) best = dist[pos[i]];
        return best;
    };

    // 局面の鍵：目標のロボットの位置と、ほかのロボットの位置を小さい順に（渦は全部を小さい順に）
    const keyOf = () => {
        let m = 0;
        for (let i = 0; i < n; i++) if (i !== main) others[m++] = pos[i];
        for (let i = 1; i < m; i++) {
            const v = others[i];
            let j = i - 1;
            while (j >= 0 && others[j] > v) { others[j + 1] = others[j]; j--; }
            others[j + 1] = v;
        }
        let key = main >= 0 ? pos[main] : 0;
        for (let i = 0; i < m; i++) key = key * 256 + others[i];
        return key;
    };

    // ロボット r を dir に動かした先
    const moveTo = (r, dir) => {
        const from = pos[r];
        let to = stop[dir * CELLS + from];
        if (to === from) return from;
        const delta = DIR_DELTA[dir];
        let steps = (to - from) / delta;
        for (let i = 0; i < n; i++) {
            if (i === r) continue;
            const diff = pos[i] - from;
            if (diff % delta !== 0) continue;
            const k = diff / delta;
            if (k >= 1 && k <= steps) steps = k - 1;
        }
        return from + delta * steps;
    };

    const dfs = (depth, bound) => {
        if (++nodes > budget) throw BUDGET;
        const h = heuristic();
        if (h === 0) return true;
        if (depth + h > bound) return false;
        const key = keyOf();
        const remaining = bound - depth;
        const seen = tt.get(key);
        if (seen !== undefined && seen >= remaining) return false;
        if (tt.size >= TT_LIMIT) tt.clear();
        tt.set(key, remaining);
        for (const r of order) {
            // 残りの手数がちょうど下限なら、目標のロボット以外を動かしても間に合わない
            if (!anyRobot && r !== main && remaining - 1 < h) continue;
            for (let dir = 0; dir < 4; dir++) {
                const from = pos[r];
                const to = moveTo(r, dir);
                if (to === from) continue;
                pos[r] = to;
                path.push(r * 4 + dir);
                if (dfs(depth + 1, bound)) return true;
                path.pop();
                pos[r] = from;
            }
        }
        return false;
    };

    const start = heuristic();
    if (start === 255) return null;
    try {
        for (let bound = start; bound <= maxDepth; bound++) {
            if (dfs(0, bound)) return { count: path.length, moves: path.map(code => [Math.floor(code / 4), code % 4]) };
        }
    } catch (error) {
        if (error !== BUDGET) throw error;
    }
    return null;
}

const BUDGET = { budget: true };
