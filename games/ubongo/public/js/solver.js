/**
 * 盤面をピースでちょうど埋める解き方を探す（後戻りの探索）
 * まだ埋まっていない一番上・一番左のマスを、どれかのピースのどれかの向きの「最初のマス」で埋める
 */

import { uniqueOrientations, placedCells, shapeCells } from './pieces.js';

const key = (x, y) => `${x},${y}`;

// rows：盤面の形。ids：使うピース。fixed：もう置いてあるピース（そのまま使う）。limit：探す解の数の上限
// 解（置き方の配列。fixed を含む）の一覧を返す
export function solve(rows, ids, { fixed = [], limit = 1 } = {}) {
    const board = shapeCells(rows);
    const inside = new Set(board.map(([x, y]) => key(x, y)));
    const covered = new Set();
    const used = new Set();
    for (const placement of fixed) {
        if (!ids.includes(placement.id) || used.has(placement.id)) return [];
        for (const [x, y] of placedCells(placement)) {
            const k = key(x, y);
            if (!inside.has(k) || covered.has(k)) return [];
            covered.add(k);
        }
        used.add(placement.id);
    }
    const order = board.slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const area = ids.reduce((sum, id) => sum + uniqueOrientations(id)[0].cells.length, 0);
    if (area !== board.length) return [];

    const solutions = [];
    const stack = [...fixed];
    const search = () => {
        if (solutions.length >= limit) return;
        const target = order.find(([x, y]) => !covered.has(key(x, y)));
        if (!target) {
            solutions.push(stack.map(p => ({ ...p })));
            return;
        }
        for (const id of ids) {
            if (used.has(id)) continue;
            for (const { rot, flip, cells } of uniqueOrientations(id)) {
                const [ax, ay] = cells[0];
                const ox = target[0] - ax;
                const oy = target[1] - ay;
                const keys = cells.map(([cx, cy]) => key(cx + ox, cy + oy));
                if (!keys.every(k => inside.has(k) && !covered.has(k))) continue;
                keys.forEach(k => covered.add(k));
                used.add(id);
                stack.push({ id, rot, flip, x: ox, y: oy });
                search();
                stack.pop();
                used.delete(id);
                keys.forEach(k => covered.delete(k));
                if (solutions.length >= limit) return;
            }
        }
    };
    search();
    return solutions;
}

// 置き方が盤面をちょうど埋めているか（ピースは ids を1つずつ全部使う）
export function isSolution(rows, ids, placements) {
    if (!Array.isArray(placements) || placements.length !== ids.length) return false;
    const inside = new Set(shapeCells(rows).map(([x, y]) => key(x, y)));
    const covered = new Set();
    const seen = new Set();
    for (const placement of placements) {
        if (!placement || !ids.includes(placement.id) || seen.has(placement.id)) return false;
        if (![placement.rot, placement.flip, placement.x, placement.y].every(Number.isInteger)) return false;
        if (placement.flip !== 0 && placement.flip !== 1) return false;
        seen.add(placement.id);
        for (const [x, y] of placedCells(placement)) {
            const k = key(x, y);
            if (!inside.has(k) || covered.has(k)) return false;
            covered.add(k);
        }
    }
    return covered.size === inside.size;
}
