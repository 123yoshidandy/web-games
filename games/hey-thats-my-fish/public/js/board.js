/**
 * 盤の形（DOM に依存しない）
 * 六角の氷を横に並べた8列。上から 7・8・7・8・7・8・7・8 枚（ルールブックの並べ方）で、合わせて60枚
 * マスの番号は、上の列から左から順に 0〜59
 * 位置は「倍の x」で持つ：7枚の列は半マス右にずれるので、x = 2×列の中の位置 + 1、8枚の列は x = 2×列の中の位置
 * となりは (x±2, y) と (x±1, y±1) の6方向
 */

export const ROWS = [7, 8, 7, 8, 7, 8, 7, 8];
export const CELL_COUNT = ROWS.reduce((s, n) => s + n, 0);

// 6方向（倍の x の差と、y の差）。右から時計回り
export const DIRECTIONS = [[2, 0], [1, 1], [-1, 1], [-2, 0], [-1, -1], [1, -1]];

const ROW_START = ROWS.map((_, r) => ROWS.slice(0, r).reduce((s, n) => s + n, 0));

// マスの番号 → { x, y }
export const CELLS = ROWS.flatMap((n, y) => Array.from({ length: n }, (_, i) => ({ x: 2 * i + (n === 7 ? 1 : 0), y })));

// { x, y } → マスの番号（盤の外なら -1）
export function cellAt(x, y) {
    if (y < 0 || y >= ROWS.length) return -1;
    const offset = ROWS[y] === 7 ? 1 : 0;
    const d = x - offset;
    if (d < 0 || d % 2 !== 0) return -1;
    const i = d / 2;
    return i < ROWS[y] ? ROW_START[y] + i : -1;
}

// マスごとの、6方向のとなり（盤の外は -1）
export const NEIGHBORS = CELLS.map(({ x, y }) => DIRECTIONS.map(([dx, dy]) => cellAt(x + dx, y + dy)));

// cell から動ける先（氷が残っていて、ペンギンがいないマスを、まっすぐ何マスでも。穴とペンギンは越えられない）
// alive(c)：氷が残っているか、occupied(c)：ペンギンがいるか
export function slides(cell, alive, occupied) {
    const out = [];
    for (let d = 0; d < 6; d++) {
        let c = NEIGHBORS[cell][d];
        while (c >= 0 && alive(c) && !occupied(c)) {
            out.push(c);
            c = NEIGHBORS[c][d];
        }
    }
    return out;
}

// 2つのマスが、まっすぐの線の上にあれば、その間のマス（両端を除く）。なければ null
export function between(from, to) {
    for (let d = 0; d < 6; d++) {
        const path = [];
        let c = NEIGHBORS[from][d];
        while (c >= 0) {
            if (c === to) return path;
            path.push(c);
            c = NEIGHBORS[c][d];
        }
    }
    return null;
}
