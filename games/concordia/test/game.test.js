import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { ROADS, CITIES, PROVINCES } from '../public/js/map.js';
import { MARKET_DECKS, DISPLAY_SURCHARGE, BONUS_COINS } from '../public/js/cards.js';
import { newGame, players, cardOf, setGoods, setCityGood, snapshot } from './helpers.js';

const roadId = (a, b, kind) => ROADS.find(r => r.kind === kind && ((r.a === a && r.b === b) || (r.a === b && r.b === a))).id;
const play = (game, seat, type, extra = {}) => game.applyCommand(seat, { type: 'play', card: cardOf(game, seat, type), ...extra });

describe('準備', () => {
    it('お金は手番の順に 5・6・7…、倉庫は 食料2・ほか1ずつと植民者4人、手札は7枚', () => {
        const game = newGame(5);
        expect(game.players.map(p => p.money)).toEqual([5, 6, 7, 8, 9]);
        game.players.forEach(p => {
            expect(p.goods).toEqual({ brick: 1, food: 2, tool: 1, wine: 1, cloth: 1 });
            expect(p.store).toEqual({ land: 2, sea: 2 });
            expect(game.storeUsed(p)).toBe(10);
            expect(p.hand.map(id => game.cards[id].type).sort()).toEqual(['architect', 'diplomat', 'mercator', 'prefect', 'prefect', 'senator', 'tribune']);
        });
        // 陸と海の植民者が1人ずつローマに
        expect(game.colonists.filter(c => c.city === 'roma')).toHaveLength(10);
    });

    it('プラエフェクトゥス・マグヌスは最後の手番の人', () => {
        expect(newGame(3).magnus).toBe(2);
        expect(newGame(2).magnus).toBe(1);
    });

    it('市場は7枚で、人数より大きい番号の山は使わない', () => {
        [2, 3, 4, 5].forEach(n => {
            const game = newGame(n);
            const total = [1, 2, 3, 4, 5].filter(k => k <= n).reduce((s, k) => s + MARKET_DECKS[k].length, 0);
            expect(game.display.filter(id => id !== null)).toHaveLength(7);
            expect(game.display.length + game.deck.length).toBe(total);
            expect(game.cards.filter(c => c.phase).every(c => c.phase <= n)).toBe(true);
        });
        // 山 I が上（市場の7枚はすべて I）
        const game = newGame(4);
        expect(game.display.every(id => game.cards[id].phase === 1)).toBe(true);
    });

    it('都市の品は文字ごとのトークンで、州のボーナスは州でいちばん値の高い品', () => {
        const game = newGame(3, 7);
        const order = ['brick', 'food', 'tool', 'wine', 'cloth'];
        PROVINCES.forEach(pr => {
            const goods = CITIES.filter(c => c.province === pr.id).map(c => game.cityGoods[c.id]);
            const best = goods.reduce((a, b) => (order.indexOf(b) > order.indexOf(a) ? b : a));
            expect(game.bonus[pr.id]).toEqual({ good: best, active: true });
        });
    });

    it('同じシードなら同じ準備になる', () => {
        expect(snapshot(newGame(4, 99))).toBe(snapshot(newGame(4, 99)));
        expect(snapshot(newGame(4, 99))).not.toBe(snapshot(newGame(4, 100)));
    });
});

describe('護民官', () => {
    it('捨て札を全部戻し、護民官を含めて3枚を超えた分のお金を受け取る', () => {
        const game = newGame(2);
        const p = game.players[0];
        // 3枚を捨て札に
        p.discard = p.hand.filter(id => ['architect', 'senator', 'diplomat', 'mercator'].includes(game.cards[id].type));
        p.hand = p.hand.filter(id => !p.discard.includes(id));
        const money = p.money;
        expect(play(game, 0, 'tribune')).toBe(true);
        expect(p.hand).toHaveLength(7);
        expect(p.discard).toHaveLength(0);
        expect(p.money).toBe(money + 2); // 5枚戻して、3枚を超えた2枚分
    });

    it('食料1と道具1で、倉庫の植民者を1人ローマに置ける', () => {
        const game = newGame(2);
        const p = game.players[0];
        expect(play(game, 0, 'tribune', { colonist: 'sea' })).toBe(true);
        expect(p.goods.food).toBe(1);
        expect(p.goods.tool).toBe(0);
        expect(p.store.sea).toBe(1);
        expect(game.colonists.filter(c => c.owner === 0 && c.city === 'roma')).toHaveLength(3);
    });

    it('品が足りなければ植民者は置けず、状態は変わらない', () => {
        const game = newGame(2);
        setGoods(game, 0, { food: 1 });
        const before = snapshot(game);
        expect(play(game, 0, 'tribune', { colonist: 'land' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});

describe('建築家', () => {
    it('盤上の植民者の数だけ歩数があり、ローマから道へ1歩で出る', () => {
        const game = newGame(2);
        expect(play(game, 0, 'architect')).toBe(true);
        expect(game.phase).toBe('architect');
        expect(game.architect.steps).toBe(2);
        const land = game.colonists.find(c => c.owner === 0 && c.kind === 'land');
        expect(game.applyCommand(0, { type: 'move', colonist: land.id, road: roadId('roma', 'aquileia', 'land') })).toBe(true);
        expect(game.architect.steps).toBe(1);
        expect(land.road).toBe(roadId('roma', 'aquileia', 'land'));
    });

    it('2歩でアクィレイア〜ウィンドボナへ行ける（ルールブックの例）。陸の植民者は海路を通れない', () => {
        const game = newGame(2);
        play(game, 0, 'architect');
        const land = game.colonists.find(c => c.owner === 0 && c.kind === 'land');
        expect(game.distance(land, roadId('aquileia', 'vindobona', 'land'))).toBe(2);
        expect(game.distance(land, roadId('roma', 'massilia', 'sea'))).toBe(Infinity);
        expect(game.applyCommand(0, { type: 'move', colonist: land.id, road: roadId('roma', 'massilia', 'sea') })).toBe(false);
        expect(game.applyCommand(0, { type: 'move', colonist: land.id, road: roadId('aquileia', 'vindobona', 'land') })).toBe(true);
        expect(game.architect.steps).toBe(0);
    });

    it('ほかの植民者のいる道には止まれないが、通り抜けて歩数に数える', () => {
        const game = newGame(2);
        const other = game.colonists.find(c => c.owner === 1 && c.kind === 'land');
        other.city = null;
        other.road = roadId('roma', 'aquileia', 'land');
        play(game, 0, 'architect');
        const land = game.colonists.find(c => c.owner === 0 && c.kind === 'land');
        expect(game.applyCommand(0, { type: 'move', colonist: land.id, road: roadId('roma', 'aquileia', 'land') })).toBe(false);
        expect(game.lastError).toContain('止まれません');
        expect(game.applyCommand(0, { type: 'move', colonist: land.id, road: roadId('aquileia', 'vindobona', 'land') })).toBe(true);
    });

    it('歩数が足りなければ動けない', () => {
        const game = newGame(2);
        play(game, 0, 'architect');
        const land = game.colonists.find(c => c.owner === 0 && c.kind === 'land');
        expect(game.applyCommand(0, { type: 'move', colonist: land.id, road: roadId('sirmium', 'napoca', 'land') })).toBe(false);
        expect(game.lastError).toBe('歩数が足りません');
    });

    it('道の両端の都市に建てられ、費用は れんが＋都市の品とお金（軒数を掛ける）。ローマには建てられない', () => {
        const game = newGame(3);
        setCityGood(game, 'aquileia', 'food');
        game.houses.aquileia = [1, 2];
        setGoods(game, 0, { brick: 2, food: 2 });
        game.players[0].money = 10;
        play(game, 0, 'architect');
        const land = game.colonists.find(c => c.owner === 0 && c.kind === 'land');
        game.applyCommand(0, { type: 'move', colonist: land.id, road: roadId('roma', 'aquileia', 'land') });
        expect(game.applyCommand(0, { type: 'build', city: 'roma' })).toBe(false);
        expect(game.applyCommand(0, { type: 'build', city: 'aquileia' })).toBe(true);
        // 食料の都市の3軒目：れんが1・食料1・2×3 セステルティウス
        expect(game.players[0].goods.brick).toBe(1);
        expect(game.players[0].goods.food).toBe(1);
        expect(game.players[0].money).toBe(4);
        expect(game.houses.aquileia).toEqual([1, 2, 0]);
        // 同じ都市に2軒目は建てられない
        expect(game.applyCommand(0, { type: 'build', city: 'aquileia' })).toBe(false);
    });

    it('れんがの都市は食料1とお金1。建てたあとは動けない', () => {
        const game = newGame(2);
        setCityGood(game, 'novaria', 'brick');
        setGoods(game, 0, { food: 1 });
        play(game, 0, 'architect');
        const land = game.colonists.find(c => c.owner === 0 && c.kind === 'land');
        game.applyCommand(0, { type: 'move', colonist: land.id, road: roadId('roma', 'novaria', 'land') });
        const money = game.players[0].money;
        expect(game.applyCommand(0, { type: 'build', city: 'novaria' })).toBe(true);
        expect(game.players[0].goods.food).toBe(0);
        expect(game.players[0].money).toBe(money - 1);
        const sea = game.colonists.find(c => c.owner === 0 && c.kind === 'sea');
        expect(game.applyCommand(0, { type: 'move', colonist: sea.id, road: roadId('roma', 'massilia', 'sea') })).toBe(false);
        expect(game.applyCommand(0, { type: 'finish' })).toBe(true);
        expect(game.current).toBe(1);
    });

    it('払えなければ建てられない', () => {
        const game = newGame(2);
        setCityGood(game, 'novaria', 'cloth');
        game.players[0].money = 4;
        play(game, 0, 'architect');
        const land = game.colonists.find(c => c.owner === 0 && c.kind === 'land');
        game.applyCommand(0, { type: 'move', colonist: land.id, road: roadId('roma', 'novaria', 'land') });
        expect(game.applyCommand(0, { type: 'build', city: 'novaria' })).toBe(false);
        expect(game.lastError).toBe('品かお金が足りません');
    });
});

describe('属州総督', () => {
    it('ボーナスの品を受け取り、州の家すべてが持ち主に品を出し、ボーナスはお金の面になる', () => {
        const game = newGame(3);
        const pr = 'italia';
        game.bonus[pr].good = 'wine';
        setCityGood(game, 'novaria', 'food');
        setCityGood(game, 'aquileia', 'tool');
        game.houses.novaria = [1];
        game.houses.aquileia = [0, 1];
        expect(play(game, 0, 'prefect', { province: pr })).toBe(true);
        expect(game.players[0].goods.wine).toBe(2);   // ボーナス
        expect(game.players[0].goods.tool).toBe(2);   // アクィレイアの家
        expect(game.players[1].goods.food).toBe(3);
        expect(game.players[1].goods.tool).toBe(2);
        expect(game.bonus[pr].active).toBe(false);
        // お金の面の州は選べない
        expect(game.applyCommand(1, { type: 'play', card: cardOf(game, 1, 'prefect'), province: pr })).toBe(false);
    });

    it('プラエフェクトゥス・マグヌスの持ち主はボーナスが2倍になり、マグヌスは右の人へ移る', () => {
        const game = newGame(3);
        game.current = 2;
        game.bonus.gallia.good = 'cloth';
        expect(play(game, 2, 'prefect', { province: 'gallia' })).toBe(true);
        expect(game.players[2].goods.cloth).toBe(3);
        expect(game.magnus).toBe(1);
    });

    it('お金を集めると、お金の面のコインの分を受け取り、全部を品の面に戻す（マグヌスは使わない）', () => {
        const game = newGame(3);
        game.current = 2;
        game.bonus.gallia = { good: 'cloth', active: false };
        game.bonus.mauretania = { good: 'brick', active: false };
        const money = game.players[2].money;
        expect(play(game, 2, 'prefect', { cash: true })).toBe(true);
        expect(game.players[2].money).toBe(money + BONUS_COINS.cloth + BONUS_COINS.brick);
        expect(Object.values(game.bonus).every(b => b.active)).toBe(true);
        expect(game.magnus).toBe(2);
    });
});

describe('商人', () => {
    it('3を受け取り、2種類まで売り買いする（値段は れんが3〜布7）', () => {
        const game = newGame(2);
        expect(play(game, 0, 'mercator', { trades: [{ good: 'cloth', amount: -1 }, { good: 'brick', amount: 3 }] })).toBe(true);
        const p = game.players[0];
        expect(p.money).toBe(5 + 3 + 7 - 9);
        expect(p.goods.cloth).toBe(0);
        expect(p.goods.brick).toBe(4);
    });

    it('3種類は売り買いできず、倉庫の空きを超えて買えず、お金が足りなければ買えない', () => {
        const game = newGame(2);
        const before = snapshot(game);
        expect(play(game, 0, 'mercator', { trades: [{ good: 'cloth', amount: -1 }, { good: 'wine', amount: -1 }, { good: 'brick', amount: 1 }] })).toBe(false);
        game.players[0].money = 100;
        expect(play(game, 0, 'mercator', { trades: [{ good: 'brick', amount: 3 }] })).toBe(false);
        expect(game.lastError).toBe('倉庫に入りきりません');
        game.players[0].money = 5;
        expect(snapshot(game)).toBe(before);
        expect(play(game, 0, 'mercator', { trades: [{ good: 'cloth', amount: 2 }] })).toBe(false);
        expect(game.lastError).toBe('お金が足りません');
    });

    it('買った商人は5を受け取る', () => {
        const game = newGame(2);
        const p = game.players[0];
        const id = game.cards.length;
        game.cards.push({ id, type: 'mercator5', phase: 1 });
        p.hand.push(id);
        expect(game.applyCommand(0, { type: 'play', card: id, trades: [] })).toBe(true);
        expect(p.money).toBe(10);
    });
});

describe('元老院議員と執政官', () => {
    it('元老院議員はカードの費用と置き場所の追加の費用を払って2枚まで買い、市場は左に詰めて補充する', () => {
        const game = newGame(3);
        const p = game.players[0];
        setGoods(game, 0, { brick: 3, food: 3, tool: 3, wine: 3, cloth: 3 });
        const c1 = game.display[1];
        const c3 = game.display[3];
        const cost = (slot) => game.marketCost(slot, true);
        expect(cost(3).goods.cloth ?? 0).toBeGreaterThanOrEqual(1); // 4番目は布が追加
        expect(cost(1).wild).toBe(DISPLAY_SURCHARGE[1].length);
        const before = { ...p.goods };
        const count = (slot) => Object.values(cost(slot).goods).reduce((s, n) => s + n, 0) + cost(slot).wild;
        const expected = count(1) + count(3);
        expect(play(game, 0, 'senator', { buys: [{ slot: 1, wild: ['brick'] }, { slot: 3, wild: [] }] })).toBe(true);
        expect(p.hand).toContain(c1);
        expect(p.hand).toContain(c3);
        const spent = Object.keys(before).reduce((s, g) => s + before[g] - p.goods[g], 0);
        expect(spent).toBe(expected);
        expect(game.display.filter(id => id !== null)).toHaveLength(7);
        expect(game.display).not.toContain(c1);
    });

    it('執政官はカードの費用だけで1枚、2枚は買えない', () => {
        const game = newGame(3);
        const p = game.players[0];
        const id = game.cards.length;
        game.cards.push({ id, type: 'consul', phase: 2 });
        p.hand.push(id);
        setGoods(game, 0, { brick: 2, food: 2, tool: 2, wine: 2, cloth: 2 });
        expect(game.applyCommand(0, { type: 'play', card: id, buys: [{ slot: 5, wild: [] }, { slot: 6, wild: [] }] })).toBe(false);
        const card = game.display[6];
        const { goods } = game.marketCost(6, false);
        expect(game.applyCommand(0, { type: 'play', card: id, buys: [{ slot: 6, wild: [] }] })).toBe(true);
        expect(p.hand).toContain(card);
        Object.entries(goods).forEach(([g, n]) => expect(p.goods[g]).toBe(2 - n));
    });

    it('品が足りなければ買えず、状態は変わらない', () => {
        const game = newGame(3);
        setGoods(game, 0, {});
        const before = snapshot(game);
        expect(play(game, 0, 'senator', { buys: [{ slot: 0, wild: [] }] })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});

describe('植民者と職人と外交官', () => {
    const give = (game, seat, type) => {
        const id = game.cards.length;
        game.cards.push({ id, type, phase: 1 });
        game.players[seat].hand.push(id);
        return id;
    };

    it('植民者：食料1・道具1ずつで、ローマか自分の家の都市に何人でも置ける', () => {
        const game = newGame(2);
        const id = give(game, 0, 'colonist');
        game.houses.novaria = [0];
        setGoods(game, 0, { food: 2, tool: 2 });
        expect(game.applyCommand(0, { type: 'play', card: id, place: [{ city: 'massilia', kind: 'land' }] })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: id, place: [{ city: 'roma', kind: 'sea' }, { city: 'novaria', kind: 'land' }] })).toBe(true);
        expect(game.players[0].store).toEqual({ land: 1, sea: 1 });
        expect(game.colonists.filter(c => c.owner === 0 && c.city === 'novaria')).toHaveLength(1);
    });

    it('植民者：お金なら 5＋盤上の自分の植民者の数', () => {
        const game = newGame(2);
        const id = give(game, 0, 'colonist');
        expect(game.applyCommand(0, { type: 'play', card: id, cash: true })).toBe(true);
        expect(game.players[0].money).toBe(5 + 5 + 2);
    });

    it('職人：その品の都市の自分の家が1つずつ生産する', () => {
        const game = newGame(2);
        const id = give(game, 0, 'vintner');
        setCityGood(game, 'novaria', 'wine');
        setCityGood(game, 'massilia', 'wine');
        setCityGood(game, 'aquileia', 'food');
        game.houses.novaria = [0];
        game.houses.massilia = [0, 1];
        game.houses.aquileia = [0];
        expect(game.applyCommand(0, { type: 'play', card: id })).toBe(true);
        expect(game.players[0].goods.wine).toBe(3);
        expect(game.players[1].goods.wine).toBe(1);
    });

    it('外交官：ほかの人の捨て札のいちばん上の効果を行う。外交官はまねられない', () => {
        const game = newGame(3);
        expect(play(game, 0, 'mercator', { trades: [] })).toBe(true);
        expect(play(game, 1, 'diplomat', { copy: 0, trades: [] })).toBe(true);
        expect(game.players[1].money).toBe(6 + 3);
        expect(game.cards[game.players[1].discard.at(-1)].type).toBe('diplomat');
        // 2番目の人の捨て札は外交官なので、まねられない
        expect(play(game, 2, 'diplomat', { copy: 1, trades: [] })).toBe(false);
        // 捨て札がない人はまねられない
        game.players[0].discard = [];
        expect(play(game, 2, 'diplomat', { copy: 0, trades: [] })).toBe(false);
    });

    it('外交官で護民官はまねられない（護民官を使うと捨て札が空になる）', () => {
        const game = newGame(2);
        expect(play(game, 0, 'tribune')).toBe(true);
        expect(game.players[0].discard).toHaveLength(0);
        expect(play(game, 1, 'diplomat', { copy: 0 })).toBe(false);
    });
});

describe('倉庫', () => {
    it('12マスを超える品は受け取れない', () => {
        const game = newGame(2);
        setGoods(game, 0, { brick: 7, food: 1 });
        game.bonus.italia.good = 'cloth';
        game.houses.novaria = [0];
        game.houses.aquileia = [0];
        expect(game.storeUsed(game.players[0])).toBe(12);
        play(game, 0, 'prefect', { province: 'italia' });
        expect(game.storeUsed(game.players[0])).toBe(12);
        expect(game.players[0].goods.cloth).toBe(0);
    });
});

describe('終わり', () => {
    it('15軒目の家でコンコルディアのカードを受け取り、ほかの人が1回ずつ手番を行って終わる', () => {
        const game = newGame(3);
        // 14軒を建てた状態にする
        CITIES.filter(c => c.id !== 'vindobona').slice(0, 14).forEach(c => { game.houses[c.id] = [0]; });
        setCityGood(game, 'vindobona', 'brick');
        setGoods(game, 0, { food: 1 });
        const land = game.colonists.find(c => c.owner === 0 && c.kind === 'land');
        land.city = null;
        land.road = roadId('aquileia', 'vindobona', 'land');
        play(game, 0, 'architect');
        expect(game.applyCommand(0, { type: 'build', city: 'vindobona' })).toBe(true);
        expect(game.players[0].concordia).toBe(true);
        expect(game.applyCommand(0, { type: 'finish' })).toBe(true);
        expect(game.isOver()).toBe(false);
        play(game, 1, 'mercator', { trades: [] });
        expect(game.isOver()).toBe(false);
        play(game, 2, 'mercator', { trades: [] });
        expect(game.isOver()).toBe(true);
        expect(game.results).toHaveLength(3);
        expect(game.results[0].concordia).toBe(7);
        expect(game.applyCommand(0, { type: 'play', card: game.players[0].hand[0] })).toBe(false);
    });

    it('市場の最後のカードを買うと終わりが決まる', () => {
        const game = newGame(2);
        game.deck = [];
        game.display = [game.display[0], null, null, null, null, null, null];
        setGoods(game, 0, { brick: 3, food: 3, tool: 3, wine: 3, cloth: 3 });
        expect(play(game, 0, 'senator', { buys: [{ slot: 0, wild: [] }] })).toBe(true);
        expect(game.players[0].concordia).toBe(true);
        expect(game.finalTurns).toEqual([1]);
        play(game, 1, 'mercator', { trades: [] });
        expect(game.isOver()).toBe(true);
    });

    it('同点なら、プラエフェクトゥス・マグヌスの持ち主か、次に受け取る人の勝ち', () => {
        const game = newGame(3);
        game.magnus = 1;
        // 全員同じ点（何もしていない）にして終える
        game.finish();
        expect(game.winners).toEqual([1]);
        const game2 = newGame(3);
        game2.magnus = 0;
        game2.players[0].money = 0;    // 0 番だけ点が低い
        game2.players[1].money = 9;
        game2.players[2].money = 9;
        game2.finish();
        // マグヌスは右回り（0 → 2 → 1）に移るので、同点の 1 と 2 のうち 2 が先
        expect(game2.winners).toEqual([2]);
    });
});

describe('操作の受け付けと記録', () => {
    it('手番でない人・知らない操作・手札にないカードは断り、状態を変えない', () => {
        const game = newGame(3);
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'play', card: cardOf(game, 1, 'mercator'), trades: [] })).toBe(false);
        expect(game.applyCommand(0, { type: 'dance' })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 9999 })).toBe(false);
        expect(game.applyCommand(0, { type: 'move', colonist: 0, road: 0 })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: cardOf(game, 0, 'prefect'), province: 'atlantis' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('記録する項目は決まったものだけ', () => {
        const game = newGame(2);
        play(game, 0, 'mercator', { trades: [], secret: 'x' });
        expect(Object.keys(game.commands[0].command).sort()).toEqual(['card', 'trades', 'type']);
    });

    it('操作の記録から同じ状態を再現できる', () => {
        const game = newGame(3, 5);
        play(game, 0, 'architect');
        const land = game.colonists.find(c => c.owner === 0 && c.kind === 'land');
        game.applyCommand(0, { type: 'move', colonist: land.id, road: roadId('roma', 'novaria', 'land') });
        game.applyCommand(0, { type: 'finish' });
        play(game, 1, 'prefect', { province: 'gallia' });
        play(game, 2, 'mercator', { trades: [{ good: 'cloth', amount: -1 }] });
        const saved = JSON.parse(JSON.stringify(game.persist()));
        const copy = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(copy)).toBe(snapshot(game));
    });

    it('人数は2〜5人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(6))).toThrow();
        expect(() => new Game(players(5))).not.toThrow();
    });
});
