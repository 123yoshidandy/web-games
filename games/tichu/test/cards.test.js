import { describe, it, expect } from 'vitest';
import { MAHJONG, DOG, PHOENIX, DRAGON, DECK_SIZE, cardOf, rankOf, cardPoints, pointsOf, classify, beats, enumerateCombos, comboLabel } from '../public/js/cards.js';

const c = cardOf;
const kind = (cards, table) => {
    const x = classify(cards, table ? classify(table) : null);
    return x ? `${x.type}/${x.length}/${x.rank}` : null;
};

describe('カード', () => {
    it('56枚。札の点は合わせて100（5は5点・10とKは10点・竜25・不死鳥−25）', () => {
        const all = Array.from({ length: DECK_SIZE }, (_, i) => i);
        expect(pointsOf(all)).toBe(100);
        expect(cardPoints(c(0, 5))).toBe(5);
        expect(cardPoints(c(1, 10))).toBe(10);
        expect(cardPoints(c(2, 13))).toBe(10);
        expect(cardPoints(DRAGON)).toBe(25);
        expect(cardPoints(PHOENIX)).toBe(-25);
        expect(cardPoints(c(3, 14))).toBe(0);
        expect(rankOf(MAHJONG)).toBe(1);
    });
});

describe('組の判定', () => {
    it('1枚・ペア・3枚組・フルハウス・階段・連続ペア', () => {
        expect(kind([c(0, 9)])).toBe('single/1/9');
        expect(kind([c(0, 9), c(1, 9)])).toBe('pair/1/9');
        expect(kind([c(0, 9), c(1, 9), c(2, 9)])).toBe('triple/1/9');
        expect(kind([c(0, 9), c(1, 9), c(2, 9), c(0, 4), c(1, 4)])).toBe('fullhouse/1/9');
        expect(kind([c(0, 3), c(1, 4), c(2, 5), c(0, 6), c(1, 7)])).toBe('straight/5/7');
        expect(kind([MAHJONG, c(1, 2), c(2, 3), c(0, 4), c(1, 5)])).toBe('straight/5/5');
        expect(kind([c(0, 3), c(1, 3), c(2, 4), c(0, 4)])).toBe('pairs/2/4');
        expect(kind([c(0, 3), c(1, 3), c(2, 4), c(0, 4), c(0, 5), c(1, 5)])).toBe('pairs/3/5');
    });

    it('組にならない形', () => {
        expect(kind([c(0, 3), c(1, 4)])).toBe(null);
        expect(kind([c(0, 3), c(1, 4), c(2, 5), c(0, 6)])).toBe(null); // 4枚の階段はない
        expect(kind([c(0, 3), c(1, 3), c(2, 5), c(0, 5)])).toBe(null); // 連続していないペア
        expect(kind([DOG, c(0, 3)])).toBe(null);
        expect(kind([DRAGON, c(0, 13)])).toBe(null);
        expect(kind([MAHJONG, c(0, 1 + 1)])).toBe(null);
    });

    it('爆弾：同じ数の4枚、同じ色の5枚以上の階段', () => {
        expect(kind([c(0, 7), c(1, 7), c(2, 7), c(3, 7)])).toBe('bomb/4/7');
        expect(kind([c(2, 3), c(2, 4), c(2, 5), c(2, 6), c(2, 7)])).toBe('bomb/5/7');
        // 不死鳥・麻雀は爆弾にならない
        expect(kind([c(0, 7), c(1, 7), c(2, 7), PHOENIX])).toBe(null);
        expect(kind([MAHJONG, c(2, 2), c(2, 3), c(2, 4), c(2, 5)])).toBe('straight/5/5');
    });

    it('不死鳥は、組の中では好きな数（場に勝てる中でいちばん強い読み方）', () => {
        expect(kind([c(0, 9), PHOENIX])).toBe('pair/1/9');
        expect(kind([c(0, 9), c(1, 9), PHOENIX, c(0, 4), c(1, 4)])).toBe('fullhouse/1/9');
        expect(kind([c(0, 2), c(1, 2), PHOENIX, c(0, 14), c(1, 14)])).toBe('fullhouse/1/14');
        expect(kind([c(0, 3), c(1, 4), PHOENIX, c(0, 6), c(1, 7)])).toBe('straight/5/7');
        // 端を伸ばすなら、上に伸ばすほうが強い
        expect(kind([c(0, 3), c(1, 4), c(2, 5), c(0, 6), PHOENIX])).toBe('straight/5/7');
    });

    it('1枚の不死鳥：直前のカードの 0.5 上。最初なら 1.5。竜には勝てない', () => {
        expect(classify([PHOENIX]).rank).toBe(1.5);
        const ace = classify([c(0, 14)]);
        const phoenix = classify([PHOENIX], ace);
        expect(phoenix.rank).toBe(14.5);
        expect(beats(phoenix, ace)).toBe(true);
        expect(beats(classify([DRAGON]), phoenix)).toBe(true);
        expect(beats(classify([PHOENIX], classify([DRAGON])), classify([DRAGON]))).toBe(false);
        // 不死鳥（7.5）には 8 が勝ち、7 は勝てない
        const p = classify([PHOENIX], classify([c(0, 7)]));
        expect(beats(classify([c(1, 8)]), p)).toBe(true);
        expect(beats(classify([c(1, 7)]), p)).toBe(false);
        // 麻雀（1）は、最初に出された不死鳥（1.5）に勝てない
        expect(beats(classify([MAHJONG]), classify([PHOENIX]))).toBe(false);
    });

    it('強さの比べ方：同じ形・同じ長さで数が上。爆弾はどの組にも勝ち、爆弾どうしは枚数、次に数', () => {
        const pair9 = classify([c(0, 9), c(1, 9)]);
        expect(beats(classify([c(0, 10), c(1, 10)]), pair9)).toBe(true);
        expect(beats(classify([c(0, 8), c(1, 8)]), pair9)).toBe(false);
        expect(beats(classify([c(0, 10)]), pair9)).toBe(false);
        const s5 = classify([c(0, 3), c(1, 4), c(2, 5), c(0, 6), c(1, 7)]);
        const s6 = classify([c(0, 3), c(1, 4), c(2, 5), c(0, 6), c(1, 7), c(2, 8)]);
        expect(beats(s6, s5)).toBe(false); // 長さが違う
        const bomb4 = classify([c(0, 2), c(1, 2), c(2, 2), c(3, 2)]);
        const bomb4High = classify([c(0, 12), c(1, 12), c(2, 12), c(3, 12)]);
        const flush = classify([c(2, 3), c(2, 4), c(2, 5), c(2, 6), c(2, 7)]);
        expect(beats(bomb4, s6)).toBe(true);
        expect(beats(bomb4, classify([DRAGON]))).toBe(true);
        expect(beats(bomb4High, bomb4)).toBe(true);
        expect(beats(flush, bomb4High)).toBe(true);
        expect(beats(bomb4High, flush)).toBe(false);
        expect(beats(classify([c(2, 3), c(2, 4), c(2, 5), c(2, 6), c(2, 7), c(2, 8)]), flush)).toBe(true);
        // 犬には爆弾も出せない
        expect(beats(bomb4, classify([DOG]))).toBe(false);
    });
});

describe('出せる組を並べる', () => {
    it('手札から、すべての形の組を見つける', () => {
        const hand = [MAHJONG, c(0, 2), c(1, 3), c(2, 4), c(3, 5), c(0, 6), PHOENIX, c(0, 9), c(1, 9), c(2, 9), c(3, 9), DRAGON, DOG, c(2, 14)];
        const labels = enumerateCombos(hand).map(comboLabel);
        expect(labels).toContain('階段 1〜5');
        expect(labels).toContain('階段 1〜7');
        expect(labels).toContain('爆弾 9×4');
        expect(labels).toContain('フルハウス 9');
        expect(labels).toContain('ペア A');
        expect(labels).toContain('犬');
        expect(labels).toContain('竜');
    });

    it('場があれば、それに勝つものだけ', () => {
        const hand = [c(0, 5), c(1, 5), c(0, 8), c(1, 8), c(0, 11), c(0, 2), c(1, 2), c(2, 2), c(3, 2)];
        const table = classify([c(2, 6), c(3, 6)]);
        const labels = enumerateCombos(hand, table).map(comboLabel).sort();
        expect(labels).toEqual(['ペア 8', '爆弾 2×4'].sort());
    });

    it('同じ色の階段の爆弾も見つける', () => {
        const hand = [c(1, 6), c(1, 7), c(1, 8), c(1, 9), c(1, 10), c(2, 11)];
        expect(enumerateCombos(hand).filter(x => x.type === 'bomb').map(comboLabel)).toEqual(['爆弾（同じ色の階段） 6〜10']);
    });
});
