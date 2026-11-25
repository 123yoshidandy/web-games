import { describe, it, expect } from 'vitest';
import { buildingOf, residencePoints } from '../public/js/data.js';
import { newGame, setCity, setIsland } from './helpers.js';

describe('建物のデータ', () => {
    it('資料で食い違った建物：工場 7・大学 8、大市場 5/2、大倉庫 6/2。コーヒー焙煎所は 2 人', () => {
        expect(buildingOf('factory')).toMatchObject({ cost: 7, vp: 3 });
        expect(buildingOf('university')).toMatchObject({ cost: 8, vp: 3 });
        expect(buildingOf('largeMarket')).toMatchObject({ cost: 5, vp: 2 });
        expect(buildingOf('largeWarehouse')).toMatchObject({ cost: 6, vp: 2 });
        expect(buildingOf('coffeeRoaster').capacity).toBe(2);
    });
});

describe('大きい建物の点', () => {
    it('ギルドホール：小さい生産の建物 1 点、大きい生産の建物 2 点', () => {
        const game = newGame(3);
        setCity(game, 0, [['guildHall'], ['smallIndigoPlant', 0], ['sugarMill', 0], ['coffeeRoaster', 0], ['office']]);
        expect(game.bonus(0, 'guildHall')).toBe(1 + 2 + 2);
    });

    it('邸宅：島の埋まったマス 9 以下 4 点、10 で 5、11 で 6、12 で 7', () => {
        expect([5, 9, 10, 11, 12].map(residencePoints)).toEqual([4, 4, 5, 6, 7]);
    });

    it('砦：入植者（島・都市・サンフアン）3 人につき 1 点。市庁舎：紫の建物（大きい建物を含む）1 つにつき 1 点', () => {
        const game = newGame(3);
        setIsland(game, 0, [['corn'], ['corn'], ['quarry', false]]);
        setCity(game, 0, [['fortress'], ['cityHall'], ['indigoPlant', 3], ['harbor', 0]]);
        game.players[0].sanJuan = 2;
        // 2 + 1 + 1 + 3 + 2 = 9
        expect(game.bonus(0, 'fortress')).toBe(3);
        expect(game.bonus(0, 'cityHall')).toBe(3);
    });
});
