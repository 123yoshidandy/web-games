import { describe, it, expect } from 'vitest';
import { createBoard, target, applyStep, legalPlays, checkPlay, nextSteps, pipCount, winKind, hasContact, BAR, OFF } from '../public/js/rules.js';
import { board } from './helpers.js';

describe('盤と並べ方', () => {
    it('最初の並べ方は 24 に2・13 に5・8 に3・6 に5 で、ピップ数は 167', () => {
        const b = createBoard();
        for (const s of b) {
            expect(s.reduce((a, v) => a + v, 0)).toBe(15);
            expect([s[24], s[13], s[8], s[6]]).toEqual([2, 5, 3, 5]);
            expect(pipCount(s)).toBe(167);
        }
        expect(hasContact(b)).toBe(true);
    });

    it('すれ違いが終われば競走（コンタクトなし）', () => {
        expect(hasContact(board({ 6: 15 }, { 6: 15 }))).toBe(false);
        expect(hasContact(board({ 20: 1, 6: 14 }, { 6: 15 }))).toBe(true);
    });
});

describe('1歩の動かし方', () => {
    // 自分のポイント i は、相手から見ると 25 - i
    it('相手の駒が2個以上のポイントには止まれない', () => {
        const b = board({ 13: 1, 1: 14 }, { 15: 2, 0: 13 });
        expect(target(b, 0, 13, 3)).toBe(-1); // 10 は相手の 15
        expect(target(b, 0, 13, 4)).toBe(9);
    });

    it('ブロット（1個）なら打って、相手の駒をバーへ送る', () => {
        const b = board({ 13: 1, 1: 14 }, { 15: 1, 0: 14 });
        const r = applyStep(b, 0, 13, 3);
        expect(r.to).toBe(10);
        expect(r.hit).toBe(true);
        expect(r.board[0][10]).toBe(1);
        expect(r.board[1][15]).toBe(0);
        expect(r.board[1][BAR]).toBe(1);
    });

    it('バーに駒があれば先に入れる。入る先は相手のインナーボード（25 - 目）', () => {
        const b = board({ [BAR]: 1, 6: 14 }, { 3: 2, 0: 13 });
        expect(target(b, 0, 6, 2)).toBe(-1);
        expect(target(b, 0, BAR, 3)).toBe(-1); // 22 は相手の 3
        expect(target(b, 0, BAR, 4)).toBe(21);
    });

    it('ベアオフは全部がインナーボードに入ってから。目より大きい位置からは、それより高い駒がないときだけ', () => {
        const b = board({ 5: 1, 3: 2, 0: 12 }, { 6: 15 });
        expect(target(b, 0, 3, 3)).toBe(OFF);
        expect(target(b, 0, 5, 6)).toBe(OFF);
        expect(target(b, 0, 3, 6)).toBe(-1); // 5 に駒がある
        expect(target(b, 0, 3, 4)).toBe(-1);
        const outside = board({ 7: 1, 3: 2, 0: 12 }, { 6: 15 });
        expect(target(outside, 0, 3, 3)).toBe(-1);
    });
});

describe('1番分の手', () => {
    it('両方の目を使えるなら、両方使わなければならない', () => {
        const b = board({ 13: 1, 1: 14 }, { 6: 15 });
        const legal = legalPlays(b, 0, [6, 3]);
        expect(legal.max).toBe(2);
        expect(legal.plays).toHaveLength(1); // 13→7→4 と 13→10→4 は同じ盤
        expect(checkPlay(b, 0, [6, 3], [[13, 6]], legal)).toBe(null);
        expect(checkPlay(b, 0, [6, 3], [[13, 3], [10, 6]], legal)).not.toBe(null);
        expect(checkPlay(b, 0, [6, 3], [[13, 6], [7, 3]], legal)).not.toBe(null);
    });

    it('片方しか使えず、どちらでも使えるときは、大きい目を使う', () => {
        // 4 を相手が押さえているので、13 から 6 と 3 をつなげられない
        const b = board({ 13: 1, 1: 14 }, { 21: 2, 0: 13 });
        const legal = legalPlays(b, 0, [3, 6]);
        expect(legal.max).toBe(1);
        expect(legal.plays.map(p => p.steps)).toEqual([[[13, 6]]]);
        expect(checkPlay(b, 0, [3, 6], [[13, 3]], legal)).toBe(null);
    });

    it('大きい目が使えなければ、小さい目を使う', () => {
        // 7 を相手が押さえている
        const b = board({ 13: 1, 1: 14 }, { 18: 2, 21: 2, 0: 11 });
        const legal = legalPlays(b, 0, [3, 6]);
        expect(legal.plays.map(p => p.steps)).toEqual([[[13, 3]]]);
    });

    it('ゾロ目は4回動かす。送る順が違っても同じ手として受け付ける', () => {
        const b = createBoard();
        const legal = legalPlays(b, 0, [3, 3]);
        expect(legal.max).toBe(4);
        const steps = [[8, 3], [6, 3], [8, 3], [6, 3]];
        expect(checkPlay(b, 0, [3, 3], steps, legal)).not.toBe(null);
        expect(checkPlay(b, 0, [3, 3], steps.slice().reverse(), legal)).not.toBe(null);
        expect(checkPlay(b, 0, [3, 3], steps.slice(0, 3), legal)).toBe(null);
    });

    it('動かせる手がなければ max は 0', () => {
        // バーの駒が、閉じたインナーボードに入れない
        const b = board({ [BAR]: 1, 6: 14 }, { 1: 2, 2: 2, 3: 2, 4: 2, 5: 2, 6: 2, 0: 3 });
        expect(legalPlays(b, 0, [4, 2]).max).toBe(0);
    });

    it('次の1歩は、最後まで目を使い切れるものだけ', () => {
        // 6 を先に使うと 3 が使えなくなる形：13 にだけ動かせる駒、10 から 6 先の 4 が押さえられ、7 から 3 先の 4 も同じ
        const b = board({ 13: 1, 1: 14 }, { 21: 2, 0: 13 });
        const legal = legalPlays(b, 0, [6, 3]);
        expect(nextSteps(b, 0, [6, 3], [], legal)).toEqual([{ from: 13, die: 6, to: 7 }]);
        // 両方使える形では、どちらの目からでも動かせる
        const open = board({ 13: 1, 1: 14 }, { 6: 15 });
        const steps = nextSteps(open, 0, [6, 3], []);
        expect(steps).toEqual(expect.arrayContaining([{ from: 13, die: 6, to: 7 }, { from: 13, die: 3, to: 10 }]));
        expect(nextSteps(open, 0, [6, 3], [[13, 6]])).toEqual([{ from: 7, die: 3, to: 4 }]);
        expect(nextSteps(open, 0, [6, 3], [[13, 6], [7, 3]])).toEqual([]);
    });
});

describe('勝ちの種類', () => {
    it('シングル・ギャモン・バックギャモン', () => {
        expect(winKind(board({ 0: 15 }, { 0: 1, 6: 14 }), 0)).toBe(1);
        expect(winKind(board({ 0: 15 }, { 6: 15 }), 0)).toBe(2);
        expect(winKind(board({ 0: 15 }, { 20: 1, 6: 14 }), 0)).toBe(3);
        expect(winKind(board({ 0: 15 }, { [BAR]: 1, 6: 14 }), 0)).toBe(3);
    });
});
