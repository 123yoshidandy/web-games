import { describe, it, expect } from 'vitest';
import { scoreBreakdown } from '../public/js/scoring.js';
import { SCORE } from '../public/js/cards.js';
import { createFarm, addPastures } from '../public/js/farm.js';

const player = (over = {}) => ({
    members: 2, begging: 0, majors: [], farm: createFarm(),
    res: { wood: 0, clay: 0, reed: 0, stone: 0, grain: 0, veg: 0 }, animals: { sheep: 0, boar: 0, cattle: 0 }, ...over
});

describe('得点表', () => {
    it('畑・牧場・穀物・野菜・羊・猪・牛のしきい値', () => {
        expect([0, 1, 2, 3, 4, 5, 9].map(SCORE.fields)).toEqual([-1, -1, 1, 2, 3, 4, 4]);
        expect([0, 1, 2, 3, 4, 6].map(SCORE.pastures)).toEqual([-1, 1, 2, 3, 4, 4]);
        expect([0, 1, 3, 4, 5, 6, 7, 8].map(SCORE.grain)).toEqual([-1, 1, 1, 2, 2, 3, 3, 4]);
        expect([0, 1, 2, 3, 4, 7].map(SCORE.veg)).toEqual([-1, 1, 2, 3, 4, 4]);
        expect([0, 1, 3, 4, 5, 6, 7, 8].map(SCORE.sheep)).toEqual([-1, 1, 1, 2, 2, 3, 3, 4]);
        expect([0, 1, 2, 3, 4, 5, 6, 7].map(SCORE.boar)).toEqual([-1, 1, 1, 2, 2, 3, 3, 4]);
        expect([0, 1, 2, 3, 4, 5, 6].map(SCORE.cattle)).toEqual([-1, 1, 2, 2, 3, 3, 4]);
    });

    it('始めたままの農場は −14（7項目 −1、空きマス13 −13、家族2人 +6）', () => {
        const s = scoreBreakdown(player());
        expect(s.unused).toBe(-13);
        expect(s.family).toBe(6);
        expect(s.total).toBe(-7 - 13 + 6);
    });

    it('畑の上の穀物と野菜も数え、柵の中の厩・部屋・物乞い・進歩のボーナスを足す', () => {
        const farm = addPastures({ ...createFarm(), house: 'stone', stables: [4, 0] }, [[3, 4]]).farm;
        farm.fields.push({ cell: 1, crop: 'grain', n: 2 }, { cell: 2, crop: 'veg', n: 1 });
        const s = scoreBreakdown(player({
            farm, members: 3, begging: 2, majors: ['joinery', 'well'],
            res: { wood: 5, clay: 0, reed: 0, stone: 0, grain: 2, veg: 0 }
        }));
        expect(s.grain).toBe(2);       // 4つ
        expect(s.veg).toBe(1);
        expect(s.fields).toBe(1);
        expect(s.pastures).toBe(1);
        expect(s.stables).toBe(1);     // 柵の中の厩だけ
        expect(s.rooms).toBe(4);       // 石の部屋2つ
        expect(s.unused).toBe(-(15 - 2 - 2 - 2 - 1));
        expect(s.begging).toBe(-6);
        expect(s.majors).toBe(6);
        expect(s.bonus).toBe(2);       // 木5で家具製作所2点
    });
});
