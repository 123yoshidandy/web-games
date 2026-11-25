import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { PLANTS, PLANT, PAYMENT, RESUPPLY, SETUP, STEP3, PRICES } from '../public/js/data.js';
import { MAPS } from '../public/js/maps.js';
import { graphOf, regionNeighbors, buildCost, buyPrice, canStore, bestPower, trimResources, actualMarket } from '../public/js/rules.js';
import { newGame, players, run, buyCheapest, snapshot } from './helpers.js';

describe('数表と地図', () => {
    it('発電所は42枚（3〜40・42・44・46・50）。番号ごとの資源と都市の数', () => {
        expect(PLANTS).toHaveLength(42);
        expect(PLANTS.map(p => p.num)).toEqual([...Array.from({ length: 38 }, (_, i) => i + 3), 42, 44, 46, 50]);
        expect(PLANT[13]).toEqual({ num: 13, type: 'eco', need: 0, cities: 1 });
        expect(PLANT[29]).toEqual({ num: 29, type: 'hybrid', need: 1, cities: 4 });
        expect(PLANT[50]).toEqual({ num: 50, type: 'eco', need: 0, cities: 6 });
        expect(PAYMENT).toHaveLength(21);
        expect([PAYMENT[0], PAYMENT[6], PAYMENT[20]]).toEqual([10, 73, 150]);
        expect(RESUPPLY.coal[5]).toEqual([5, 7, 5]);
        expect(PRICES.uranium.slice(-4)).toEqual([10, 12, 14, 16]);
    });

    it('どちらの地図も 6地域×7都市。線は地図の都市どうしで、全体がつながっている', () => {
        for (const id of ['germany', 'usa']) {
            const map = MAPS[id];
            expect(map.cities, id).toHaveLength(42);
            map.regions.forEach(r => expect(map.cities.filter(c => c.region === r), `${id} ${r}`).toHaveLength(7));
            const ids = new Set(map.cities.map(c => c.id));
            map.links.forEach(([a, b, cost]) => {
                expect(ids.has(a) && ids.has(b), `${a}-${b}`).toBe(true);
                expect(cost).toBeGreaterThanOrEqual(0);
            });
            const g = graphOf(id, map.regions);
            const seen = new Set([g.cities[0]]);
            const stack = [g.cities[0]];
            while (stack.length) for (const [n] of g.adj.get(stack.pop())) if (!seen.has(n)) { seen.add(n); stack.push(n); }
            expect(seen.size, id).toBe(42);
        }
    });

    it('ルールブックの例の線の費用（ドイツ）', () => {
        const cost = (a, b) => MAPS.germany.links.find(([x, y]) => (x === a && y === b) || (x === b && y === a))?.[2];
        expect(cost('duisburg', 'essen')).toBe(0);
        expect(cost('muenster', 'dortmund')).toBe(2);
        expect(cost('duesseldorf', 'aachen')).toBe(9);
        expect(cost('essen', 'duesseldorf')).toBe(2);
        expect(cost('duesseldorf', 'koeln')).toBe(4);
    });
});

describe('準備', () => {
    it('所持金50、市場は3〜10、山の上は13・底は段階3。人数ごとに抜く枚数と地域の数', () => {
        for (const n of [2, 3, 4, 5, 6]) {
            const game = new Game(players(n), { seed: n });
            expect(game.players.every(p => p.money === 50 && p.plants.length === 0)).toBe(true);
            expect(game.market).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
            expect(game.deck[0]).toBe(13);
            expect(game.deck.at(-1)).toBe(STEP3);
            expect(game.removed).toHaveLength(SETUP[n].remove);
            expect(game.deck.length).toBe(42 - 8 - SETUP[n].remove + 1);
            expect(game.regions).toHaveLength(SETUP[n].regions);
            // 選んだ地域はつながっている
            const nb = regionNeighbors('germany');
            game.regions.forEach(r => { if (game.regions.length > 1) expect(game.regions.some(o => o !== r && nb[r].has(o))).toBe(true); });
            expect(game.resources).toEqual({ coal: 24, oil: 18, garbage: 6, uranium: 2 });
            expect(snapshot(new Game(players(n), { seed: n }))).toBe(snapshot(game));
        }
    });
});

describe('競り', () => {
    it('最初の巡は全員が買う（見送れない）。番号以上の値で始め、ほかの人は上げるか降りる', () => {
        const game = newGame(3);
        const [a, b, c] = game.order;
        expect(game.applyCommand(a, { type: 'skip' })).toBe(false);
        expect(game.applyCommand(a, { type: 'choose', plant: 4, bid: 3 })).toBe(false);
        expect(game.applyCommand(a, { type: 'choose', plant: 7, bid: 7 })).toBe(false);
        run(game, [[a, { type: 'choose', plant: 4, bid: 4 }]]);
        expect(game.actors()).toEqual([b]);
        run(game, [[b, { type: 'bid', amount: 5 }], [c, { type: 'pass' }], [a, { type: 'bid', amount: 6 }], [b, { type: 'pass' }]]);
        expect(game.players[a].plants).toEqual([4]);
        expect(game.players[a].money).toBe(44);
        // 買った4の代わりに山の上の13が入り、並べ直す
        expect(game.market).toEqual([3, 5, 6, 7, 8, 9, 10, 13]);
        expect(game.actors()).toEqual([b]);
    });

    it('ほかの人が落札したら、選んだ人がもう一度選ぶ。買った人は、その巡はもう競れない', () => {
        const game = newGame(3);
        const [a, b, c] = game.order;
        run(game, [[a, { type: 'choose', plant: 3, bid: 3 }], [b, { type: 'bid', amount: 4 }], [c, { type: 'pass' }], [a, { type: 'pass' }]]);
        expect(game.players[b].plants).toEqual([3]);
        expect(game.actors()).toEqual([a]);
        run(game, [[a, { type: 'choose', plant: 5, bid: 5 }]]);
        expect(game.actors()).toEqual([c]);
        run(game, [[c, { type: 'pass' }]]);
        expect(game.players[a].plants).toEqual([5]);
        expect(game.actors()).toEqual([c]);
        run(game, [[c, { type: 'choose', plant: 4, bid: 4 }]]);
        // 最初の巡のあと、発電所の大きい順に手番を決め直す
        expect(game.phase).toBe('resources');
        expect(game.order).toEqual([a, c, b]);
    });

    it('持てる数を超えたら、買った発電所以外を1つ手放し、入りきらない資源は戻す', () => {
        const game = newGame(3);
        buyCheapest(game);
        while (game.phase !== 'auction') run(game, [[game.actors()[0], { type: game.phase === 'resources' ? 'buy' : 'done' }]]);
        const seat = game.auction.chooser;
        const p = game.players[seat];
        p.plants = [3, 4, 5];
        p.res = { coal: 4, oil: 4, garbage: 0, uranium: 0 };
        p.money = 100;
        const plant = actualMarket(game)[0];
        run(game, [[seat, { type: 'choose', plant, bid: plant }]]);
        while (game.auction.current) run(game, [[game.auction.current.turn, { type: 'pass' }]]);
        expect(game.actors()).toEqual([seat]);
        expect(game.applyCommand(seat, { type: 'discard', plant })).toBe(false);
        run(game, [[seat, { type: 'discard', plant: 3 }]]);
        expect(p.plants).toEqual([4, 5, plant].sort((x, y) => x - y));
        expect(canStore(p.plants, p.res)).toBe(true);
    });

    it('2巡目からは見送れる。だれも買わなければ、いちばん小さい発電所を除く', () => {
        const game = newGame(3);
        buyCheapest(game);
        while (game.phase !== 'auction') run(game, [[game.actors()[0], { type: game.phase === 'resources' ? 'buy' : 'done' }]]);
        const before = [...game.market];
        const low = actualMarket(game)[0];
        game.order.forEach(s => run(game, [[s, { type: 'skip' }]]));
        expect(game.market).not.toContain(low);
        expect(game.market.length).toBe(before.length);
    });
});

describe('資源', () => {
    it('値段は安いマスから。発電所に入るのは必要数の2倍まで（両用は石炭と石油の合計）', () => {
        expect(buyPrice('coal', 24, 4)).toBe(1 + 1 + 1 + 2);
        expect(buyPrice('oil', 18, 2)).toBe(3 + 3);
        expect(buyPrice('uranium', 2, 1)).toBe(14);
        expect(buyPrice('garbage', 6, 7)).toBe(null);
        expect(canStore([3], { coal: 0, oil: 4, garbage: 0, uranium: 0 })).toBe(true);
        expect(canStore([3], { coal: 0, oil: 5, garbage: 0, uranium: 0 })).toBe(false);
        expect(canStore([5], { coal: 2, oil: 2, garbage: 0, uranium: 0 })).toBe(true);
        expect(canStore([5], { coal: 3, oil: 2, garbage: 0, uranium: 0 })).toBe(false);
        expect(canStore([4, 5], { coal: 7, oil: 1, garbage: 0, uranium: 0 })).toBe(true);
        expect(canStore([13], { coal: 1, oil: 0, garbage: 0, uranium: 0 })).toBe(false);
        expect(trimResources([4], { coal: 6, oil: 2, garbage: 1, uranium: 0 })).toEqual({ coal: 4, oil: 0, garbage: 0, uranium: 0 });
    });

    it('手番の逆順に買う。持てない量・お金を超える量は断る', () => {
        const game = newGame(3);
        buyCheapest(game);
        const last = game.order.at(-1);
        expect(game.actors()).toEqual([last]);
        const p = game.players[last];
        const plant = PLANT[p.plants[0]];
        const type = plant.type === 'hybrid' ? 'coal' : plant.type;
        const before = snapshot(game);
        expect(game.applyCommand(last, { type: 'buy', [type]: plant.need * 2 + 1 })).toBe(false);
        expect(game.applyCommand(last, { type: 'buy', uranium: 1 })).toBe(false);
        expect(snapshot(game)).toBe(before);
        const n = game.resources[type];
        const price = buyPrice(type, n, plant.need);
        run(game, [[last, { type: 'buy', [type]: plant.need }]]);
        expect(p.res[type]).toBe(plant.need);
        expect(game.resources[type]).toBe(n - plant.need);
        expect(game.actors()).toEqual([game.order.at(-2)]);
        expect(p.money).toBe(50 - p.plants[0] - price);
    });
});

describe('建設', () => {
    const toBuild = () => {
        const game = newGame(3);
        buyCheapest(game);
        while (game.phase === 'resources') run(game, [[game.actors()[0], { type: 'buy' }]]);
        return game;
    };

    it('最初の都市は10。次からは最も安い線の費用を足す（ルールブックの例）', () => {
        const game = toBuild();
        const seat = game.actors()[0];
        game.players[seat].money = 200;
        run(game, [[seat, { type: 'build', city: 'muenster' }]]);
        expect(game.players[seat].money).toBe(190);
        expect(buildCost(game, seat, 'dortmund')).toBe(12);
        run(game, [[seat, { type: 'build', city: 'essen' }]]);
        expect(buildCost(game, seat, 'duisburg')).toBe(10);
        // アーヘンへは、エッセン→デュッセルドルフ（2）→アーヘン（9）
        expect(buildCost(game, seat, 'aachen')).toBe(21);
        expect(game.applyCommand(seat, { type: 'build', city: 'essen' })).toBe(false);
    });

    it('段階1では1都市に1人。段階2では2人目が15、段階3では3人目が20', () => {
        const game = toBuild();
        const [x, y, z] = game.reverse();
        run(game, [[x, { type: 'build', city: 'essen' }], [x, { type: 'done' }]]);
        expect(game.applyCommand(y, { type: 'build', city: 'essen' })).toBe(false);
        game.step = 2;
        expect(buildCost(game, y, 'essen')).toBe(15);
        run(game, [[y, { type: 'build', city: 'essen' }], [y, { type: 'done' }]]);
        expect(game.applyCommand(z, { type: 'build', city: 'essen' })).toBe(false);
        game.step = 3;
        expect(buildCost(game, z, 'essen')).toBe(20);
    });

    it('使わない地域の都市には建てられない', () => {
        const game = new Game(players(3), { seed: 1, map: 'germany', regions: ['red', 'blue', 'yellow'] });
        buyCheapest(game);
        while (game.phase === 'resources') run(game, [[game.actors()[0], { type: 'buy' }]]);
        const seat = game.actors()[0];
        expect(game.applyCommand(seat, { type: 'build', city: 'flensburg' })).toBe(false);
        expect(buildCost(game, seat, 'essen')).toBe(10);
    });

    it('都市の数以下の番号の発電所は、競りにかけられる市場から除く', () => {
        const game = toBuild();
        const seat = game.actors()[0];
        game.players[seat].money = 500;
        game.market = [5, 6, 7, 8, 9, 10, 13, 15];
        game.deck = [20, 21, 22, 23, 24, STEP3];
        ['essen', 'duisburg', 'duesseldorf', 'dortmund', 'muenster'].forEach(city => run(game, [[seat, { type: 'build', city }]]));
        expect(actualMarket(game).every(n => n > 5)).toBe(true);
        expect(game.market).not.toContain(5);
    });
});

describe('官僚・段階・終わり', () => {
    it('送れるだけ送って収入。資源を使い、補充し、いちばん大きい発電所を山の底へ', () => {
        const game = newGame(3);
        buyCheapest(game);
        while (game.phase === 'resources') run(game, [[game.actors()[0], { type: 'buy' }]]);
        const seat = game.reverse()[0];
        const p = game.players[seat];
        p.plants = [4];
        p.res = { coal: 2, oil: 0, garbage: 0, uranium: 0 };
        run(game, [[seat, { type: 'build', city: 'essen' }]]);
        const moneyBefore = p.money;
        const market = { ...game.resources };
        const high = game.market.at(-1);
        while (game.phase === 'build') run(game, [[game.actors()[0], { type: 'done' }]]);
        expect(p.res.coal).toBe(0);
        expect(p.money).toBe(moneyBefore + 22);
        expect(game.resources.coal).toBe(Math.min(24, market.coal + RESUPPLY.coal[3][0]));
        expect(game.resources.uranium).toBe(market.uranium + RESUPPLY.uranium[3][0]);
        expect(game.deck.at(-1)).toBe(high);
        expect(game.round).toBe(2);
    });

    it('いちばん多く送れる組み合わせ（両用は余った石炭から）', () => {
        expect(bestPower([4, 5, 13], { coal: 3, oil: 1, garbage: 0, uranium: 0 }, 10)).toEqual({ powered: 3, plants: [4, 5, 13], use: { coal: 3, oil: 1, garbage: 0, uranium: 0 } });
        expect(bestPower([20, 25], { coal: 4, oil: 0, garbage: 0, uranium: 0 }, 10).powered).toBe(5);
        expect(bestPower([20, 13], { coal: 3, oil: 0, garbage: 0, uranium: 0 }, 2).powered).toBe(2);
    });

    it('段階2：建設のあとで、だれかの都市が7つに届いたら。いちばん小さい発電所を1つ除く', () => {
        const game = newGame(3);
        buyCheapest(game);
        while (game.phase === 'resources') run(game, [[game.actors()[0], { type: 'buy' }]]);
        const seat = game.actors()[0];
        game.players[seat].money = 500;
        ['essen', 'duisburg', 'duesseldorf', 'dortmund', 'muenster', 'koeln', 'aachen'].forEach(city => run(game, [[seat, { type: 'build', city }]]));
        const low = actualMarket(game)[0];
        while (game.phase === 'build') run(game, [[game.actors()[0], { type: 'done' }]]);
        expect(game.step).toBe(2);
        expect(game.market).not.toContain(low);
    });

    it('段階3：競りの途中で段階3のカードが出たら、競りのあとで除いて、市場は6枚・全部を競りにかけられる', () => {
        const game = newGame(3);
        buyCheapest(game);
        while (game.phase !== 'auction') run(game, [[game.actors()[0], { type: game.phase === 'resources' ? 'buy' : 'done' }]]);
        game.deck = [STEP3, 40, 42];
        const seat = game.auction.chooser;
        const plant = actualMarket(game)[0];
        run(game, [[seat, { type: 'choose', plant, bid: plant }]]);
        while (game.auction.current) run(game, [[game.auction.current.turn, { type: 'pass' }]]);
        expect(game.market.at(-1)).toBe(STEP3);
        while (game.phase === 'auction') {
            const s = game.actors()[0];
            run(game, [[s, game.auction.discard === s ? { type: 'discard', plant: game.players[s].plants[0] } : { type: 'skip' }]]);
        }
        expect(game.step).toBe(3);
        expect(game.market).toHaveLength(6);
        expect(game.market).not.toContain(STEP3);
        expect(actualMarket(game)).toHaveLength(6);
    });

    it('終わり：建設のあとで終わりの都市の数に届いたら。送電の多い人、同数ならお金の多い人の勝ち', () => {
        const game = newGame(3);
        buyCheapest(game);
        while (game.phase === 'resources') run(game, [[game.actors()[0], { type: 'buy' }]]);
        const [x, y, z] = game.reverse();
        game.setup = { ...game.setup, end: 2 };
        game.players[x].plants = [13];
        game.players[y].plants = [18];
        game.players[z].plants = [18];
        game.players[y].money = 100;
        game.players[z].money = 100;
        run(game, [[x, { type: 'build', city: 'essen' }], [x, { type: 'build', city: 'duisburg' }], [x, { type: 'done' }]]);
        run(game, [[y, { type: 'build', city: 'kiel' }], [y, { type: 'build', city: 'hamburg' }], [y, { type: 'done' }]]);
        run(game, [[z, { type: 'build', city: 'muenchen' }], [z, { type: 'build', city: 'augsburg' }], [z, { type: 'done' }]]);
        expect(game.isOver()).toBe(true);
        expect(game.final[x].powered).toBe(1);
        expect(game.final[y].powered).toBe(2);
        const yMoney = game.players[y].money;
        const zMoney = game.players[z].money;
        expect(game.winners).toEqual(yMoney === zMoney ? [y, z].sort() : [yMoney > zMoney ? y : z]);
    });
});

describe('断る操作', () => {
    it('番でない人・知らない操作・おかしな値は断り、状態を変えない', () => {
        const game = newGame(3);
        const before = snapshot(game);
        const [a, b] = game.order;
        [[b, { type: 'choose', plant: 3, bid: 3 }], [a, null], [a, { type: 'fly' }], [a, { type: 'choose', plant: 3, bid: 51 }],
            [a, { type: 'choose', plant: '3', bid: 3 }], [a, { type: 'bid', amount: 5 }], [a, { type: 'buy', coal: 1 }],
            [a, { type: 'build', city: 'essen' }], [a, { type: 'done' }], [a, { type: 'discard', plant: 3 }], [9, { type: 'skip' }]]
            .forEach(([seat, command]) => expect(game.applyCommand(seat, command), JSON.stringify(command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });
});

