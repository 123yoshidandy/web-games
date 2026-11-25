/**
 * 盤と石の返し方（DOM に依存しない。ゲーム・画面・テストで共通に使う。CPU は速さのために engine.js を使う）
 *
 * 盤は 8×8。マスの番号は r*8+c（r は上から 0〜7、c は左から 0〜7）。棋譜の名前は列 a〜h・行 1〜8（a1 が左上）
 * 石：0 空き／1 黒／2 白。席0が黒（先手）、席1が白
 * 最初の配置は標準の向き：黒が右上（e4）と左下（d5）、白が左上（d4）と右下（e5）
 */

export const SIZE = 8;
export const CELLS = 64;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;
export const colorOf = (seat) => seat + 1;
export const other = (color) => 3 - color;

const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

export const sqName = (sq) => `${'abcdefgh'[sq % 8]}${Math.floor(sq / 8) + 1}`;
export const sqOf = (name) => (name.charCodeAt(1) - 49) * 8 + (name.charCodeAt(0) - 97);

export function initialBoard() {
    const board = Array(CELLS).fill(EMPTY);
    board[sqOf('d4')] = WHITE;
    board[sqOf('e4')] = BLACK;
    board[sqOf('d5')] = BLACK;
    board[sqOf('e5')] = WHITE;
    return board;
}

// color が sq に置いたときに返る石（8方向）。置けないなら空の配列
export function flipsFor(board, sq, color) {
    if (board[sq] !== EMPTY) return [];
    const r0 = Math.floor(sq / 8);
    const c0 = sq % 8;
    const opp = other(color);
    const flips = [];
    for (const [dr, dc] of DIRS) {
        const line = [];
        let r = r0 + dr;
        let c = c0 + dc;
        while (r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === opp) {
            line.push(r * 8 + c);
            r += dr;
            c += dc;
        }
        if (line.length && r >= 0 && r < 8 && c >= 0 && c < 8 && board[r * 8 + c] === color) flips.push(...line);
    }
    return flips;
}

export function legalMoves(board, color) {
    const list = [];
    for (let sq = 0; sq < CELLS; sq++) if (flipsFor(board, sq, color).length) list.push(sq);
    return list;
}

// 置いたあとの盤（もとの盤は変えない）と返った石
export function applyMove(board, sq, color) {
    const flips = flipsFor(board, sq, color);
    const next = [...board];
    next[sq] = color;
    flips.forEach(f => { next[f] = color; });
    return { board: next, flips };
}

export function countStones(board) {
    let black = 0;
    let white = 0;
    board.forEach(s => {
        if (s === BLACK) black++;
        else if (s === WHITE) white++;
    });
    return { black, white, empty: CELLS - black - white };
}
