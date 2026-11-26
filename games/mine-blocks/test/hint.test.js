import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// アシストのモジュールは <script> で読む作りなので、関数だけを取り出して確かめる（画面の部分は呼ばない）
const code = readFileSync(new URL('../js/assist.js', import.meta.url), 'utf8');
const { suggestPiece, pieceCells } = new Function(`${code}\nreturn { suggestPiece, pieceCells };`)();

const blocks = [
    { grid: [[1, 1], [1, 0]] },
    { grid: [[0, 1], [1, 1]] },
    { grid: [[1]] }
];
const solution = [
    { blockIndex: 0, row: 0, col: 0 },
    { blockIndex: 1, row: 0, col: 1 }
];
const emptyBoard = () => Array.from({ length: 3 }, () => Array(3).fill(null));
const put = (board, blockIndex, row, col) => {
    pieceCells(blocks[blockIndex], row, col).forEach(([r, c]) => { board[r][c] = { blockIndex }; });
    return board;
};

describe('ヒント（おすすめのピース）', () => {
    it('何も置いていなければ、想定解のピースと置き先のマスを返す', () => {
        const hint = suggestPiece(solution, emptyBoard(), blocks);
        expect(hint).toMatchObject({ blockIndex: 0, row: 0, col: 0, blocking: [] });
        expect(hint.cells).toEqual([[0, 0], [0, 1], [1, 0]]);
    });

    it('正しく置けたピースは飛ばして、次のピースを返す', () => {
        const hint = suggestPiece(solution, put(emptyBoard(), 0, 0, 0), blocks);
        expect(hint).toMatchObject({ blockIndex: 1, row: 0, col: 1 });
    });

    it('置き先をふさいでいるピースが少ないものを先に選び、ふさいでいるピースを返す', () => {
        // ピース2（ダミー）が両方の置き先にかかり、ピース1の置き先だけをふさぐ位置にある
        const board = put(emptyBoard(), 2, 1, 2);
        expect(suggestPiece(solution, board, blocks)).toMatchObject({ blockIndex: 0, blocking: [] });
        const blocked = put(put(emptyBoard(), 0, 0, 0), 2, 1, 2);
        expect(suggestPiece(solution, blocked, blocks)).toMatchObject({ blockIndex: 1, blocking: [2] });
    });

    it('全部を想定解どおりに置けていれば null', () => {
        const board = put(put(emptyBoard(), 0, 0, 0), 1, 0, 1);
        expect(suggestPiece(solution, board, blocks)).toBe(null);
    });
});
