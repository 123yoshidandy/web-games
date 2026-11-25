/**
 * 20×20 の六角マスの座標
 * マスは 0〜399 の番号（cell = 行 × 20 + 列）で持つ。尖った頭の六角形を横に並べ、奇数の行を半マス右にずらす（odd-r）
 * 盤面1枚は 10×10。行の数が偶数なので、4枚を2×2に並べても、ずれ方がそろう
 */

export const SIZE = 20;
export const CELLS = SIZE * SIZE;

export const rowOf = (cell) => Math.floor(cell / SIZE);
export const colOf = (cell) => cell % SIZE;
export const cellAt = (r, c) => (r >= 0 && r < SIZE && c >= 0 && c < SIZE ? r * SIZE + c : -1);

// 方向は 0：右、1：右上、2：左上、3：左、4：左下、5：右下。同じ方向に進み続けると、まっすぐの列になる
const STEPS = {
    even: [[0, 1], [-1, 0], [-1, -1], [0, -1], [1, -1], [1, 0]],
    odd: [[0, 1], [-1, 1], [-1, 0], [0, -1], [1, 0], [1, 1]]
};

export function step(cell, dir) {
    if (cell < 0) return -1;
    const r = rowOf(cell);
    const [dr, dc] = STEPS[r % 2 ? 'odd' : 'even'][dir];
    return cellAt(r + dr, colOf(cell) + dc);
}

// 方向ごとの隣（盤の外は -1）。何度も使うので先に作っておく
export const NEIGHBORS_BY_DIR = Array.from({ length: CELLS }, (_, cell) => [0, 1, 2, 3, 4, 5].map(dir => step(cell, dir)));
export const NEIGHBORS = NEIGHBORS_BY_DIR.map(list => list.filter(n => n >= 0));

// 盤の端（いちばん外側の行と列）
export const isEdge = (cell) => {
    const r = rowOf(cell);
    const c = colOf(cell);
    return r === 0 || c === 0 || r === SIZE - 1 || c === SIZE - 1;
};

// 4つの区画（盤面1枚ずつ）：0 左上、1 右上、2 左下、3 右下
export const sectorOf = (cell) => (rowOf(cell) >= 10 ? 2 : 0) + (colOf(cell) >= 10 ? 1 : 0);
