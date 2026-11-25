import { describe, it, expect } from 'vitest';
import { souvenirPoints, souvenirGain, templeRankPoints, mostOf, mealPriceTotal, souvenirCost, mealCost } from '../public/js/scoring.js';

describe('土産の点', () => {
    // ルールブックの例：1・4（1+3）・9（1+3+5）・16（1+3+5+7）・5（1+1+3）・3（1+1+1）・8（1+3+1+3）
    it.each([
        [['koma'], 1],
        [['koma', 'manju'], 4],
        [['koma', 'manju', 'haori'], 9],
        [['koma', 'manju', 'haori', 'ukiyoe'], 16],
        [['koma', 'gofu', 'manju'], 5],
        [['koma', 'gofu', 'yunomi'], 3],
        [['koma', 'manju', 'gofu', 'sake'], 8],
        [[], 0]
    ])('%j は %i 点', (cards, points) => {
        expect(souvenirPoints(cards)).toBe(points);
    });

    it('足したときに増える点は、組の何枚目になるか（1・3・5・7）', () => {
        expect(souvenirGain([], ['koma'])).toBe(1);
        expect(souvenirGain(['koma'], ['manju'])).toBe(3);
        expect(souvenirGain(['koma', 'manju'], ['gofu'])).toBe(1);
        expect(souvenirGain(['koma', 'manju', 'haori'], ['ukiyoe'])).toBe(7);
    });
});

describe('寺の寄付の順位', () => {
    it('ルールブックの例：1位10点、2位で並んだ2人は7点ずつ、寄付のない人は0点', () => {
        expect(templeRankPoints([6, 4, 4, 0, 0])).toEqual([10, 7, 7, 0, 0]);
    });
    it('同点の次は次の順位。4番目より後も、寄付していれば2点', () => {
        expect(templeRankPoints([9, 9, 5, 3, 1])).toEqual([10, 10, 7, 4, 2]);
        expect(templeRankPoints([0, 0])).toEqual([0, 0]);
    });
});

describe('称号と値段', () => {
    it('最も多い人（同点は全員、0なら誰も取らない）', () => {
        expect(mostOf([2, 5, 5])).toEqual([1, 2]);
        expect(mostOf([0, 0])).toEqual([]);
    });
    it('食通は食事の札の値段の合計', () => {
        expect(mealPriceTotal(['unagi:1', 'dango:2', 'tofu:1'])).toBe(6);
    });
    it('芸者・商人・浪人の値段', () => {
        expect(souvenirCost('sasayakko', ['shamisen', 'koma'])).toEqual({ pay: 3, need: 4 });
        expect(souvenirCost('sasayakko', ['shamisen'])).toEqual({ pay: 3, need: 3 });
        expect(souvenirCost('zenemon', ['shamisen', 'koma'])).toEqual({ pay: 2, need: 2 });
        expect(souvenirCost('kinko', ['shamisen', 'koma'])).toEqual({ pay: 4, need: 4 });
        expect(mealCost('kinko', 'dango:1')).toBe(0);
        expect(mealCost('kinko', 'unagi:1')).toBe(2);
        expect(mealCost('hiroshige', 'unagi:1')).toBe(3);
    });
});
