import { describe, it, expect } from 'vitest';
import {
    EMPTY, BLACK, WHITE, neighbors, sqName, sqOf, groupAt, tryMove, isLegal, legalMoves, groups,
    scoreJapanese, handicapPoints, starPoints, MAX_HANDICAP
} from '../public/js/rules.js';
import { boardOf, at } from './helpers.js';

// 5×5 の盤で手を打って、結果を返す
const play = (rows, r, c, color, ko = -1) => tryMove(boardOf(rows), rows.length, at(rows.length, r, c), color, ko);

describe('盤と座標', () => {
    it('隅は2つ、辺は3つ、中は4つの隣を持つ', () => {
        const n = neighbors(9);
        expect(n[0].length).toBe(2);
        expect(n[4].length).toBe(3);
        expect([...n[40]].sort((a, b) => a - b)).toEqual([31, 39, 41, 49]);
    });

    it('座標の名前は列が A〜T（I を飛ばす）、行が下から数える', () => {
        expect(sqName(0, 19)).toBe('A19');
        expect(sqName(19 * 19 - 1, 19)).toBe('T1');
        expect(sqName(at(19, 3, 15), 19)).toBe('Q16');
        expect(sqName(at(9, 4, 8), 9)).toBe('J5');
        for (const size of [9, 13, 19]) {
            for (let sq = 0; sq < size * size; sq++) expect(sqOf(sqName(sq, size), size)).toBe(sq);
        }
    });

    it('連の石とダメを数える', () => {
        const board = boardOf(['.....', '.XX..', '.XO..', '.....', '.....']);
        const g = groupAt(board, 5, at(5, 1, 1));
        expect(g.stones.sort((a, b) => a - b)).toEqual([6, 7, 11]);
        expect(g.liberties.size).toBe(6);
        expect(groupAt(board, 5, at(5, 2, 2)).liberties.size).toBe(2);
        expect(groups(board, 5).length).toBe(2);
    });
});

describe('取り', () => {
    it('中の1子を4方から囲むと取れる', () => {
        const res = play(['.....', '..X..', '.XO..', '..X..', '.....'], 2, 3, BLACK);
        expect(res.ok).toBe(true);
        expect(res.captured).toEqual([at(5, 2, 2)]);
        expect(res.board[at(5, 2, 2)]).toBe(EMPTY);
    });

    it('隅と辺の石は、少ない石で取れる', () => {
        expect(play(['OX...', '.....', '.....', '.....', '.....'], 1, 0, BLACK).captured).toEqual([0]);
        expect(play(['.XOX.', '.....', '.....', '.....', '.....'], 1, 2, BLACK).captured).toEqual([2]);
    });

    it('つながった石はまとめて取れる。ダメが1つでも残れば取れない', () => {
        const rows = ['.XXX.', 'XOOOX', '.XX..', '.....', '.....'];
        const res = play(rows, 2, 3, BLACK);
        expect(res.captured.sort((a, b) => a - b)).toEqual([6, 7, 8]);
        const open = ['.XXX.', 'XOOO.', '.XX..', '.....', '.....'];
        expect(play(open, 2, 3, BLACK).captured).toEqual([]);
    });

    it('1手で複数の連を同時に取れる', () => {
        const res = play(['.XOX.', 'XO.OX', '.XOX.', '.....', '.....'], 1, 2, BLACK);
        expect(res.captured.sort((a, b) => a - b)).toEqual([2, 6, 8]);
        expect(res.board[at(5, 2, 2)]).toBe(WHITE); // ダメの残る白は取れない
        const res2 = play(['XO.OX', '.X.X.', '.....', '.....', '.....'], 0, 2, BLACK);
        expect(res2.captured.sort((a, b) => a - b)).toEqual([1, 3]);
    });

    it('打っても盤は書き換えない', () => {
        const board = boardOf(['.....', '..X..', '.XO..', '..X..', '.....']);
        const copy = [...board];
        tryMove(board, 5, at(5, 2, 3), BLACK);
        expect(board).toEqual(copy);
    });

    it('石のある点には打てない', () => {
        expect(play(['X....', '.....', '.....', '.....', '.....'], 0, 0, WHITE)).toEqual({ ok: false, reason: 'occupied' });
    });
});

describe('自殺手', () => {
    it('ダメのない点に打つ手は打てない（1子）', () => {
        expect(play(['.X...', 'X....', '.....', '.....', '.....'], 0, 0, WHITE)).toEqual({ ok: false, reason: 'suicide' });
        expect(play(['.....', '..X..', '.X.X.', '..X..', '.....'], 2, 2, WHITE).reason).toBe('suicide');
    });

    it('自分の連の最後のダメをふさぐ手も打てない（複数の石）', () => {
        const rows = ['OO.X.', 'XXXX.', '.....', '.....', '.....'];
        expect(play(rows, 0, 2, WHITE).reason).toBe('suicide');
    });

    it('相手の石を取れるなら、ダメのない点にも打てる', () => {
        const rows = ['.XO..', 'XO...', '.....', '.....', '.....'];
        // 白が隅に打つと、ダメのない黒（0,1）を取れる。ダメの残る黒（1,0）は取れない
        const res = play(rows, 0, 0, WHITE);
        expect(res.ok).toBe(true);
        expect(res.captured.length).toBe(1);
    });

    it('自分の連につながってダメが残るなら打てる', () => {
        expect(play(['.X...', 'XX...', '.....', '.....', '.....'], 0, 0, BLACK).ok).toBe(true);
    });
});

describe('コウ', () => {
    it('1子を取って、打った石が1子・ダメ1つならコウ。取り返すと同じ形に戻る手は、すぐには打てない', () => {
        const rows = ['.....', '.XO..', 'XO.O.', '.XO..', '.....'];
        const take = play(rows, 2, 2, BLACK);
        expect(take.ok).toBe(true);
        expect(take.captured).toEqual([at(5, 2, 1)]);
        expect(take.ko).toBe(at(5, 2, 1));
        // 白はコウの点に打てない
        const back = tryMove(take.board, 5, take.ko, WHITE, take.ko);
        expect(back).toEqual({ ok: false, reason: 'ko' });
        expect(isLegal(take.board, 5, take.ko, WHITE, take.ko)).toBe(false);
        expect(legalMoves(take.board, 5, WHITE, take.ko)).not.toContain(take.ko);
        // ほかに1手打ったあと（コウの点がなくなったあと）なら取り返せる
        const later = tryMove(take.board, 5, take.ko, WHITE, -1);
        expect(later.ok).toBe(true);
        expect(later.captured).toEqual([at(5, 2, 2)]);
    });

    it('2子以上を取る手や、取った石にダメが2つ以上あるときは、コウにならない', () => {
        // 2子を取る
        const two = play(['.XX..', 'XOO..', '.XX..', '.....', '.....'], 1, 3, BLACK);
        expect(two.ok).toBe(true);
        expect(two.ko).toBe(-1);
        // 1子を取るが、打った石にダメが2つある
        const open = play(['.....', '..X..', '.XO..', '.....', '.....'], 3, 2, BLACK);
        expect(open.captured).toEqual([]);
        const res = play(['.X...', 'XOX..', '.....', '.....', '.....'], 2, 1, BLACK);
        expect(res.captured).toEqual([at(5, 1, 1)]);
        expect(res.ko).toBe(-1);
    });

    it('大きな連をまとめて取る手は、コウにならない', () => {
        const rows = [
            'OX.XO',
            'OXXXO',
            '.OOO.',
            '.....',
            '.....'
        ];
        // 黒の5子のダメは c5（0,2）だけ
        const res = play(rows, 0, 2, WHITE);
        expect(res.ok).toBe(true);
        expect(res.captured.length).toBe(5);
        expect(res.ko).toBe(-1);
    });
});

describe('地の計算（日本式）', () => {
    it('一方の色だけに囲まれた空きを地にする。両方に接する空き（ダメ）は数えない', () => {
        const board = boardOf([
            '..XO.',
            '..XO.',
            '..XO.',
            '..X.O',
            '..XO.'
        ]);
        const s = scoreJapanese(board, 5, { komi: 0 });
        expect(s.black.territory).toBe(10);
        expect(s.white.territory).toBe(4);
        expect(s.owner[at(5, 0, 0)]).toBe(BLACK);
        expect(s.owner[at(5, 3, 3)]).toBe(EMPTY); // 黒と白の両方に接するダメ
    });

    it('点＝地＋アゲハマ。白にはコミを足す。差で勝ちが決まり、同じなら持碁', () => {
        const board = boardOf(['..XO.', '..XO.', '..XO.', '..XO.', '..XO.']);
        const s = scoreJapanese(board, 5, { prisoners: { 1: 2, 2: 1 }, komi: 0.5 });
        expect(s.black).toEqual({ territory: 10, prisoners: 2, total: 12 });
        expect(s.white).toEqual({ territory: 5, prisoners: 1, komi: 0.5, total: 6.5 });
        expect(s.diff).toBe(5.5);
        expect(s.winner).toBe(BLACK);
        const even = scoreJapanese(board, 5, { prisoners: { 1: 0, 2: 5 }, komi: 0 });
        expect(even.diff).toBe(0);
        expect(even.winner).toBe(EMPTY);
    });

    it('死に石は相手のアゲハマになり、その点は囲む色の地になる', () => {
        const board = boardOf([
            '..XO.',
            '.OXO.',
            '..XO.',
            '..XO.',
            '..XOX'
        ]);
        const dead = [at(5, 1, 1), at(5, 4, 4)];
        const s = scoreJapanese(board, 5, { dead, komi: 0 });
        expect(s.black.prisoners).toBe(1);
        expect(s.white.prisoners).toBe(1);
        expect(s.black.territory).toBe(10);
        expect(s.white.territory).toBe(5);
        expect(s.owner[at(5, 1, 1)]).toBe(BLACK);
        expect(s.owner[at(5, 4, 4)]).toBe(WHITE);
        // 死に石を指定しなければ、地にならない
        const alive = scoreJapanese(board, 5, { komi: 0 });
        expect(alive.black.territory).toBeLessThan(10);
    });

    it('石が1つもない盤は、どちらの地もない', () => {
        const s = scoreJapanese(new Array(81).fill(0), 9, { komi: 6.5 });
        expect(s.black.territory + s.white.territory).toBe(0);
        expect(s.winner).toBe(WHITE);
    });
});

describe('置き石と星', () => {
    it('置き石は星に置き、数だけ違う点になる', () => {
        for (const size of [9, 13, 19]) {
            const stars = new Set(starPoints(size));
            for (let n = 2; n <= MAX_HANDICAP[size]; n++) {
                const points = handicapPoints(size, n);
                expect(points.length).toBe(n);
                expect(new Set(points).size).toBe(n);
                points.forEach(p => expect(stars.has(p)).toBe(true));
            }
        }
    });

    it('2子は黒から見て右上と左下、19路は4の4', () => {
        expect(handicapPoints(19, 2).map(sq => sqName(sq, 19))).toEqual(['Q16', 'D4']);
        expect(handicapPoints(9, 4).map(sq => sqName(sq, 9)).sort()).toEqual(['C3', 'C7', 'G3', 'G7']);
        expect(handicapPoints(19, 5).at(-1)).toBe(at(19, 9, 9));
        expect(handicapPoints(19, 0)).toEqual([]);
    });

    it('多すぎる置き石は断る', () => {
        expect(() => handicapPoints(9, 6)).toThrow();
        expect(() => handicapPoints(19, 10)).toThrow();
    });
});
