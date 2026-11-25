import { describe, it, expect } from 'vitest';
import { CIV_CARDS } from '../public/js/cards.js';
import { cultureScore, multiplierCounts, finalBonus, tieBreak } from '../public/js/scoring.js';

const culture = (name) => CIV_CARDS.filter(c => c.bottom.culture === name).map(c => c.id);
const sand = (kind, n) => CIV_CARDS.filter(c => c.bottom.mult === kind && c.bottom.n === n).map(c => c.id);
const player = (over = {}) => ({ cards: [], agri: 0, tools: [], buildings: [], people: 5, res: { wood: 0, clay: 0, stone: 0, gold: 0 }, ...over });

describe('文化（緑）', () => {
    it('違う種類の数の2乗。ルールブックの例：5種と土器がもう1枚で 25+1=26', () => {
        const [pottery1, pottery2] = culture('pottery');
        const cards = [culture('writing')[0], culture('healing')[0], pottery1, culture('art')[0], culture('music')[0], pottery2];
        expect(cultureScore(cards)).toBe(26);
    });

    it('8種そろうと64。2組目も数える', () => {
        const all = ['healing', 'art', 'writing', 'pottery', 'time', 'transport', 'music', 'weaving'];
        expect(cultureScore(all.map(k => culture(k)[0]))).toBe(64);
        expect(cultureScore(all.flatMap(culture))).toBe(128);
        expect(cultureScore([...culture('music'), culture('art')[0]])).toBe(4 + 1);
        expect(cultureScore([])).toBe(0);
    });
});

describe('倍率（砂色）', () => {
    it('人の数を合わせ、もとになる数を掛ける（ルールブックの例）', () => {
        // 農民5人 × 畑7段 = 35
        const farmers = [...sand('farmer', 2), sand('farmer', 1)[0]];
        expect(multiplierCounts(farmers).farmer).toBe(5);
        expect(finalBonus(player({ cards: farmers, agri: 7 })).farmer).toBe(35);
        // 道具職人3人 × 道具7 = 21
        const makers = [sand('toolmaker', 2)[0], sand('toolmaker', 1)[0]];
        expect(finalBonus(player({ cards: makers, tools: [3, 2, 2] })).toolmaker).toBe(21);
        // 小屋の建築家7人 × 建物6 = 42
        const builders = [...sand('builder', 2), sand('builder', 3)[0]];
        expect(finalBonus(player({ cards: builders, buildings: [0, 1, 2, 3, 4, 5] })).builder).toBe(42);
        // シャーマン3人 × 人8 = 24
        const shamans = [sand('shaman', 2)[0], sand('shaman', 1)[0]];
        expect(finalBonus(player({ cards: shamans, people: 8 })).shaman).toBe(24);
    });
});

describe('終わりの得点の合計と同点', () => {
    it('文化＋倍率＋残った資源（1つ1点、食料は数えない）', () => {
        const cards = [...culture('music'), sand('shaman', 2)[0]];
        const bonus = finalBonus(player({ cards, people: 6, res: { wood: 4, clay: 0, stone: 0, gold: 2 } }));
        expect(bonus).toEqual({ culture: 2, farmer: 0, toolmaker: 0, builder: 0, shaman: 12, resources: 6, total: 20 });
    });

    it('同点のときは、畑の段＋道具の値の合計＋人の数', () => {
        expect(tieBreak(player({ agri: 3, tools: [2, 1], people: 7 }))).toBe(13);
    });
});
