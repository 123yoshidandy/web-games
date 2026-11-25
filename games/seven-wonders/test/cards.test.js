import { describe, it, expect } from 'vitest';
import { CARDS, CARD_BY_KEY, GUILDS, WONDERS, ageCards, RESOURCES } from '../public/js/cards.js';

describe('カードのデータ', () => {
    it('3〜7 人で、第1・第2時代は 7×人数 枚、第3時代はギルド（人数+2）と合わせて 7×人数 枚', () => {
        for (let n = 3; n <= 7; n++) {
            expect(ageCards(1, n), `第1時代 ${n}人`).toHaveLength(7 * n);
            expect(ageCards(2, n), `第2時代 ${n}人`).toHaveLength(7 * n);
            expect(ageCards(3, n).length + n + 2, `第3時代 ${n}人`).toBe(7 * n);
        }
    });

    it('ギルドは 10 枚', () => {
        expect(GUILDS).toHaveLength(10);
    });

    it('連鎖の元は、前の時代のカード', () => {
        CARDS.forEach(c => (c.chain ?? []).forEach(k => {
            expect(CARD_BY_KEY[k], `${c.key} ← ${k}`).toBeDefined();
            expect(CARD_BY_KEY[k].age, `${c.key} ← ${k}`).toBe(c.age - 1);
        }));
    });

    it('費用と生産は、決まった資源の文字だけ', () => {
        CARDS.forEach(c => {
            [...c.cost].forEach(r => expect(RESOURCES, c.key).toContain(r));
            (c.produce ?? []).flat().forEach(r => expect(RESOURCES, c.key).toContain(r));
        });
        WONDERS.forEach(w => ['A', 'B'].forEach(side => w[side].forEach(s => [...s.cost].forEach(r => expect(RESOURCES).toContain(r)))));
    });

    it('第1時代の色ごとの枚数（3 人）：原材料6・加工品3・市民3・商業3・軍事3・科学3', () => {
        const count = color => ageCards(1, 3).filter(id => CARD_BY_KEY[id.split('#')[0]].color === color).length;
        expect(['brown', 'grey', 'blue', 'yellow', 'red', 'green'].map(count)).toEqual([6, 3, 3, 3, 3, 3]);
    });

    it('不思議は 7 つで、A 面は 3 段階、B 面は 2〜4 段階', () => {
        expect(WONDERS).toHaveLength(7);
        WONDERS.forEach(w => {
            expect(w.A).toHaveLength(3);
            expect(w.B.length).toBeGreaterThanOrEqual(2);
        });
        expect(WONDERS.find(w => w.key === 'giza').B).toHaveLength(4);
        expect(WONDERS.find(w => w.key === 'rhodes').B).toHaveLength(2);
    });
});
