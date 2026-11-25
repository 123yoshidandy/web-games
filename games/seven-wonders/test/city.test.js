import { describe, it, expect } from 'vitest';
import { paymentOptions, sciencePoints, scoreOf, militaryResults, tradePrice, gainOf } from '../public/js/city.js';
import { city } from './helpers.js';

// 席 0 の左隣は 2、右隣は 1（3 人）
describe('払い方', () => {
    it('自分の生産で払えれば、隣に払わない', () => {
        const cities = [city('giza', 'A', ['lumberYard']), city('rhodes'), city('babylon')];
        // ギザは石を生産する。石 + 木材
        expect(paymentOptions(cities, 0, 'SW')).toEqual([{ left: 0, right: 0 }]);
    });

    it('足りない資源は、隣から 2 コインで買う。左右どちらからでも買えるなら、両方の候補を出す', () => {
        // ロードス（右隣 1）は鉱石、エフェソス（左隣 2）はパピルス。鉱石は右だけ
        const cities = [city('giza'), city('rhodes'), city('ephesos', 'A', ['oreVein'])];
        expect(paymentOptions(cities, 0, 'O')).toEqual([{ left: 0, right: 2 }, { left: 2, right: 0 }].sort((a, b) => a.left - b.left));
        expect(paymentOptions(cities, 0, 'OO')).toEqual([{ left: 2, right: 2 }]);
        expect(paymentOptions(cities, 0, 'OOO')).toEqual([]);
    });

    it('交易所・市場で 1 コインになる（東は右隣、西は左隣、市場は加工品を両隣）', () => {
        const me = city('giza', 'A', ['eastTradingPost', 'marketplace']);
        expect(tradePrice(me, 'right', 'O')).toBe(1);
        expect(tradePrice(me, 'left', 'O')).toBe(2);
        expect(tradePrice(me, 'left', 'G')).toBe(1);
        const cities = [me, city('rhodes'), city('alexandria')];
        expect(paymentOptions(cities, 0, 'OG')).toEqual([{ left: 1, right: 1 }]);
    });

    it('選べる生産（植林地：木材か粘土）は、どちらか 1 つにしか使えない', () => {
        const cities = [city('giza', 'A', ['treeFarm#6']), city('rhodes'), city('alexandria')];
        expect(paymentOptions(cities, 0, 'W')).toEqual([{ left: 0, right: 0 }]);
        expect(paymentOptions(cities, 0, 'WC')).toEqual([]);
    });

    it('隣の商業のカードの生産（隊商宿）は買えない', () => {
        const cities = [city('giza'), city('rhodes', 'A', ['caravansery#3']), city('alexandria')];
        expect(paymentOptions(cities, 0, 'W')).toEqual([]);
    });

    it('自分の隊商宿は使える', () => {
        const cities = [city('giza', 'A', ['caravansery#3']), city('rhodes'), city('alexandria')];
        expect(paymentOptions(cities, 0, 'W')).toEqual([{ left: 0, right: 0 }]);
    });
});

describe('得点', () => {
    it('科学：同じ記号の数の 2 乗と、3 種そろうごとに 7 点', () => {
        expect(sciencePoints([1, 1, 1])).toBe(10);
        expect(sciencePoints([3, 0, 0])).toBe(9);
        expect(sciencePoints([2, 2, 2])).toBe(26);
        // 好きな記号 1 つは、一番点が高くなるように
        expect(sciencePoints([1, 1, 0], 1)).toBe(10);
        expect(sciencePoints([3, 0, 0], 1)).toBe(16);
    });

    it('軍事：盾の多い方が勝ち、時代の点（1・3・5）。負けは -1、同じなら何もない', () => {
        const cities = [city('giza', 'A', ['stockade', 'barracks']), city('rhodes', 'A', ['guardTower']), city('alexandria', 'A', ['walls#3', 'stockade'])];
        const r = militaryResults(cities, 2);
        expect(r[0].map(x => x.result)).toEqual(['lose', 'win']);
        expect(r[0][1].points).toBe(3);
        expect(r[2].map(x => x.result)).toEqual(['win', 'win']);
    });

    it('内訳：軍事・お金・不思議・市民・科学・商業・ギルド', () => {
        const me = city('giza', 'A', ['baths', 'workshop', 'lighthouse#3', 'workersGuild#g', 'lumberYard'], { stages: 2, coins: 10, tokens: [1, 3], defeats: 1 });
        const left = city('rhodes', 'A', ['stonePit', 'clayPool']);
        const right = city('alexandria', 'A', ['oreVein']);
        // 席 0 の左隣は席 2、右隣は席 1
        const s = scoreOf([me, right, left], 0);
        expect(s).toMatchObject({ military: 3, treasury: 3, wonder: 3 + 5, civilian: 3, science: 1, commercial: 1, guilds: 3 });
        expect(s.total).toBe(3 + 3 + 8 + 3 + 1 + 1 + 3);
    });

    it('ギルド：建築家は自分と両隣の段階、戦略家は両隣の負けの数、船主は自分の茶・灰・紫', () => {
        const a = city('giza', 'A', ['buildersGuild#g', 'strategistsGuild#g', 'shipownersGuild#g', 'lumberYard', 'loom1'], { stages: 1 });
        const b = city('rhodes', 'A', [], { stages: 2, defeats: 2 });
        const c = city('alexandria', 'A', [], { stages: 3, defeats: 1 });
        expect(scoreOf([a, b, c], 0).guilds).toBe(6 + 3 + 5);
    });

    it('科学者ギルドは好きな記号 1 つ', () => {
        const a = city('giza', 'A', ['apothecary', 'workshop', 'scientistsGuild#g']);
        expect(scoreOf([a, city('rhodes'), city('alexandria')], 0).science).toBe(10);
    });

    it('オリンピア B：隣のギルドを 1 つ写す（一番点が高いもの）', () => {
        const me = city('olympia', 'B', [], { stages: 3 });
        const right = city('rhodes', 'A', ['workersGuild#g', 'magistratesGuild#g']);
        const left = city('alexandria', 'A', ['stonePit', 'clayPool', 'oreVein']);
        const s = scoreOf([me, right, left], 0);
        // 労働者ギルド：両隣の茶色 3 枚 = 3 点（行政官ギルドは青 0 枚）
        expect(s.copiedGuild).toBe('workersGuild');
        expect(s.guilds).toBe(3);
    });

    it('建てたときのコイン：ぶどう園は自分と両隣の茶色 1 枚につき 1', () => {
        const cities = [city('giza', 'A', ['lumberYard', 'vineyard#3']), city('rhodes', 'A', ['stonePit']), city('alexandria', 'A', ['oreVein', 'clayPool'])];
        expect(gainOf(cities, 0, 'vineyard#3')).toBe(4);
        expect(gainOf(cities, 0, 'tavern#4')).toBe(5);
    });
});
