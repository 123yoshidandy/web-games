/**
 * 五目並べの盤と、並びの判定（DOM に依存しない）
 * 盤は長さ size×size の配列（行ごと。0 空き・1 黒・2 白）。点の番号は 行×size＋列
 * 自由ルール：縦・横・斜めのどれかに、自分の石が5つ以上（長連を含む）並んだら勝ち。禁じ手はない
 */

export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const SIZES = [15, 10];          // 15路（ふつうの五目並べ）と、10路（前の版の盤）
export const WIN_LENGTH = 5;
export const COLOR_NAME = { [BLACK]: '黒', [WHITE]: '白' };
export const DIRECTIONS = [[0, 1], [1, 0], [1, 1], [1, -1]];   // 横・縦・右下がり・右上がり

export const opponent = (color) => 3 - color;
export const createBoard = (size) => new Array(size * size).fill(EMPTY);

// 列は A〜、行は下から 1〜（15路の真ん中は H8）
const LETTERS = 'ABCDEFGHIJKLMNOPQRS';
export function sqName(sq, size) {
    return `${LETTERS[sq % size]}${size - Math.floor(sq / size)}`;
}

// 盤の目印の点（15路は天元と4つの星、10路は4つ）
export function starPoints(size) {
    const at = (r, c) => r * size + c;
    if (size === 15) return [at(3, 3), at(3, 11), at(7, 7), at(11, 3), at(11, 11)];
    if (size === 10) return [at(2, 2), at(2, 7), at(7, 2), at(7, 7)];
    return [];
}

// 最初の一手に打つ点（盤の真ん中。偶数の盤は真ん中の4点の左上）
export const centerPoint = (size) => Math.floor((size - 1) / 2) * size + Math.floor((size - 1) / 2);

// sq の石から、方向 (dr, dc) に同じ色が何個続くか（sq は数えない）
function run(board, size, sq, dr, dc, color) {
    let r = Math.floor(sq / size) + dr;
    let c = (sq % size) + dc;
    let n = 0;
    while (r >= 0 && r < size && c >= 0 && c < size && board[r * size + c] === color) {
        n++;
        r += dr;
        c += dc;
    }
    return n;
}

// sq の石を含む5つ以上の並び（石の番号の配列。いちばん長い並び）。なければ null
export function winningLine(board, size, sq) {
    const color = board[sq];
    if (color === EMPTY) return null;
    let best = null;
    for (const [dr, dc] of DIRECTIONS) {
        const back = run(board, size, sq, -dr, -dc, color);
        const ahead = run(board, size, sq, dr, dc, color);
        if (back + ahead + 1 < WIN_LENGTH || (best && back + ahead + 1 <= best.length)) continue;
        const r0 = Math.floor(sq / size) - back * dr;
        const c0 = (sq % size) - back * dc;
        best = Array.from({ length: back + ahead + 1 }, (_, i) => (r0 + i * dr) * size + c0 + i * dc);
    }
    return best;
}

export const isFull = (board) => !board.includes(EMPTY);
