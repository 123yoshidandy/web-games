import { describe, it, expect } from 'vitest';
import { scorePlayer, godValues } from '../public/js/scoring.js';
import { CITIES } from '../public/js/map.js';
import { newGame, setGoods, setCityGood } from './helpers.js';

// ルールブックの得点の例に近い局面を作る
describe('得点', () => {
    it('開始の7枚：ウェスタ1・ユピテル2・サトゥルヌス2・メルクリウス1・マルス1', () => {
        const game = newGame(2);
        const s = scorePlayer(game, 0);
        expect(Object.fromEntries(Object.entries(s.gods).map(([g, r]) => [g, r.cards]))).toEqual({ vesta: 1, jupiter: 2, saturnus: 2, mercurius: 1, mars: 1, minerva: 0 });
    });

    it('ウェスタ：お金と品の値の合計10につき1（ルールブックの例：布1・道具3・れんが1と13で38 → 3）', () => {
        const game = newGame(2);
        setGoods(game, 0, { cloth: 1, tool: 3, brick: 1 });
        game.players[0].money = 13;
        expect(godValues(game, 0).vesta).toBe(3);
    });

    it('ユピテル・サトゥルヌス・メルクリウス・マルス', () => {
        const game = newGame(2);
        const mine = ['novaria', 'aquileia', 'syracusae', 'massilia', 'lutetia'];
        ['brick', 'food', 'food', 'wine', 'cloth'].forEach((g, i) => setCityGood(game, mine[i], g));
        mine.forEach(c => { game.houses[c] = [0]; });
        const v = godValues(game, 0);
        expect(v.jupiter).toBe(4);       // れんが以外の4軒
        expect(v.saturnus).toBe(2);      // イタリアとガリア
        expect(v.mercurius).toBe(8);     // 4種類 × 2
        expect(v.mars).toBe(4);          // 植民者2人 × 2
    });

    it('上限：ユピテル15・メルクリウス10・マルス12', () => {
        const game = newGame(2);
        CITIES.forEach((c, i) => {
            setCityGood(game, c.id, ['food', 'tool', 'wine', 'cloth', 'brick'][i % 5]);
            game.houses[c.id] = [0];
        });
        for (let i = 0; i < 6; i++) game.colonists.push({ id: game.colonists.length, owner: 0, kind: 'land', city: 'roma', road: null });
        const v = godValues(game, 0);
        expect(v.jupiter).toBe(15);
        expect(v.mercurius).toBe(10);
        expect(v.mars).toBe(12);
        expect(v.saturnus).toBe(12);
    });

    it('ミネルウァ：職人カードごとに、その品の都市の家1軒につきカードの点（農夫は食料の都市に3点）', () => {
        const game = newGame(2);
        ['novaria', 'aquileia', 'syracusae', 'massilia'].forEach(c => { setCityGood(game, c, 'food'); game.houses[c] = [0]; });
        const id = game.cards.length;
        game.cards.push({ id, type: 'farmer', phase: 1 });
        game.players[0].discard.push(id);
        expect(scorePlayer(game, 0).gods.minerva.points).toBe(12);
    });

    it('神の点は、その神のカードの枚数を掛ける。コンコルディアのカードは7点', () => {
        const game = newGame(2);
        game.players[0].concordia = true;
        const s = scorePlayer(game, 0);
        const v = godValues(game, 0);
        expect(s.gods.saturnus.points).toBe(2 * v.saturnus);
        expect(s.gods.mars.points).toBe(v.mars);
        expect(s.total).toBe(Object.values(s.gods).reduce((a, r) => a + r.points, 0) + 7);
    });
});
