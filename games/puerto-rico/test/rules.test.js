import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { BUILDINGS, SETUP } from '../public/js/data.js';
import { newGame, players, ok, ng, pick, setCity, setIsland, setGoods, snapshot, playOut } from './helpers.js';

describe('準備', () => {
    it.each([3, 4, 5])('%i 人：役割・入植者・勝利点チップ・お金・船・最初の農園', n => {
        const game = newGame(n);
        const s = SETUP[n];
        expect(game.roles.map(r => r.key)).toEqual(s.roles);
        expect(game.colonists).toBe(s.colonists);
        expect(game.shipColonists).toBe(n);
        expect(game.chips).toBe(s.chips);
        expect(game.players.every(p => p.money === n - 1)).toBe(true);
        expect(game.ships.map(x => x.size)).toEqual(s.ships);
        // 総督から順に 藍・藍(・藍)・とうもろこし
        const types = game.order(game.governor).map(i => game.players[i].island[0].type);
        expect(types).toEqual(s.start);
        expect(game.faceUp.length).toBe(n + 1);
        expect(game.decision).toEqual({ seat: game.governor, kind: 'role' });
    });

    it('建物は 23 種：小さい生産 4 枚ずつ、大きい生産 3 枚ずつ、紫 2 枚ずつ、大きい建物 1 枚ずつ', () => {
        expect(BUILDINGS.length).toBe(23);
        expect(BUILDINGS.filter(b => b.kind === 'production' && b.small).every(b => b.count === 4)).toBe(true);
        expect(BUILDINGS.filter(b => b.kind === 'production' && !b.small).every(b => b.count === 3)).toBe(true);
        expect(BUILDINGS.filter(b => b.kind === 'violet').every(b => b.count === 2)).toBe(true);
        expect(BUILDINGS.filter(b => b.kind === 'large').every(b => b.count === 1 && b.size === 2 && b.cost === 10 && b.vp === 4)).toBe(true);
    });
});

describe('役割', () => {
    it('ラウンドの終わりに、選ばれなかった役割に 1 ドゥブロン。選んだ人はそのお金をもらう。総督が左へ', () => {
        const game = newGame(3);
        const g = game.governor;
        pick(game, 'trader');
        pick(game, 'builder');
        // 建てられる人がいれば、全員パス
        while (game.decision?.kind === 'build') ok(game, game.decision.seat, { type: 'build', building: null });
        pick(game, 'craftsman');
        if (game.decision?.kind === 'privilege') ok(game, game.decision.seat, { type: 'privilege', good: null });
        expect(game.round).toBe(2);
        expect(game.governor).toBe((g + 1) % 3);
        const money = Object.fromEntries(game.roles.map(r => [r.key, r.money]));
        expect(money).toEqual({ settler: 1, mayor: 1, builder: 0, craftsman: 0, trader: 0, captain: 1 });
        const seat = game.decision.seat;
        const before = game.players[seat].money;
        pick(game, 'captain');
        expect(game.players[seat].money).toBe(before + 1);
    });

    it('金鉱掘りは選んだ人が 1 ドゥブロン（4 人から）', () => {
        const game = newGame(4);
        const seat = game.decision.seat;
        pick(game, 'prospector');
        expect(game.players[seat].money).toBe(3 + 1);
        expect(game.decision.seat).toBe((seat + 1) % 4);
    });
});

describe('開拓者', () => {
    it('選んだ人から順に表の農園を 1 枚。石切り場は選んだ人だけ。残りは捨てて、人数 +1 枚を表にする', () => {
        const game = newGame(3);
        const s = pick(game, 'settler');
        expect(game.decision).toMatchObject({ seat: s, canQuarry: true });
        ok(game, s, { type: 'settle', take: 'quarry' });
        expect(game.decision).toMatchObject({ seat: (s + 1) % 3, canQuarry: false });
        ng(game, (s + 1) % 3, { type: 'settle', take: 'quarry' });
        const first = game.faceUp[0];
        ok(game, (s + 1) % 3, { type: 'settle', take: 0 });
        expect(game.players[(s + 1) % 3].island.at(-1)).toEqual({ type: first, occupied: false });
        ok(game, (s + 2) % 3, { type: 'settle', take: null });
        expect(game.quarries).toBe(7);
        expect(game.faceUp.length).toBe(4);
        expect(game.discards.length).toBe(3);
    });

    it('建設小屋で石切り場、救護院で入植者付き、アシエンダで山から 1 枚多く', () => {
        const game = newGame(3);
        const s = game.decision.seat;
        const o = (s + 1) % 3;
        setCity(game, o, [['constructionHut'], ['hospice'], ['hacienda']]);
        pick(game, 'settler');
        ok(game, s, { type: 'settle', take: null });
        expect(game.decision).toMatchObject({ seat: o, canQuarry: true, canHacienda: true });
        const deck = game.deck.length;
        ok(game, o, { type: 'hacienda' });
        expect(game.deck.length).toBe(deck - 1);
        ng(game, o, { type: 'hacienda' });
        ok(game, o, { type: 'settle', take: 'quarry' });
        const island = game.players[o].island;
        expect(island.length).toBe(3);
        expect(island[1].occupied).toBe(false);
        expect(island[2]).toEqual({ type: 'quarry', occupied: true });
    });
});

describe('市長', () => {
    it('選んだ人は補充の山から 1 人多く。船の入植者は選んだ人から 1 人ずつ。空いたマスがあればサンフアンに残せない', () => {
        const game = newGame(3);
        const s = game.decision.seat;
        game.players.forEach((p, i) => setIsland(game, i, [['corn', false], ['indigo', false], ['sugar', false], ['quarry', false]]));
        setCity(game, s, [['indigoPlant', 0]]);
        game.shipColonists = 5;
        pick(game, 'mayor');
        // 5 人を 3 人に：選んだ人 2、次 2、次 1。選んだ人はさらに 1
        expect(game.decision).toMatchObject({ seat: s, kind: 'mayor', total: 3 });
        expect(game.players[(s + 1) % 3].sanJuan).toBe(2);
        expect(game.players[(s + 2) % 3].sanJuan).toBe(1);
        expect(ng(game, s, { type: 'mayor', island: [true, false, false, false], city: [1] })).toContain('サンフアン');
        ok(game, s, { type: 'mayor', island: [true, true, false, false], city: [1] });
        expect(game.players[s].sanJuan).toBe(0);
    });

    it('船には、全員の建物の空いた枠の数（少なくとも人数）だけ載る。補充の山が足りなければゲームの終わり', () => {
        const game = newGame(3);
        game.players.forEach((p, i) => { setIsland(game, i, []); setCity(game, i, []); p.sanJuan = 0; });
        setCity(game, 0, [['coffeeRoaster', 0], ['tobaccoStorage', 0]]);
        game.colonists = 4;
        game.shipColonists = 0;
        pick(game, 'mayor');
        while (game.decision?.kind === 'mayor') {
            const p = game.players[game.decision.seat];
            ok(game, game.decision.seat, { type: 'mayor', island: [], city: p.city.map((c, i) => Math.min(i === 0 ? 2 : 3, game.decision.total - (i === 0 ? 0 : Math.min(2, game.decision.total)))) });
        }
        // 空いた枠 5 > 補充の山 3（選んだ人が 1 人取ったあと）
        expect(game.shipColonists).toBe(3);
        expect(game.colonists).toBe(0);
        expect(game.endTriggered).toBe('colonists');
    });
});

describe('建築家', () => {
    it('選んだ人は 1 安い。石切り場は列の数まで 1 ずつ安い。同じ建物は 2 つ持てない。大学で入植者付き', () => {
        const game = newGame(3);
        const s = game.decision.seat;
        game.players[s].money = 10;
        setIsland(game, s, [['quarry'], ['quarry'], ['quarry'], ['corn']]);
        setCity(game, s, [['university'], ['smallMarket']]);
        pick(game, 'builder');
        // 工場 7 - 1 - 石切り場 3（3 列目）= 3
        expect(game.buildCost(s, 'factory')).toBe(3);
        // 小さい藍染め場 1 - 1 - 1 = 0（0 未満にならない）
        expect(game.buildCost(s, 'smallIndigoPlant')).toBe(0);
        ng(game, s, { type: 'build', building: 'smallMarket' });
        ok(game, s, { type: 'build', building: 'factory' });
        expect(game.players[s].money).toBe(7);
        expect(game.players[s].city.at(-1)).toEqual({ key: 'factory', colonists: 1 });
        expect(game.buildings.factory).toBe(1);
    });

    it('都市の 12 マスが埋まると、そのラウンドの終わりにゲームが終わる（大きい建物は 2 マス）', () => {
        const game = newGame(3);
        const s = game.decision.seat;
        game.players[s].money = 20;
        setCity(game, s, ['smallMarket', 'hacienda', 'constructionHut', 'smallWarehouse', 'hospice', 'office', 'largeMarket', 'largeWarehouse', 'harbor', 'wharf'].map(k => [k, 0]));
        pick(game, 'builder');
        ok(game, s, { type: 'build', building: 'cityHall' });
        expect(game.citySpaces(s)).toBe(12);
        expect(game.endTriggered).toBe('city');
        expect(game.isOver()).toBe(false);
        playOut(game);
        expect(game.round).toBe(1);
    });
});

describe('監督', () => {
    it('生産は、入植者のいる農園と、生産の建物の入植者の少ない方（とうもろこしは建物なし）。選んだ人は 1 つ多く。工場はお金', () => {
        const game = newGame(3);
        const s = game.decision.seat;
        game.players.forEach((p, i) => { setIsland(game, i, []); setCity(game, i, []); });
        setIsland(game, s, [['corn'], ['corn'], ['indigo'], ['indigo'], ['sugar'], ['coffee', false]]);
        setCity(game, s, [['indigoPlant', 1], ['smallSugarMill', 1], ['factory', 1], ['coffeeRoaster', 2]]);
        const money = game.players[s].money;
        pick(game, 'craftsman');
        expect(game.players[s].goods).toMatchObject({ corn: 2, indigo: 1, sugar: 1, coffee: 0 });
        // 3 種類で工場 2
        expect(game.players[s].money).toBe(money + 2);
        expect(game.decision).toMatchObject({ seat: s, kind: 'privilege', goods: ['corn', 'indigo', 'sugar'] });
        ok(game, s, { type: 'privilege', good: 'sugar' });
        expect(game.players[s].goods.sugar).toBe(2);
    });

    it('品の在庫が足りなければ、選んだ人から順に足りる分だけ', () => {
        const game = newGame(3);
        const s = game.decision.seat;
        game.players.forEach((p, i) => { setIsland(game, i, [['corn'], ['corn'], ['corn']]); setCity(game, i, []); });
        game.supply.corn = 4;
        pick(game, 'craftsman');
        expect(game.players[s].goods.corn).toBe(3);
        expect(game.players[(s + 1) % 3].goods.corn).toBe(1);
        expect(game.players[(s + 2) % 3].goods.corn).toBe(0);
    });
});

describe('商人', () => {
    it('値段は品＋選んだ人 1＋市場。商館に同じ品は売れない（事務所なら売れる）。4 つで空になる', () => {
        const game = newGame(3);
        const s = game.decision.seat;
        const o = (s + 1) % 3;
        const t = (s + 2) % 3;
        setGoods(game, s, { coffee: 1 });
        setGoods(game, o, { coffee: 1, corn: 1 });
        setGoods(game, t, { coffee: 1, tobacco: 2 });
        setCity(game, s, [['smallMarket'], ['largeMarket']]);
        setCity(game, t, [['office']]);
        game.tradingHouse = ['indigo'];
        const m = game.players.map(p => p.money);
        pick(game, 'trader');
        ok(game, s, { type: 'sell', good: 'coffee' });
        expect(game.players[s].money).toBe(m[s] + 4 + 1 + 1 + 2);
        ng(game, o, { type: 'sell', good: 'coffee' });
        ok(game, o, { type: 'sell', good: 'corn' });
        expect(game.players[o].money).toBe(m[o]);
        ok(game, t, { type: 'sell', good: 'coffee' });
        expect(game.tradingHouse).toEqual([]);
        expect(game.supply.coffee).toBe(9 + 2);
    });
});

describe('船長', () => {
    function captainGame() {
        const game = newGame(3);
        game.players.forEach((p, i) => { setGoods(game, i, {}); setCity(game, i, []); });
        return game;
    }

    it('同じ品は同じ船に、船ごとに 1 種類。積めるだけ積む。選んだ人は最初に積むとき +1 点、港は毎回 +1 点', () => {
        const game = captainGame();
        const s = game.decision.seat;
        const o = (s + 1) % 3;
        setGoods(game, s, { corn: 6, indigo: 1 });
        setGoods(game, o, { corn: 2, sugar: 1 });
        setCity(game, o, [['harbor']]);
        pick(game, 'captain');
        ng(game, s, { type: 'ship', good: 'corn', ship: 9 });
        ok(game, s, { type: 'ship', good: 'corn', ship: 0 });
        // 4 の船に 4 つ。4 + 1 点
        expect(game.ships[0]).toEqual({ size: 4, good: 'corn', count: 4 });
        expect(game.players[s].chips).toBe(5);
        // とうもろこしは満杯の船にしか載らないので、ほかの船には積めない
        expect(game.decision.options.some(x => x.good === 'corn')).toBe(false);
        ok(game, o, { type: 'ship', good: 'sugar', ship: 1 });
        expect(game.players[o].chips).toBe(2);
        ok(game, s, { type: 'ship', good: 'indigo', ship: 2 });
        expect(game.players[s].chips).toBe(6);
        // 積めない人ばかりになったら終わり。満杯の船は空く。品は 1 つだけ残る
        expect(game.ships[0]).toEqual({ size: 4, good: null, count: 0 });
        expect(game.players[s].goods.corn).toBe(1);
        expect(game.players[o].goods.corn).toBe(1);
        expect(game.phase).toBe('role');
    });

    it('積める品があれば積まなければならない。波止場は 1 回、品を全部積める', () => {
        const game = captainGame();
        const s = game.decision.seat;
        setGoods(game, s, { coffee: 7 });
        setCity(game, s, [['wharf']]);
        game.ships.forEach((x, i) => { x.good = ['corn', 'indigo', 'sugar'][i]; x.count = 1; });
        pick(game, 'captain');
        expect(game.decision.mustShip).toBe(false);
        ok(game, s, { type: 'ship', good: 'coffee', ship: 'wharf' });
        expect(game.players[s].goods.coffee).toBe(0);
        expect(game.players[s].chips).toBe(7 + 1);
    });

    it('船長のあと、品は 1 つと、倉庫の種類の分だけとっておける（残りは在庫へ）', () => {
        const game = captainGame();
        const s = game.decision.seat;
        const o = (s + 1) % 3;
        game.ships.forEach((x, i) => { x.good = ['corn', 'indigo', 'sugar'][i]; x.count = x.size; });
        setGoods(game, o, { tobacco: 3, coffee: 2, corn: 2 });
        setCity(game, o, [['smallWarehouse']]);
        pick(game, 'captain');
        expect(game.decision).toMatchObject({ seat: o, kind: 'store', slots: 1 });
        ng(game, o, { type: 'store', warehouse: ['tobacco', 'coffee'], single: null });
        ok(game, o, { type: 'store', warehouse: ['tobacco'], single: 'coffee' });
        expect(game.players[o].goods).toMatchObject({ tobacco: 3, coffee: 1, corn: 0 });
    });
});

describe('ゲームの終わりと得点', () => {
    it('勝利点チップが尽きたら、そのラウンドの終わりに終わる。大きい建物の点は入植者がいるときだけ', () => {
        const game = newGame(3);
        const s = game.decision.seat;
        game.players.forEach((p, i) => { setGoods(game, i, {}); setCity(game, i, []); });
        game.chips = 3;
        setGoods(game, s, { corn: 4 });
        setIsland(game, s, [['corn'], ['corn'], ['corn'], ['indigo'], ['quarry'], ['sugar'], ['sugar'], ['sugar'], ['sugar'], ['coffee']]);
        setCity(game, s, [['residence', 1], ['guildHall', 0], ['smallIndigoPlant', 1], ['coffeeRoaster', 1], ['customsHouse', 1]]);
        game.players[s].chips = 0;
        pick(game, 'captain');
        ok(game, s, { type: 'ship', good: 'corn', ship: 0 });
        expect(game.endTriggered).toBe('chips');
        // 残りの 2 人は役割を選ぶ（市長・開拓者は避ける）
        playOut(game);
        const sc = game.scores[s];
        expect(sc.chips).toBe(5);
        // 建物 4+4+1+3+4、邸宅（島 10 マス）5、税関（チップ 5）1、ギルドホールは入植者なしで 0
        expect(sc.buildings).toBe(16);
        expect(sc.bonus).toBe(5 + 1);
        expect(sc.total).toBe(5 + 16 + 6);
    });

    it('同点なら、お金と品の合計が多い人', () => {
        const game = newGame(3);
        game.players.forEach((p, i) => { setCity(game, i, []); setGoods(game, i, {}); p.chips = 10; p.money = [3, 5, 1][i]; });
        setGoods(game, 2, { corn: 5 });
        game.finish();
        expect(game.winners).toEqual([2]);
    });
});

describe('記録', () => {
    it('断る操作は状態を変えず、記録から同じ状態に戻せる', () => {
        const game = newGame(4, { seed: 5 });
        ng(game, (game.governor + 1) % 4, { type: 'role', role: 0 });
        ng(game, game.governor, { type: 'role', role: 99 });
        ng(game, game.governor, null);
        pick(game, 'settler');
        while (game.decision.kind === 'settle') ok(game, game.decision.seat, { type: 'settle', take: 0 });
        pick(game, 'prospector');
        const copy = Game.replay(players(4), game.options, JSON.parse(JSON.stringify(game.commands)));
        expect(snapshot(copy)).toBe(snapshot(game));
    });
});
