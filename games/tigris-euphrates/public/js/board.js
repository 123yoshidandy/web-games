/**
 * 盤（横16マス × 縦11マス）
 * マスの番号は 行 × 16 + 列（左上が0）。となりは上下左右の4マス
 *
 * 地図（Hans im Glück 1997 の盤。README に資料と照らし合わせた結果を書く）
 * '.' 陸、'~' 川、'T' 最初から神殿と宝物があるマス、'C' そのうち縁取りのある宝物（商人が先に取る）
 */

export const COLS = 16;
export const ROWS = 11;
export const CELL_COUNT = COLS * ROWS;

export const MAP = [
    '....~~~~~.T.~...',
    '.C..~.......~..C',
    '...~~T......~~..',
    '~~~~.........~~~',
    '.............T~~',
    '..............~.',
    '~~~~....T...~~~.',
    '.C.~~~~.....~...',
    '......~~~~~~~.C.',
    '.....T..........',
    '..........T.....'
];

export const rowOf = (cell) => Math.floor(cell / COLS);
export const colOf = (cell) => cell % COLS;
export const cellOf = (row, col) => (row >= 0 && row < ROWS && col >= 0 && col < COLS ? row * COLS + col : -1);

// となりのマス（上・右・下・左。盤の外は除く）
export const NEIGHBORS = Array.from({ length: CELL_COUNT }, (_, c) => {
    const r = rowOf(c);
    const k = colOf(c);
    return [cellOf(r - 1, k), cellOf(r, k + 1), cellOf(r + 1, k), cellOf(r, k - 1)].filter(x => x >= 0);
});

export const RIVER = new Set();
// 商人が宝物を取るとき、先に取る宝物（盤の縁取りのある宝物）
export const CORNER_TREASURES = new Set();
export const START_TEMPLES = [];
MAP.forEach((line, r) => [...line].forEach((ch, k) => {
    if (ch === '~') RIVER.add(cellOf(r, k));
    if (ch === 'T' || ch === 'C') START_TEMPLES.push(cellOf(r, k));
    if (ch === 'C') CORNER_TREASURES.add(cellOf(r, k));
}));

export const isRiver = (cell) => RIVER.has(cell);


// 2×2 の正方形（左上のマス）のうち、cell を含むもの
export function squaresWith(cell) {
    const r = rowOf(cell);
    const k = colOf(cell);
    const out = [];
    for (const dr of [-1, 0]) {
        for (const dk of [-1, 0]) {
            const top = cellOf(r + dr, k + dk);
            if (top >= 0 && rowOf(top) + 1 < ROWS && colOf(top) + 1 < COLS) out.push(top);
        }
    }
    return out;
}

export const squareCells = (top) => [top, top + 1, top + COLS, top + COLS + 1];
