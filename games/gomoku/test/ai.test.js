import { describe, it, expect } from 'vitest';
import { chooseMove, findVcf, Position, SHAPE, VALUE } from '../public/js/ai.js';
import { BLACK, WHITE } from '../public/js/rules.js';
import { board15 } from './helpers.js';

const sq = (r, c) => r * 15 + c;
const H = 0; // 横の方向

describe('形の表', () => {
    it('五・活四・四・活三・三・活二を見分ける', () => {
        const shape = (stones, r, c) => new Position(board15(stones), 15).shape(sq(r, c), BLACK, H);
        expect(shape({ X: [[7, 3], [7, 4], [7, 5], [7, 6]] }, 7, 7)).toBe(SHAPE.FIVE);
        expect(shape({ X: [[7, 4], [7, 5], [7, 6]] }, 7, 7)).toBe(SHAPE.OPEN4);          // .XXXX.
        expect(shape({ X: [[7, 4], [7, 5], [7, 6]], O: [[7, 3]] }, 7, 7)).toBe(SHAPE.FOUR); // OXXXX.
        expect(shape({ X: [[7, 4], [7, 6]], O: [] }, 7, 5)).toBe(SHAPE.OPEN3);           // .XXX.
        expect(shape({ X: [[7, 4], [7, 7]] }, 7, 5)).toBe(SHAPE.OPEN3);                  // .XX.X.（飛び三）
        expect(shape({ X: [[7, 4], [7, 6]], O: [[7, 3]] }, 7, 5)).toBe(SHAPE.THREE);     // OXXX.
        expect(shape({ X: [[7, 4]] }, 7, 5)).toBe(SHAPE.OPEN2);
        expect(shape({ X: [[7, 1], [7, 2], [7, 3]] }, 7, 0)).toBe(SHAPE.FOUR);           // 盤の端は止まっている
        expect(shape({ X: [[7, 5], [7, 6], [7, 8]] }, 7, 7)).toBe(SHAPE.OPEN4);           // 真ん中を埋めて .XXXX.
        expect(shape({ X: [[7, 4], [7, 5], [7, 8]] }, 7, 6)).toBe(SHAPE.FOUR);             // XXX.X の飛び四
    });

    it('四四と四三は止められない形として高く見る', () => {
        const pos = new Position(board15({ X: [[7, 4], [7, 5], [7, 6], [4, 7], [5, 7], [6, 7]], O: [[7, 3], [3, 7]] }), 15);
        expect(pos.value(sq(7, 7), BLACK)).toBe(VALUE.WIN);
        const pos2 = new Position(board15({ X: [[7, 4], [7, 5], [7, 6], [5, 7], [6, 7]], O: [[7, 3]] }), 15);
        expect(pos2.value(sq(7, 7), BLACK)).toBe(VALUE.FOUR_THREE);
    });

    it('置いて外すと、枠の値が元に戻る', () => {
        const pos = new Position(board15({ X: [[7, 7]], O: [[6, 6]] }), 15);
        const score = pos.score;
        pos.place(sq(8, 8), BLACK);
        expect(pos.score).toBeGreaterThan(score);
        pos.remove(sq(8, 8));
        expect(pos.score).toBe(score);
    });
});

describe('手の選び方', () => {
    const levels = ['easy', 'normal', 'strong'];

    it('最初の手は真ん中', () => {
        levels.forEach(level => expect(chooseMove(board15(), 15, BLACK, { level }).sq).toBe(sq(7, 7)));
    });

    it('五にできるなら、どの強さでも打つ', () => {
        const board = board15({ X: [[7, 4], [7, 5], [7, 6], [7, 7]], O: [[8, 4], [8, 5], [8, 6], [8, 7], [7, 3]] });
        levels.forEach(level => expect(chooseMove(board, 15, BLACK, { level }).sq).toBe(sq(7, 8)));
    });

    it('相手の四は止める（ふつう・つよい）', () => {
        const board = board15({ X: [[7, 4], [7, 5], [7, 6], [7, 7], [2, 2]], O: [[7, 3], [9, 9], [10, 10]] });
        ['normal', 'strong'].forEach(level => expect(chooseMove(board, 15, WHITE, { level })).toMatchObject({ sq: sq(7, 8), reason: 'block' }));
    });

    it('相手の活三は端を止める（ふつう・つよい）', () => {
        const board = board15({ X: [[7, 5], [7, 6], [7, 7], [3, 11]], O: [[9, 9], [11, 2]] });
        ['normal', 'strong'].forEach(level => {
            const { sq: move } = chooseMove(board, 15, WHITE, { level });
            expect([sq(7, 4), sq(7, 8), sq(7, 3), sq(7, 9)]).toContain(move);
        });
    });

    it('自分の活三は活四にする', () => {
        const board = board15({ X: [[7, 5], [7, 6], [7, 7]], O: [[9, 9], [10, 9]] });
        ['normal', 'strong'].forEach(level => expect([sq(7, 4), sq(7, 8)]).toContain(chooseMove(board, 15, BLACK, { level }).sq));
    });

    it('VCF：四を続けて勝つ筋を見つける', () => {
        // 横の三（止められている）と、縦の三（止められている）を、四で続けて四三にする
        const board = board15({
            X: [[7, 5], [7, 6], [7, 7], [4, 9], [5, 9], [6, 9]],
            O: [[7, 4], [3, 9], [12, 12], [12, 13], [13, 12]]
        });
        const pos = new Position(board, 15);
        const line = findVcf(pos, BLACK, 8);
        expect(line).not.toBe(null);
        expect(chooseMove(board, 15, BLACK, { level: 'strong' }).reason).toMatch(/vcf|win/);
    });

    it('同じ局面なら同じ手（乱数は盤から作る）', () => {
        const board = board15({ X: [[7, 7], [8, 8]], O: [[7, 8]] });
        levels.forEach(level => expect(chooseMove(board, 15, WHITE, { level })).toEqual(chooseMove(board, 15, WHITE, { level })));
    });

    it('10路でも動く', () => {
        const board = new Array(100).fill(0);
        board[44] = BLACK;
        levels.forEach(level => {
            const { sq: move } = chooseMove(board, 10, WHITE, { level });
            expect(board[move]).toBe(0);
        });
    });

    it('読みの時間を打ち切れる', () => {
        const board = board15({ X: [[7, 7], [8, 8], [6, 8]], O: [[7, 8], [8, 7]] });
        const started = Date.now();
        expect(chooseMove(board, 15, BLACK, { level: 'strong', maxMs: 5 }).sq).toBeGreaterThanOrEqual(0);
        expect(Date.now() - started).toBeLessThan(1000);
    });
});
