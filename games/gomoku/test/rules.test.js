import { describe, it, expect } from 'vitest';
import { winningLine, sqName, starPoints, centerPoint, isFull, createBoard, BLACK, WHITE, SIZES } from '../public/js/rules.js';
import { boardOf, at } from './helpers.js';

describe('盤と座標', () => {
    it('15路と10路。座標は列が A〜、行が下から', () => {
        expect(SIZES).toEqual([15, 10]);
        expect(sqName(at(15, 7, 7), 15)).toBe('H8');
        expect(sqName(at(15, 0, 0), 15)).toBe('A15');
        expect(sqName(at(10, 9, 9), 10)).toBe('J1');
        expect(centerPoint(15)).toBe(at(15, 7, 7));
        expect(centerPoint(10)).toBe(at(10, 4, 4));
        expect(starPoints(15)).toContain(at(15, 7, 7));
        expect(starPoints(10)).toHaveLength(4);
    });

    it('盤が埋まったか', () => {
        const board = createBoard(10);
        expect(isFull(board)).toBe(false);
        expect(isFull(board.fill(BLACK))).toBe(true);
    });
});

describe('五連の判定（自由ルール）', () => {
    const rows = [
        '..........',
        '.XXXXX....',
        '..........',
        '...O......',
        '....O.....',
        '.....O....',
        '......O...',
        '.......O..',
        '..........',
        'XXXX.XXXXX'
    ];
    const board = boardOf(rows);

    it('横・斜めに5つで勝ち。並びの石を返す', () => {
        expect(winningLine(board, 10, at(10, 1, 3))).toEqual([at(10, 1, 1), at(10, 1, 2), at(10, 1, 3), at(10, 1, 4), at(10, 1, 5)]);
        expect(winningLine(board, 10, at(10, 5, 5))).toHaveLength(5);
        expect(winningLine(board, 10, at(10, 5, 5))[0]).toBe(at(10, 3, 3));
    });

    it('4つと、間の空いた並びは勝ちでない。空きの点は null', () => {
        expect(winningLine(board, 10, at(10, 9, 0))).toBe(null);
        expect(winningLine(board, 10, at(10, 0, 0))).toBe(null);
    });

    it('6つ以上（長連）も勝ち。縦も数える', () => {
        const long = boardOf([
            '.........O',
            'XXXXXX...O',
            '.........O',
            '.........O',
            '.........O',
            '..........',
            '..........',
            '..........',
            '..........',
            '..........'
        ]);
        expect(winningLine(long, 10, at(10, 1, 2))).toHaveLength(6);
        expect(winningLine(long, 10, at(10, 2, 9))).toHaveLength(5);
        expect(long[at(10, 0, 9)]).toBe(WHITE);
    });
});
