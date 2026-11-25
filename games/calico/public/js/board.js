/**
 * キルトの盤の形
 * 7×7 の六角のマス（先の尖った向き）。奇数の行が半マス右にずれる。マスの番号は 行×7＋列
 * いちばん外の1周（24マス）は、盤に印刷された縁のパッチ。内側の5×5 のうち3マスが目標タイルの置き場、残り22マスにパッチを置く
 */

export const SIZE = 7;
export const CELL_COUNT = SIZE * SIZE;
export const cellOf = (r, c) => r * SIZE + c;
export const rowOf = (cell) => Math.floor(cell / SIZE);
export const colOf = (cell) => cell % SIZE;

// 縁のマス（盤のデータの並び：上の行を左から、左の列を上から、下の行を左から、右の列を下から）
export const BORDER = [0, 1, 2, 3, 4, 5, 6, 7, 14, 21, 28, 35, 42, 43, 44, 45, 46, 47, 48, 41, 34, 27, 20, 13];
// 目標タイルの置き場（2行3列・3行4列・4行2列）
export const GOAL_CELLS = [cellOf(2, 3), cellOf(3, 4), cellOf(4, 2)];
// パッチを置くマス（22）
export const OPEN_CELLS = Array.from({ length: CELL_COUNT }, (_, i) => i)
    .filter(i => !BORDER.includes(i) && !GOAL_CELLS.includes(i));

// 軸座標（q, r）。行は r、列から q を作る（奇数の行が右にずれる配置）
export const axialOf = (cell) => {
    const r = rowOf(cell);
    return [colOf(cell) - (r - (r & 1)) / 2, r];
};
export const cellFromAxial = (q, r) => {
    if (r < 0 || r >= SIZE) return -1;
    const c = q + (r - (r & 1)) / 2;
    if (c < 0 || c >= SIZE) return -1;
    return cellOf(r, c);
};

// 6方向（東・北東・北西・西・南西・南東）
export const DIRS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

export const NEIGHBORS = Array.from({ length: CELL_COUNT }, (_, cell) => {
    const [q, r] = axialOf(cell);
    return DIRS.map(([dq, dr]) => cellFromAxial(q + dq, r + dr)).filter(c => c >= 0);
});

// 画面の座標（マスの中心から角までを size とする）
export function cellCenter(cell, size) {
    const w = Math.sqrt(3) * size;
    const r = rowOf(cell);
    return { x: colOf(cell) * w + (r & 1 ? w / 2 : 0), y: r * size * 1.5 };
}
