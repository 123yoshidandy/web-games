/**
 * 得点の計算に使う道具（地の動物の並びを調べる）
 * tokens：key → 動物（地のトークンだけを抜き出したもの）
 */

import { key, parseKey, neighbors, DIRS } from './hex.js';

export const tokenMap = (env) => {
    const out = {};
    Object.entries(env).forEach(([k, spot]) => { if (spot.token) out[k] = spot.token; });
    return out;
};

// その動物のマスの key の一覧
export const cellsOf = (tokens, animal) => Object.keys(tokens).filter(k => tokens[k] === animal);

// となりのマスの key（地にトークンがあるかは見ない）
export const adjacentKeys = (k) => {
    const [q, r] = parseKey(k);
    return neighbors(q, r).map(([x, y]) => key(x, y));
};

// 動物ごとの群れ（となり合う同じ動物のまとまり）
export function groups(tokens, animal) {
    const cells = new Set(cellsOf(tokens, animal));
    const seen = new Set();
    const out = [];
    cells.forEach(start => {
        if (seen.has(start)) return;
        const group = [];
        const queue = [start];
        seen.add(start);
        while (queue.length) {
            const k = queue.pop();
            group.push(k);
            adjacentKeys(k).forEach(nk => {
                if (cells.has(nk) && !seen.has(nk)) {
                    seen.add(nk);
                    queue.push(nk);
                }
            });
        }
        out.push(group);
    });
    return out;
}

// となりのトークン（動物の配列。同じ動物も含む）
export const adjacentAnimals = (tokens, k) => adjacentKeys(k).map(nk => tokens[nk]).filter(Boolean);

// 点数表を引く（list[0] が1つ分。範囲を超えたら最後の値）
export const lookup = (list, n) => (n <= 0 ? 0 : list[Math.min(n, list.length) - 1]);

// まっすぐな向き（3本の軸）。DIRS の 0〜2 を使い、逆向きは 3〜5
export const AXES = [0, 1, 2];
export const step = (k, d) => {
    const [q, r] = parseKey(k);
    return key(q + DIRS[d][0], r + DIRS[d][1]);
};

// 2つのマスが同じ直線の上にあれば、a から b への向き（なければ -1）と、あいだのマス
export function lineBetween(a, b) {
    const [q1, r1] = parseKey(a);
    const [q2, r2] = parseKey(b);
    const dq = q2 - q1;
    const dr = r2 - r1;
    const n = Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr));
    if (n === 0) return null;
    const d = DIRS.findIndex(([x, y]) => x * n === dq && y * n === dr);
    if (d < 0) return null;
    const between = [];
    for (let i = 1; i < n; i++) between.push(key(q1 + DIRS[d][0] * i, r1 + DIRS[d][1] * i));
    return { dir: d, between, length: n };
}
