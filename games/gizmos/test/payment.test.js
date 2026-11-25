import { describe, it, expect } from 'vitest';
import { canReach, checkSpend, autoSpend, converterSteps, convertersFor } from '../public/js/payment.js';
import { energy } from './helpers.js';

// 黒→黒2個（黄・レベル2）
const CARD_DOUBLE_BLACK = 59;

// 4：黄→好きな色（黒）、9：黄→好きな色（青）、55：赤1〜2個→好きな色、57：赤→赤2個、78：何色でも→好きな色、80：黄と青をそれぞれ2個に
describe('支払い', () => {
    it('変換なしなら、その色の数だけ', () => {
        expect(canReach(energy({ red: 2 }), [], 'red', 2)).toBe(true);
        expect(canReach(energy({ red: 1, blue: 5 }), [], 'red', 2)).toBe(false);
        expect(canReach(energy({ red: 1, blue: 1 }), [], 'any', 2)).toBe(true);
    });

    it('変換は重ねて使える（公式の例）', () => {
        expect(canReach(energy({ yellow: 1 }), converterSteps([9, 57, 55]), 'blue', 2)).toBe(true);
        // 1つ欠けると届かない
        expect(canReach(energy({ yellow: 1 }), converterSteps([9, 57]), 'blue', 2)).toBe(false);
        expect(convertersFor(energy({ yellow: 1 }), [9, 57, 55, 78], 'blue', 2)).toHaveLength(3);
    });

    it('1個を2個にする変換は1個だけ（公式の例1：黒2個と1つの変換では3個まで）', () => {
        const black = [CARD_DOUBLE_BLACK];
        expect(canReach(energy({ black: 2 }), converterSteps(black), 'black', 3)).toBe(true);
        expect(canReach(energy({ black: 2 }), converterSteps(black), 'black', 4)).toBe(false);
    });

    it('2色のどちらも2個にできる変換', () => {
        expect(canReach(energy({ yellow: 1, blue: 1 }), converterSteps([80]), 'any', 4)).toBe(true);
        expect(canReach(energy({ yellow: 2 }), converterSteps([80]), 'yellow', 4)).toBe(false);
    });

    it('余計に払う払い方は断る', () => {
        expect(checkSpend(energy({ red: 3 }), energy({ red: 3 }), [], 'red', 2)).toBe(null);
        expect(checkSpend(energy({ red: 3 }), energy({ red: 2 }), [], 'red', 2)).toEqual([]);
        expect(checkSpend(energy({ red: 1 }), energy({ red: 2 }), [], 'red', 2)).toBe(null);
        expect(checkSpend(energy({ red: 2 }), energy({ red: 2 }), [57], 'red', 3)).toEqual([57]);
    });

    it('おまかせは、払う数が一番少ない払い方', () => {
        expect(autoSpend(energy({ red: 3, yellow: 1 }), [57], 'red', 3).spend).toEqual(energy({ red: 2 }));
        expect(autoSpend(energy({ yellow: 1, red: 0 }), [4], 'red', 1)).toEqual({ spend: energy({ yellow: 1 }), converters: [4] });
        expect(autoSpend(energy({ blue: 3 }), [], 'red', 1)).toBe(null);
        expect(autoSpend(energy(), [], 'red', 0).spend).toEqual(energy());
    });
});

