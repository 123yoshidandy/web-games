import { describe, it, expect } from 'vitest';
import { CARDS, TYPES, COLORS } from '../public/js/cards.js';
import { cardPoints, colorBonus, scoreBreakdown } from '../public/js/scoring.js';
import { pick } from './helpers.js';

describe('カード', () => {
    it('58枚で、種類ごとの枚数がルールブックのとおり', () => {
        expect(CARDS.length).toBe(58);
        Object.entries(TYPES).forEach(([type, info]) => expect(CARDS.filter(c => c.type === type).length, type).toBe(info.count));
    });

    it('色ごとの枚数が、箱の色の一覧のとおり', () => {
        const expected = { darkBlue: 9, lightBlue: 9, yellow: 8, black: 8, green: 6, white: 4, purple: 4, grey: 4, lightOrange: 3, pink: 2, orange: 1 };
        COLORS.forEach(color => expect(CARDS.filter(c => c.color === color).length, color).toBe(expected[color]));
        // 白は人魚だけ
        expect(CARDS.filter(c => c.color === 'white').every(c => c.type === 'mermaid')).toBe(true);
    });
});

describe('得点', () => {
    it('2枚組は、手札でそろっていても1点。泳ぐ人とサメも1組', () => {
        expect(cardPoints(pick('crab', 'crab'))).toBe(1);
        expect(cardPoints(pick('crab', 'crab', 'crab'))).toBe(1);
        expect(cardPoints(pick('boat', 'boat', 'fish', 'fish'))).toBe(2);
        expect(cardPoints(pick('swimmer', 'shark', 'shark'))).toBe(1);
        expect(cardPoints(pick('swimmer', 'swimmer'))).toBe(0);
    });

    it('収集のカードは枚数で決まる', () => {
        const shells = [0, 0, 2, 4, 6, 8, 10];
        for (let n = 1; n <= 6; n++) expect(cardPoints(pick(...Array(n).fill('shell'))), `貝${n}`).toBe(shells[n]);
        const octopus = [0, 0, 3, 6, 9, 12];
        for (let n = 1; n <= 5; n++) expect(cardPoints(pick(...Array(n).fill('octopus'))), `タコ${n}`).toBe(octopus[n]);
        expect(cardPoints(pick('penguin'))).toBe(1);
        expect(cardPoints(pick('penguin', 'penguin'))).toBe(3);
        expect(cardPoints(pick('penguin', 'penguin', 'penguin'))).toBe(5);
        expect(cardPoints(pick('sailor'))).toBe(0);
        expect(cardPoints(pick('sailor', 'sailor'))).toBe(5);
    });

    it('倍率のカードは、数える種類1枚ごと（自分は数えない）', () => {
        expect(cardPoints(pick('lighthouse'))).toBe(0);
        // ボート3枚：組で1点＋灯台で3点
        expect(cardPoints(pick('lighthouse', 'boat', 'boat', 'boat'))).toBe(4);
        expect(cardPoints(pick('shoal', 'fish'))).toBe(1);
        // ペンギン2枚：3点＋群れで4点
        expect(cardPoints(pick('colony', 'penguin', 'penguin'))).toBe(7);
        // 船乗り1枚：0点＋船長で3点
        expect(cardPoints(pick('captain', 'sailor'))).toBe(3);
    });

    it('人魚は、多い色から順に1色ずつ数える（白は数えない）', () => {
        const cards = pick({ type: 'crab', color: 'darkBlue' }, { type: 'boat', color: 'darkBlue' }, { type: 'fish', color: 'darkBlue' },
            { type: 'crab', color: 'yellow' }, { type: 'boat', color: 'yellow' }, { type: 'shell', color: 'green' });
        const [m1, m2, m3] = pick('mermaid', 'mermaid', 'mermaid');
        expect(scoreBreakdown([...cards, m1]).mermaid).toBe(3);
        expect(scoreBreakdown([...cards, m1, m2]).mermaid).toBe(5);
        expect(scoreBreakdown([...cards, m1, m2, m3]).mermaid).toBe(6);
        // 人魚だけなら0点
        expect(cardPoints([m1, m2])).toBe(0);
    });

    it('色のボーナスは一番多い色の枚数（人魚の白は数えない）', () => {
        const cards = pick({ type: 'crab', color: 'black' }, { type: 'boat', color: 'black' }, 'mermaid', 'mermaid', 'mermaid');
        expect(colorBonus(cards)).toBe(2);
        expect(colorBonus([])).toBe(0);
    });
});
