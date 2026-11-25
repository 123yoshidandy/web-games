/**
 * 盤の形（DOM に依存しない）
 * 大きな六角形の盤に、平らな辺を上にした小さな六角が縦の列に並ぶ。真ん中の列は15マスで、中心からの距離7まで（169マス）
 * 位置は軸座標 (q, r)：q は列（右へ +1）、r は列の中を下へ。距離 = (|q| + |r| + |q + r|) / 2
 * 使う範囲は人数で変わる：1人と2人は距離5まで（91マス）、3人は6まで（127マス）、4人は7まで（169マス）
 * 色の記号が印刷された6マスは、距離5の六角形の頂点（上：紫、右上：赤、右下：緑、下：青、左下：橙、左上：黄）
 */

export const BOARD_RADIUS = 7;

// 6方向（右下・右上・上・左上・左下・下）。i と i+3 が逆向き
export const DIRECTIONS = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];

const distance = (q, r) => (Math.abs(q) + Math.abs(r) + Math.abs(q + r)) / 2;

// マスの番号 → { q, r, ring }（列ごとに上から順）
export const CELLS = [];
for (let q = -BOARD_RADIUS; q <= BOARD_RADIUS; q++) {
    for (let r = -BOARD_RADIUS; r <= BOARD_RADIUS; r++) {
        if (distance(q, r) <= BOARD_RADIUS) CELLS.push({ q, r, ring: distance(q, r) });
    }
}
export const CELL_COUNT = CELLS.length;

const INDEX = new Map(CELLS.map(({ q, r }, i) => [`${q},${r}`, i]));
export const cellAt = (q, r) => INDEX.get(`${q},${r}`) ?? -1;

// マスごとの、6方向のとなり（盤の外は -1）
export const NEIGHBORS = CELLS.map(({ q, r }) => DIRECTIONS.map(([dq, dr]) => cellAt(q + dq, r + dr)));

// 印刷された記号（マスの番号 → 色）
export const START_SYMBOLS = new Map([
    [cellAt(0, -5), 'purple'],
    [cellAt(5, -5), 'red'],
    [cellAt(5, 0), 'green'],
    [cellAt(0, 5), 'blue'],
    [cellAt(-5, 5), 'orange'],
    [cellAt(-5, 0), 'yellow']
]);

// 人数（と遊び方）で使う範囲
export const radiusFor = (playerCount) => (playerCount <= 2 ? 5 : playerCount === 3 ? 6 : 7);

// a と b がとなりなら、a から見た向き（0〜5）。となりでなければ -1
export const directionBetween = (a, b) => NEIGHBORS[a].indexOf(b);
