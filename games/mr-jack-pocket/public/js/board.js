/**
 * 盤：3×3 の街区タイルと、そのまわりの刑事の道（12マス）
 * タイルの場所は 行 × 3 + 列（左上が0）。向きは壁のある辺で表す：0 上・1 右・2 下・3 左
 * 刑事の道は左上から時計回りに 0〜11：
 *   上の辺 0・1・2（列0・1・2 の上。下を見る）
 *   右の辺 3・4・5（行0・1・2 の右。左を見る）
 *   下の辺 6・7・8（列2・1・0 の下。上を見る）
 *   左の辺 9・10・11（行2・1・0 の左。右を見る）
 */

export const SIZE = 3;
export const TRACK = 12;
export const UP = 0;
export const RIGHT = 1;
export const DOWN = 2;
export const LEFT = 3;
export const opposite = (side) => (side + 2) % 4;

// 道のマスから見えるタイルの並びと、タイルに入る辺
export function sightLine(space) {
    const side = Math.floor(space / 3);
    const k = space % 3;
    if (side === 0) return { from: UP, tiles: [k, 3 + k, 6 + k] };
    if (side === 1) return { from: RIGHT, tiles: [k * 3 + 2, k * 3 + 1, k * 3] };
    if (side === 2) return { from: DOWN, tiles: [6 + (2 - k), 3 + (2 - k), 2 - k] };
    return { from: LEFT, tiles: [(2 - k) * 3, (2 - k) * 3 + 1, (2 - k) * 3 + 2] };
}

// 道のマスの、画面の格子（5×5）での位置
export function spaceCell(space) {
    const side = Math.floor(space / 3);
    const k = space % 3;
    if (side === 0) return { row: 0, col: 1 + k };
    if (side === 1) return { row: 1 + k, col: 4 };
    if (side === 2) return { row: 4, col: 3 - k };
    return { row: 3 - k, col: 0 };
}
