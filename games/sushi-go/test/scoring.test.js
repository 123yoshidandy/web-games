import { describe, it, expect } from 'vitest';
import { cardScores, makiScores, puddingScores, scoreRound } from '../public/js/scoring.js';

const t = (...cards) => cards.map(c => (typeof c === 'string' ? { type: c } : c));

describe('得点', () => {
    it('天ぷらは2枚で5点、刺身は3枚で10点（あまりは0点）', () => {
        expect(cardScores(t('tempura')).tempura).toBe(0);
        expect(cardScores(t('tempura', 'tempura', 'tempura')).tempura).toBe(5);
        expect(cardScores(t('tempura', 'tempura', 'tempura', 'tempura')).tempura).toBe(10);
        expect(cardScores(t('sashimi', 'sashimi')).sashimi).toBe(0);
        expect(cardScores(t('sashimi', 'sashimi', 'sashimi', 'sashimi', 'sashimi', 'sashimi')).sashimi).toBe(20);
    });

    it('餃子は 1・3・6・10・15点（5枚以上は15点）', () => {
        [0, 1, 3, 6, 10, 15, 15].forEach((points, n) => expect(cardScores(t(...Array(n).fill('dumpling'))).dumpling).toBe(points));
    });

    it('にぎりは 1・2・3点、わさびの上で3倍。にぎりのないわさびは0点', () => {
        expect(cardScores(t('egg', 'salmon', 'squid')).nigiri).toBe(6);
        expect(cardScores(t({ type: 'wasabi', nigiri: 'squid' }, { type: 'wasabi', nigiri: null })).nigiri).toBe(9);
        expect(cardScores(t({ type: 'wasabi', nigiri: 'egg' }, 'salmon')).nigiri).toBe(5);
    });

    it('巻き寿司：最多6点・2番目3点（ルールブックの例）', () => {
        // Chris 5、Phil 3、Amy 3、Lisa 2
        expect(makiScores([5, 3, 3, 2])).toEqual([6, 1, 1, 0]);
    });

    it('巻き寿司：最多が同点なら6点を等分し、2番目はない', () => {
        expect(makiScores([4, 4, 2])).toEqual([3, 3, 0]);
        expect(makiScores([4, 4, 4, 1])).toEqual([2, 2, 2, 0]);
        expect(makiScores([3, 3, 3, 3, 3])).toEqual([1, 1, 1, 1, 1]);
    });

    it('巻き寿司：0の人は点を取らない', () => {
        expect(makiScores([0, 0, 0])).toEqual([0, 0, 0]);
        expect(makiScores([2, 0, 0])).toEqual([6, 0, 0]);
    });

    it('プリン：最多6点・最少−6点。同点は等分（ルールブックの例）', () => {
        // Chris 4、Phil 3、Lisa 0、Amy 0
        expect(puddingScores([4, 3, 0, 0])).toEqual([6, 0, -3, -3]);
        expect(puddingScores([2, 2, 1])).toEqual([3, 3, -6]);
        expect(puddingScores([3, 1, 1, 1])).toEqual([6, -2, -2, -2]);
    });

    it('プリン：全員が同じなら点なし。2人のときは減点なし', () => {
        expect(puddingScores([2, 2, 2])).toEqual([0, 0, 0]);
        expect(puddingScores([3, 1])).toEqual([6, 0]);
        expect(puddingScores([0, 0])).toEqual([0, 0]);
    });

    it('ラウンドの得点をまとめる', () => {
        const scores = scoreRound([t('maki3', 'tempura', 'tempura', 'chopsticks', 'pudding'), t('maki1', 'squid')]);
        expect(scores[0]).toEqual({ tempura: 5, sashimi: 0, dumpling: 0, nigiri: 0, maki: 6, total: 11 });
        expect(scores[1]).toEqual({ tempura: 0, sashimi: 0, dumpling: 0, nigiri: 3, maki: 3, total: 6 });
    });
});
