import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import {
    breedingValue, movePaths, transportCost, engineForward, engineBackward, addCert, certLimit, objectiveScore,
    scoreOf, legalCommands, backCount, stepLimit
} from '../public/js/rules.js';
import { MARKET_SIZE, HAZARD_SPOTS, TRADE_SPOTS, card, JOB_COSTS } from '../public/js/data.js';
import { createGameView } from '../public/js/game-view.js';
import { chooseCommand, PROFILES } from '../public/js/cpu-player.js';
import { makeGame, setTurn, standAt, setHand, apply, snapshot } from './helpers.js';

// 道の災害とティーピーを全部どける（歩数を数えやすくする）
function clearTrail(game) {
    Object.values(HAZARD_SPOTS).flat().forEach(id => { game.state.spots[id] = null; });
    TRADE_SPOTS.forEach(id => { game.state.spots[id] = null; });
}

describe('準備', () => {
    it('人数ごとの市場・求人市場・先読み・お金がルールどおり', () => {
        for (const n of [2, 3, 4]) {
            const s = makeGame(n, 7).state;
            expect(s.market).toHaveLength(MARKET_SIZE[n]);
            expect(s.job.rows.flat().filter(Boolean)).toHaveLength(2 * n - 1);
            expect(s.job.row).toBe(1);
            expect(s.foresight.flat().filter(Boolean)).toHaveLength(6);
            expect(s.objDisplay).toHaveLength(4);
            const tiles = [...Object.values(HAZARD_SPOTS).flat(), ...TRADE_SPOTS].filter(id => s.spots[id]);
            expect(tiles).toHaveLength(7);
            const order = Array.from({ length: n }, (_, i) => (s.first + i) % n);
            expect(order.map(seat => s.players[seat].money)).toEqual([6, 7, 8, 9].slice(0, n));
            s.players.forEach(p => {
                expect(p.hand).toHaveLength(4);
                expect(p.deck).toHaveLength(10);
                expect(p.objectives).toHaveLength(1);
                expect(p.workers).toEqual({ cowboy: 1, craftsman: 1, engineer: 1 });
            });
            expect(s.turn.seat).toBe(s.first);
        }
    });

    it('歩数の上限は人数で変わる（2人 3・3人 3・4人 4）', () => {
        expect([2, 3, 4].map(n => stepLimit(makeGame(n).state, makeGame(n).state.players[0]))).toEqual([3, 3, 4]);
    });
});

describe('繁殖値と運賃', () => {
    it('手札の違う品種だけを数える', () => {
        expect(breedingValue(['p0jersey0', 'p0jersey1', 'p0dutch0', 'mholstein1-0'])).toBe(1 + 2 + 3);
        expect(breedingValue(['p0jersey0', 'o1'])).toBe(1);
    });

    it('運賃は、機関車の先から都市の値までの × の数（待避線は次の番号のマス）', () => {
        expect(transportCost(5, 10)).toBe(3);
        expect(transportCost(5, 8)).toBe(2);
        expect(transportCost(5, 4)).toBe(0);
        expect(transportCost(4.5, 10)).toBe(3);
        expect(transportCost(0, 18)).toBe(11);
        expect(transportCost(18, 18)).toBe(0);
    });
});

describe('移動と通行料', () => {
    it('最初の手番は好きな中立の建物から', () => {
        const game = makeGame(2, 1);
        const seat = game.turn;
        expect(movePaths(game.state, seat, 3).map(p => p.join())).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G']);
        apply(game, seat, { type: 'move', path: ['C'] });
        expect(game.state.players[seat].loc).toBe('C');
        expect(game.state.turn.stage).toBe('act');
    });

    it('空いたマスは数えず、カンザスシティは通り越せない', () => {
        const game = makeGame(2, 1);
        clearTrail(game);
        const p = game.state.players[0];
        p.loc = 'A';
        expect(movePaths(game.state, 0, 3).map(x => x.join('>')).sort()).toEqual(['B', 'B>C', 'B>C>D', 'B>C>E'].sort());
        p.loc = 'F';
        expect(movePaths(game.state, 0, 3).map(x => x.join('>')).sort()).toEqual(['G', 'G>KC'].sort());
    });

    it('ほかの人の建物は持ち主に、災害は銀行に通行料を払う。足りなければ払えるだけ', () => {
        const game = makeGame(2, 1);
        clearTrail(game);
        const s = game.state;
        s.spots.A2 = { t: 'building', owner: 1, n: 1 };            // 緑の手
        s.spots.flood1 = { t: 'hazard', type: 'flood', hand: 'b', vp: 3 };
        s.players[0].loc = 'A';
        s.players[0].money = 10;
        s.players[1].money = 0;
        setTurn(game, 0);
        apply(game, 0, { type: 'move', path: ['A2', 'B'] });
        expect(s.players[0].money).toBe(10);                      // 写しで動くので、元の s は変わらない
        expect(game.state.players[0].money).toBe(8);
        expect(game.state.players[1].money).toBe(2);
        const g2 = makeGame(2, 1);
        clearTrail(g2);
        g2.state.spots.flood1 = { t: 'hazard', type: 'flood', hand: 'b', vp: 3 };
        g2.state.players[0].loc = 'A';
        g2.state.players[0].money = 1;
        setTurn(g2, 0);
        apply(g2, 0, { type: 'move', path: ['flood1', 'B'] });
        expect(g2.state.players[0].money).toBe(0);
        expect(g2.state.players[0].loc).toBe('B');
    });
});

describe('鉄道', () => {
    it('ほかの機関車のマスは飛ばし、待避線は1マスに数える', () => {
        const game = makeGame(2, 1);
        const s = game.state;
        s.players[1].engine = 1;
        expect(engineForward(s, 0, 1)).toEqual([2]);
        s.players[0].engine = 4;
        s.players[1].engine = 0;
        expect(engineForward(s, 0, 1)).toEqual([4.5, 5]);
        expect(engineForward(s, 0, 2)).toEqual([4.5, 5, 6]);
        s.players[0].engine = 5;
        expect(engineBackward(s, 0, 1)).toEqual([4, 4.5]);
        expect(engineBackward(s, 0, 2)).toEqual([3, 4]);
        s.players[0].engine = 0;
        expect(engineBackward(s, 0, 1)).toEqual([]);
    });

    it('駅に止まると改良でき、労働者を駅長にできる', () => {
        const game = makeGame(2, 3);
        const s = game.state;
        standAt(game, 0, 'G');
        s.players[0].engine = 3;
        s.players[0].money = 10;
        s.players[0].workers = { cowboy: 2, craftsman: 1, engineer: 2 };
        s.stations[0].master = 'm3';
        apply(game, 0, { type: 'local', index: 0 });
        apply(game, 0, { type: 'choose', to: 4.5 });
        expect(game.state.turn.queue[0].p).toBe('upgrade');
        apply(game, 0, { type: 'choose', disc: 'auxMoney', master: 'cowboy' });
        const p = game.state.players[0];
        expect(p.money).toBe(8);
        expect(p.discs.auxMoney).toBe(0);
        expect(p.masters).toEqual(['m3']);
        expect(p.workers.cowboy).toBe(1);
        expect(game.state.stations[0].discs).toEqual([0]);
        expect(game.state.stations[0].master).toBe(null);
        // 白い角の駅には、白い円盤が残っていれば暗い円盤は置けない
        const g2 = makeGame(2, 3);
        standAt(g2, 0, 'G');
        g2.state.players[0].engine = 3;
        g2.state.players[0].workers.engineer = 2;
        apply(g2, 0, { type: 'local', index: 0 });
        apply(g2, 0, { type: 'choose', to: 4.5 });
        expect(g2.applyCommand(0, { type: 'choose', disc: 'step1', master: null })).toBe(false);
    });

    it('特別な配達で数えるのは、戻した番号のマス（ふさがったマスは数えない）', () => {
        const game = makeGame(2, 1);
        game.state.players[0].engine = 10;
        game.state.players[1].engine = 8;
        expect(backCount(game.state, 0, 7)).toBe(2);
        expect(backCount(game.state, 0, 7.5)).toBe(1);
    });
});

describe('証明書', () => {
    it('目盛りは 0・1・2・3・4・6 で、上限は 3 → 4 → 6', () => {
        const p = makeGame(2).state.players[0];
        expect(addCert(p, 5)).toBe(3);
        expect(certLimit(p)).toBe(3);
        p.discs.cert6 = 0;
        expect(certLimit(p)).toBe(3);
        p.discs.cert4 = 0;
        expect(certLimit(p)).toBe(6);
        addCert(p, 1);
        expect(p.cert).toBe(4);
        addCert(p, 1);
        expect(p.cert).toBe(6);
    });
});

describe('アクション', () => {
    it('牛を買う：カウボーイ3人で繁殖値3を2枚 $5。買った牛は捨て札へ', () => {
        const game = makeGame(2, 4);
        const s = game.state;
        standAt(game, 0, 'E');
        s.players[0].money = 20;
        s.players[0].workers.cowboy = 3;
        const threes = s.market.filter(id => card(id).value === 3).slice(0, 2);
        s.market.push('mholstein1-5', 'mswiss2-5');
        const cards = threes.length === 2 ? threes : ['mholstein1-5', 'mswiss2-5'];
        apply(game, 0, { type: 'local', index: 1 });
        apply(game, 0, { type: 'choose', option: 'v33', cards });
        const p = game.state.players[0];
        expect(p.money).toBe(15);
        expect(p.discard).toEqual(expect.arrayContaining(cards));
        expect(game.state.turn.queue).toHaveLength(0);
        // カウボーイ1人では、繁殖値4は $12
        const g2 = makeGame(2, 4);
        standAt(g2, 0, 'E');
        g2.state.players[0].money = 11;
        g2.state.market.push('mhighland3-0');
        apply(g2, 0, { type: 'local', index: 1 });
        expect(g2.applyCommand(0, { type: 'choose', option: 'v4', cards: ['mhighland3-0'] })).toBe(false);
    });

    it('建物は職人の数までで、職人1人につき$2。建て替えは差の分だけ', () => {
        const game = makeGame(2, 5);
        clearTrail(game);
        standAt(game, 0, 'B');
        const p = game.state.players[0];
        p.money = 20;
        p.workers.craftsman = 2;
        apply(game, 0, { type: 'local', index: 1 });
        expect(game.applyCommand(0, { type: 'choose', tile: 5, spot: 'A1' })).toBe(false);
        apply(game, 0, { type: 'choose', tile: 4, spot: 'A1' });
        expect(game.state.players[0].money).toBe(16);
        expect(game.state.spots.A1).toEqual({ t: 'building', owner: 0, n: 4 });
        const g2 = makeGame(2, 5);
        standAt(g2, 0, 'B');
        g2.state.spots.A1 = { t: 'building', owner: 0, n: 2 };
        g2.state.players[0].buildings = [1, 3, 4, 5, 6, 7, 8, 9, 10];
        g2.state.players[0].workers.craftsman = 3;
        g2.state.players[0].money = 10;
        apply(g2, 0, { type: 'local', index: 1 });
        apply(g2, 0, { type: 'choose', tile: 5, spot: 'A1' });
        expect(g2.state.players[0].money).toBe(6);
        expect(g2.state.spots.A1.n).toBe(5);
    });

    it('雇う：トークンのある段からは雇えない。+$2 の雇用は高い', () => {
        const game = makeGame(2, 6);
        standAt(game, 0, 'A');
        const s = game.state;
        s.players[0].money = 30;
        apply(game, 0, { type: 'local', index: 2 });
        expect(game.applyCommand(0, { type: 'choose', worker: [1, 0] })).toBe(false);
        apply(game, 0, { type: 'choose', worker: [0, 0] });
        expect(game.state.players[0].money).toBe(30 - JOB_COSTS[0] - 2);
        expect(game.state.job.rows[0][0]).toBe(null);
    });

    it('建物のアクションを使ったあとは、補助アクションを使えない', () => {
        const game = makeGame(2, 6);
        standAt(game, 0, 'G');
        game.state.players[0].workers.engineer = 2;
        apply(game, 0, { type: 'local', index: 0 });
        apply(game, 0, { type: 'choose', to: 2 });
        expect(game.applyCommand(0, { type: 'aux', kind: 'money' })).toBe(false);
        apply(game, 0, { type: 'end' });
        expect(game.state.turn.seat).toBe(1);
    });
});

describe('カンザスシティ', () => {
    it('収入と配達：運賃を払い、同じ都市には2回配達できない', () => {
        const game = makeGame(2, 8);
        setHand(game, 0, ['jersey', 'dutch', 'angus', 'guernsey']);
        setTurn(game, 0, 'kc');
        game.state.turn.queue = [{ p: 'deliver', optional: false }];
        game.state.players[0].money = 0;
        expect(game.applyCommand(0, { type: 'choose', certs: 0, city: 'santafe', disc: 'auxMoney' })).toBe(false);
        apply(game, 0, { type: 'choose', certs: 0, city: 'colorado', disc: 'auxMoney' });
        const p = game.state.players[0];
        expect(p.money).toBe(7 - 3);
        expect(p.cities.colorado).toBe(1);
        expect(p.loc).toBe('start');
        expect(p.hand).toHaveLength(4);
        expect(game.state.turn.seat).toBe(1);
        setHand(game, 0, ['jersey', 'dutch', 'angus', 'guernsey']);
        setTurn(game, 0, 'kc');
        game.state.turn.queue = [{ p: 'deliver', optional: false }];
        expect(game.applyCommand(0, { type: 'choose', certs: 0, city: 'colorado', disc: 'auxDraw' })).toBe(false);
        apply(game, 0, { type: 'choose', certs: 0, city: 'kc', disc: 'auxDraw' });
        expect(game.state.players[0].money).toBe(4 + 7 + 6);
        expect(scoreOf(game.state, 0).cities).toBe(-6);
    });

    it('暗い角の円盤は暗い都市にだけ。歩数の円盤は$3、手札の円盤は$5', () => {
        const game = makeGame(2, 8);
        setHand(game, 0, ['holstein', 'swiss', 'ayrshire', 'highland']);
        setTurn(game, 0, 'kc');
        game.state.turn.queue = [{ p: 'deliver', optional: false }];
        game.state.players[0].money = 0;
        game.state.players[0].engine = 18;
        expect(game.applyCommand(0, { type: 'choose', certs: 0, city: 'santafe', disc: 'step1' })).toBe(false);
        apply(game, 0, { type: 'choose', certs: 0, city: 'elpaso', disc: 'step1' });
        expect(game.state.players[0].money).toBe(13 + 3);
        const g2 = makeGame(2, 8);
        setHand(g2, 0, ['holstein', 'swiss', 'ayrshire', 'highland']);
        setTurn(g2, 0, 'kc');
        g2.state.turn.queue = [{ p: 'deliver', optional: false }];
        g2.state.players[0].money = 0;
        g2.state.players[0].engine = 18;
        apply(g2, 0, { type: 'choose', certs: 0, city: 'albuquerque', disc: 'hand' });
        expect(g2.state.players[0].money).toBe(13 - 5);
        expect(g2.state.players[0].hand).toHaveLength(5);
    });

    it('証明書は目盛りの分だけ使える（6 から 1 だけは使えない）', () => {
        const game = makeGame(2, 8);
        setHand(game, 0, ['jersey']);
        setTurn(game, 0, 'kc');
        game.state.turn.queue = [{ p: 'deliver', optional: false }];
        Object.assign(game.state.players[0].discs, { cert4: 0, cert6: 0 });
        game.state.players[0].cert = 6;
        expect(game.applyCommand(0, { type: 'choose', certs: 1, city: 'topeka', disc: 'auxMoney' })).toBe(false);
        apply(game, 0, { type: 'choose', certs: 2, city: 'topeka', disc: 'auxMoney' });
        expect(game.state.players[0].cert).toBe(4);
    });

    it('求人市場の7段目に移ると牛の市場を補充し、最後の段が埋まると、ほかの人が1回ずつで終わる', () => {
        const game = makeGame(2, 9);
        const s = game.state;
        s.job.row = 5;
        s.job.fill = 1;
        s.market = s.market.slice(0, 2);
        setTurn(game, 0, 'kc');
        s.foresight[1] = [{ t: 'worker', w: 'cowboy' }, { t: 'worker', w: 'engineer' }];
        s.turn.queue = [{ p: 'foresight', col: 1, optional: false }];
        apply(game, 0, { type: 'choose', index: 0 });
        expect(game.state.job.row).toBe(6);
        expect(game.state.market).toHaveLength(MARKET_SIZE[2]);

        const g2 = makeGame(2, 9);
        g2.state.job.row = JOB_COSTS.length - 1;
        g2.state.job.fill = 1;
        setTurn(g2, 0, 'kc');
        g2.state.foresight[1] = [{ t: 'worker', w: 'cowboy' }, null];
        g2.state.foresight[2] = [{ t: 'worker', w: 'cowboy' }, { t: 'worker', w: 'engineer' }];
        g2.state.turn.queue = [{ p: 'foresight', col: 1, optional: false }, { p: 'foresight', col: 2, optional: false }, { p: 'deliver', optional: false }];
        apply(g2, 0, { type: 'choose', index: 0 });
        expect(g2.state.end.by).toBe(0);
        expect(g2.state.players[0].token).toBe(true);
        // 先読み3は労働者だけなので飛ばし、配達へ
        expect(g2.state.turn.queue[0].p).toBe('deliver');
        apply(g2, 0, { type: 'choose', certs: 0, city: 'kc', disc: 'auxMoney' });
        expect(g2.isOver()).toBe(false);
        const other = g2.turn;
        expect(other).toBe(1);
        const path = movePaths(g2.state, 1, 3)[0];
        apply(g2, 1, { type: 'move', path });
        while (g2.state.turn.queue.length > 0) apply(g2, 1, legalCommands(g2.state, 1)[0]);
        if (!g2.isOver()) apply(g2, 1, { type: 'end' });
        expect(g2.isOver()).toBe(true);
        expect(scoreOf(g2.state, 0).token).toBe(2);
    });
});

describe('目標カード', () => {
    it('場のカードは必ず数え、山札のカードは得になるときだけ。条件は1枚にしか使えない', () => {
        const game = makeGame(2, 10);
        const s = game.state;
        const p = s.players[0];
        clearTrail(game);
        s.spots.A1 = { t: 'building', owner: 0, n: 1 };
        s.spots.A2 = { t: 'building', owner: 0, n: 2 };
        p.hazards = [{ type: 'flood', vp: 2 }];
        p.objectives = ['st3', 'o6'];
        p.deck.push('o20', 'o1');
        const result = objectiveScore(s, p);
        expect(result.score).toBe(3 - 3);
        expect(result.done).toEqual(['st3']);
        p.cities.sf = 1;
        expect(objectiveScore(s, p).score).toBe(3 + 5);
    });

    it('手札の目標カードを出すと、場に置いて即時のアクション', () => {
        const game = makeGame(2, 10);
        const seat = game.turn;
        const p = game.state.players[seat];
        p.hand.push('o1');
        const before = p.money;
        apply(game, seat, { type: 'objective', card: 'o1' });
        expect(game.state.players[seat].objectives).toContain('o1');
        expect(game.state.players[seat].money).toBe(before + 2);
    });
});

describe('記録と再現', () => {
    it('断った操作は状態を変えない', () => {
        const game = makeGame(3, 11);
        const before = snapshot(game);
        const seat = game.turn;
        [
            [seat, { type: 'move', path: ['KC'] }], [seat, { type: 'end' }], [(seat + 1) % 3, { type: 'move', path: ['A'] }],
            [seat, { type: 'choose', index: 0 }], [seat, { type: 'local', index: 0 }], [seat, null], [seat, { type: 'nope' }],
            [seat, { type: 'objective', card: 'o1' }]
        ].forEach(([s, c]) => expect(game.applyCommand(s, c)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('CPU の手を重ねたゲームを、記録から同じ状態に作り直せる', () => {
        const game = makeGame(3, 12);
        for (let i = 0; i < 250 && !game.isOver(); i++) {
            const seat = game.turn;
            apply(game, seat, chooseCommand(game.state, seat, i % 2 ? PROFILES.random : PROFILES.normal));
        }
        const copy = Game.replay(game.setup, game.options, game.commands);
        expect(JSON.stringify(copy.state)).toBe(JSON.stringify(game.state));
        expect(JSON.stringify(JSON.parse(JSON.stringify(game.persist())))).toBe(JSON.stringify(game.persist()));
    });

    it('ビューに、ほかの人の手札と山の並びを入れない', () => {
        const game = makeGame(3, 13);
        const view = createGameView(game, 0);
        expect(view.state.players[0].hand).toEqual(game.state.players[0].hand);
        expect(view.state.players[1].hand).toEqual([]);
        expect(view.state.players[1].handCount).toBe(4);
        expect(view.state.players[0].deck).toEqual([...game.state.players[0].deck].sort());
        expect(view.state.marketStack.every(x => x === 0)).toBe(true);
        expect(view.state.objStack.every(x => x === 0)).toBe(true);
        expect(view.state.supply.flat().every(x => x === 0)).toBe(true);
    });
});
