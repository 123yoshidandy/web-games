import { describe, it, expect } from 'vitest';
import { initialBoard, legalMoves, flipsFor, applyMove, countStones, sqName, sqOf, BLACK, WHITE, EMPTY } from '../public/js/rules.js';
import { boardOf } from './helpers.js';

const names = (list) => list.map(sqName).sort();

describe('盤と最初の配置', () => {
    it('マスの名前は列 a〜h（左から）・行 1〜8（上から）', () => {
        expect(sqName(0)).toBe('a1');
        expect(sqName(7)).toBe('h1');
        expect(sqName(56)).toBe('a8');
        expect(sqOf('e4')).toBe(28);
        for (let sq = 0; sq < 64; sq++) expect(sqOf(sqName(sq))).toBe(sq);
    });

    it('標準の向き：白が d4・e5、黒が e4・d5', () => {
        const board = initialBoard();
        expect(board[sqOf('d4')]).toBe(WHITE);
        expect(board[sqOf('e5')]).toBe(WHITE);
        expect(board[sqOf('e4')]).toBe(BLACK);
        expect(board[sqOf('d5')]).toBe(BLACK);
        expect(countStones(board)).toEqual({ black: 2, white: 2, empty: 60 });
    });

    it('最初に黒が置けるのは d3・c4・f5・e6 の4か所', () => {
        expect(names(legalMoves(initialBoard(), BLACK))).toEqual(['c4', 'd3', 'e6', 'f5']);
        expect(names(legalMoves(initialBoard(), WHITE))).toEqual(['c5', 'd6', 'e3', 'f4']);
    });
});

describe('はさんで返す', () => {
    it('縦・横・斜めの8方向を、まとめて返す', () => {
        const board = boardOf([
            'X..X..X.',
            '.O.O.O..',
            '..OOO...',
            'XOO.OOOX',
            '..OOO...',
            '.O.O.O..',
            'X..X..X.',
            '........'
        ]);
        const flips = flipsFor(board, sqOf('d4'), BLACK);
        // 右だけ3つ、ほかの7方向は2つずつ
        expect(flips).toHaveLength(17);
        const { board: next } = applyMove(board, sqOf('d4'), BLACK);
        expect(countStones(next)).toEqual({ black: 8 + 1 + 17, white: 0, empty: 64 - 26 });
    });

    it('自分の石でふさがっていない列は返さない（空きや盤の端で終わる）', () => {
        const board = boardOf([
            '.OO.....',
            'O.......',
            'O.......',
            '........',
            '........',
            '........',
            '........',
            '.......X'
        ]);
        expect(flipsFor(board, sqOf('a1'), BLACK)).toEqual([]);
        expect(flipsFor(board, sqOf('d1'), BLACK)).toEqual([]);
        expect(legalMoves(board, BLACK)).toEqual([]);
    });

    it('盤の端で、反対の端に回り込まない', () => {
        // a2 から左は盤の外。マスの番号では h1（7）・g1（6）と続くが、つながっていない
        const board = boardOf([
            '......XO',
            '........',
            '........',
            '........',
            '........',
            '........',
            '........',
            '........'
        ]);
        expect(flipsFor(board, sqOf('a2'), BLACK)).toEqual([]);
        expect(flipsFor(board, sqOf('a2'), WHITE)).toEqual([]);
    });

    it('返った石が、さらに別の石をはさんでも返らない（連鎖しない）', () => {
        const board = boardOf([
            'XO......',
            '.O......',
            '.X......',
            '........',
            '........',
            '........',
            '........',
            '........'
        ]);
        const { board: next, flips } = applyMove(board, sqOf('c1'), BLACK);
        expect(names(flips)).toEqual(['b1']);
        expect(next[sqOf('b2')]).toBe(WHITE);
    });

    it('置いたあとの盤を返し、元の盤は変えない。置かれたマスや置けないマスでは何も返らない', () => {
        const board = initialBoard();
        const copy = [...board];
        const { board: next, flips } = applyMove(board, sqOf('d3'), BLACK);
        expect(board).toEqual(copy);
        expect(names(flips)).toEqual(['d4']);
        expect(next[sqOf('d3')]).toBe(BLACK);
        expect(next[sqOf('d4')]).toBe(BLACK);
        expect(flipsFor(board, sqOf('d4'), BLACK)).toEqual([]);
        expect(flipsFor(board, sqOf('a1'), BLACK)).toEqual([]);
        expect(board[sqOf('a1')]).toBe(EMPTY);
    });
});
