import { describe, it, expect } from 'vitest';
import Game, { TILES } from '../public/js/game.js';
import { keyOf } from '../public/js/layout.js';
import { makeGame, players, setHand, setMoneyMarket, snapshot, SCORE_1, SCORE_2 } from './helpers.js';

const OPEN = TILES.filter(t => !Object.values(t.walls).some(Boolean)).map(t => t.id);

describe('準備', () => {
    it('お金は合計20以上で、カードの最も少ない人から始める', () => {
        for (let seed = 1; seed <= 10; seed++) {
            const game = makeGame(4, seed);
            game.players.forEach(p => {
                expect(game.handTotal(p)).toBeGreaterThanOrEqual(20);
                expect(game.handTotal(p)).toBeLessThanOrEqual(28);
            });
            const fewest = Math.min(...game.players.map(p => p.hand.length));
            expect(game.players[game.current].hand.length).toBe(fewest);
        }
    });

    it('市場は建物4枚とお金4枚。得点のカードは山札の2つ目と4つ目の束に入る', () => {
        const game = makeGame(3, 5);
        expect(game.market.length).toBe(4);
        expect(game.moneyMarket.length).toBe(4);
        expect(game.cards.length).toBe(108);
        const n = game.deck.length;
        const s1 = game.deck.indexOf(SCORE_1), s2 = game.deck.indexOf(SCORE_2);
        expect(s1).toBeGreaterThan(n * 0.15);
        expect(s1).toBeLessThan(n * 0.45);
        expect(s2).toBeGreaterThan(n * 0.55);
        expect(s2).toBeLessThan(n * 0.85);
    });

    it('2人ならお金は72枚で、ダークが最初に建物を6枚持つ', () => {
        const game = makeGame(2, 3);
        expect(game.cards.length).toBe(72);
        expect(game.dirk.tiles.length).toBe(6);
        expect(makeGame(3).dirk).toBe(null);
    });

    it('同じシードなら同じ並びになる', () => {
        expect(snapshot(makeGame(4, 9))).toBe(snapshot(makeGame(4, 9)));
    });
});

describe('お金を取る', () => {
    it('1枚なら何でも、何枚かなら合計5まで。取ると手番が終わり、市場が補充される', () => {
        const game = makeGame(3, 2);
        const seat = game.current;
        setMoneyMarket(game, [['yellow', 9], ['green', 2], ['blue', 3], ['orange', 4]]);
        const before = snapshot(game);
        expect(game.applyCommand(seat, { type: 'take', slots: [2, 3] })).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(seat, { type: 'take', slots: [1, 2] })).toBe(true);
        expect(game.players[seat].hand.length).toBeGreaterThan(0);
        expect(game.moneyMarket.every(id => id !== null)).toBe(true);
        expect(game.current).toBe((seat + 1) % 3);
        const next = game.current;
        expect(game.applyCommand(next, { type: 'take', slots: [0] })).toBe(true);
    });
});

describe('建物を買う', () => {
    it('その場所の通貨で、値段以上を払う。足りない・違う通貨は断る', () => {
        const game = makeGame(3, 2);
        const seat = game.current;
        game.market[1] = OPEN[0]; // あずまや 8、緑の場所
        const hand = setHand(game, seat, [['green', 5], ['green', 4], ['blue', 9]]);
        const before = snapshot(game);
        expect(game.applyCommand(seat, { type: 'buy', slot: 1, cards: [hand[2]] })).toBe(false);
        expect(game.applyCommand(seat, { type: 'buy', slot: 1, cards: [hand[0]] })).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(seat, { type: 'buy', slot: 1, cards: [hand[0], hand[1]] })).toBe(true);
        // 9 で 8 を買ったので、もう行動はできず、置く段階になる
        expect(game.phase).toBe('place');
        expect(game.bought).toEqual([OPEN[0]]);
        expect(game.players[seat].hand).toEqual([hand[2]]);
    });

    it('ちょうどの額なら、もう一度行動できる。終えると置く段階になる', () => {
        const game = makeGame(3, 2);
        const seat = game.current;
        game.market[0] = OPEN[0];
        const hand = setHand(game, seat, [['yellow', 8], ['blue', 1]]);
        expect(game.applyCommand(seat, { type: 'buy', slot: 0, cards: [hand[0]] })).toBe(true);
        expect(game.phase).toBe('action');
        expect(game.current).toBe(seat);
        expect(game.applyCommand(seat, { type: 'end' })).toBe(true);
        expect(game.phase).toBe('place');
    });

    it('買った建物は、アルハンブラか予備に置く。置き終わると次の人へ', () => {
        const game = makeGame(3, 2);
        const seat = game.current;
        game.market[0] = OPEN[0];
        game.market[2] = OPEN[1];
        const hand = setHand(game, seat, [['yellow', 8], ['blue', 9]]);
        game.applyCommand(seat, { type: 'buy', slot: 0, cards: [hand[0]] });
        game.applyCommand(seat, { type: 'buy', slot: 2, cards: [hand[1]] });
        expect(game.bought).toEqual([OPEN[0], OPEN[1]]);
        // どちらもちょうどの額なので、自分で手番の行動を終える
        expect(game.applyCommand(seat, { type: 'end' })).toBe(true);
        expect(game.applyCommand(seat, { type: 'place', tile: OPEN[0], to: 'alhambra', x: 5, y: 5 })).toBe(false);
        expect(game.applyCommand(seat, { type: 'place', tile: OPEN[0], to: 'dirk' })).toBe(false);
        expect(game.applyCommand(seat, { type: 'place', tile: OPEN[0], to: 'alhambra', x: 1, y: 0 })).toBe(true);
        expect(game.applyCommand(seat, { type: 'place', tile: OPEN[1], to: 'reserve' })).toBe(true);
        expect(game.players[seat].layout[keyOf(1, 0)]).toBe(OPEN[0]);
        expect(game.players[seat].reserve).toEqual([OPEN[1]]);
        expect(game.current).not.toBe(seat);
        expect(game.market.every(t => t !== null)).toBe(true);
    });

    it('2人なら、買った建物をダークに渡せる', () => {
        const game = makeGame(2, 4);
        const seat = game.current;
        game.market[0] = OPEN[0];
        const hand = setHand(game, seat, [['yellow', 9]]);
        game.applyCommand(seat, { type: 'buy', slot: 0, cards: [hand[0]] });
        expect(game.applyCommand(seat, { type: 'place', tile: OPEN[0], to: 'dirk' })).toBe(true);
        expect(game.dirk.tiles).toContain(OPEN[0]);
    });
});

describe('作り直す', () => {
    it('予備から足す・予備へ戻す・入れ替える', () => {
        const game = makeGame(3, 2);
        const seat = game.current;
        const p = game.players[seat];
        p.reserve = [OPEN[0], OPEN[1]];
        expect(game.applyCommand(seat, { type: 'redesign', op: 'add', tile: OPEN[0], x: 1, y: 0 })).toBe(true);
        expect(p.layout[keyOf(1, 0)]).toBe(OPEN[0]);
        const s2 = game.current;
        const p2 = game.players[s2];
        p2.layout[keyOf(1, 0)] = OPEN[2];
        p2.reserve = [OPEN[3]];
        expect(game.applyCommand(s2, { type: 'redesign', op: 'swap', tile: OPEN[3], x: 1, y: 0 })).toBe(true);
        expect(p2.layout[keyOf(1, 0)]).toBe(OPEN[3]);
        expect(p2.reserve).toEqual([OPEN[2]]);
        const s3 = game.current;
        game.players[s3].layout[keyOf(0, 1)] = OPEN[4];
        expect(game.applyCommand(s3, { type: 'redesign', op: 'remove', x: 0, y: 0 })).toBe(false);
        expect(game.applyCommand(s3, { type: 'redesign', op: 'remove', x: 0, y: 1 })).toBe(true);
        expect(game.players[s3].reserve).toContain(OPEN[4]);
    });
});

describe('得点', () => {
    it('得点のカードが出たら、建物の多数と城壁で得点する（1回目は1位だけ）', () => {
        const game = makeGame(3, 2);
        const seat = game.current;
        const towers = TILES.filter(t => t.type === 'tower').map(t => t.id);
        game.players[0].layout[keyOf(1, 0)] = towers[0];
        game.players[0].layout[keyOf(2, 0)] = towers[1];
        game.players[1].layout[keyOf(1, 0)] = towers[2];
        game.deck.unshift(SCORE_1);
        game.applyCommand(seat, { type: 'take', slots: [0] });
        expect(game.roundsScored).toBe(1);
        expect(game.players[0].rounds[0].types.tower).toBe(6);
        expect(game.players[1].rounds[0].types.tower).toBeUndefined();
        expect(game.moneyMarket.every(id => id !== null)).toBe(true);
    });

    it('2人なら、ダークも多数を競い、1回目のあとに建物を6枚受け取る', () => {
        const game = makeGame(2, 3);
        const before = game.dirk.tiles.length;
        game.deck.unshift(SCORE_1);
        game.applyCommand(game.current, { type: 'take', slots: [0] });
        expect(game.dirk.rounds.length).toBe(1);
        expect(game.dirk.tiles.length).toBe(before + 6);
        expect(game.dirk.rounds[0].wall).toBe(0);
    });

    it('2回目の得点のあと、ダークは袋の残りの3分の1を受け取る', () => {
        const game = makeGame(2, 3);
        game.roundsScored = 1;
        game.deck.unshift(SCORE_2);
        const bag = game.bag.length;
        const before = game.dirk.tiles.length;
        game.applyCommand(game.current, { type: 'take', slots: [0] });
        expect(game.dirk.tiles.length - before).toBe(Math.floor(bag / 3));
    });
});

describe('終わり', () => {
    it('袋で市場を4枚にできなければ、市場の残りは通貨を最も多く持つ人へ。そのあと3回目の得点', () => {
        const game = makeGame(3, 2);
        const seat = game.current;
        game.bag = [];
        game.roundsScored = 2;
        game.market = [OPEN[1], OPEN[2], OPEN[3], OPEN[0]];
        setHand(game, 0, [['yellow', 9], ['green', 5]]);
        setHand(game, 1, [['yellow', 2], ['green', 5]]);
        setHand(game, 2, [['blue', 1]]);
        // 手番の人が黄で買う（市場の1つが空いて、袋は空）
        const buyer = seat;
        setHand(game, buyer, [['orange', 9]]);
        game.applyCommand(buyer, { type: 'buy', slot: 3, cards: [game.players[buyer].hand[0]] });
        expect(game.phase).toBe('place');
        game.applyCommand(buyer, { type: 'place', tile: OPEN[0], to: 'reserve' });
        // 黄・緑・青の残り：黄と青は一番多い人へ、緑は同じなので市場に残る
        expect(game.phase === 'final' || game.phase === 'end').toBe(true);
        let guard = 0;
        while (game.phase === 'final' && guard++ < 10) {
            const actor = game.actors()[0];
            game.applyCommand(actor, { type: 'place', tile: game.finalQueue[0].tile, to: 'reserve' });
        }
        expect(game.isOver()).toBe(true);
        expect(game.roundsScored).toBe(3);
        expect(game.winners.length).toBeGreaterThan(0);
    });

    it('人数を変えても最後まで進み、記録から同じ状態を再現できる', () => {
        for (let n = 2; n <= 6; n++) {
            const game = new Game(players(n), { seed: n * 7 });
            let guard = 0;
            while (!game.isOver() && guard++ < 4000) {
                const commands = game.sampleCommands();
                const pick = commands.find(c => c.type === 'buy') ?? commands.find(c => c.type === 'place' && c.to === 'alhambra') ?? commands[0];
                expect(game.applyCommand(game.actors()[0], pick)).toBe(true);
            }
            expect(game.isOver()).toBe(true);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('手番でない人の操作と、知らない操作は断る', () => {
        const game = makeGame(3, 6);
        const before = snapshot(game);
        expect(game.applyCommand((game.current + 1) % 3, { type: 'take', slots: [0] })).toBe(false);
        expect(game.applyCommand(game.current, { type: 'end' })).toBe(false);
        expect(game.applyCommand(game.current, { type: 'nope' })).toBe(false);
        expect(game.applyCommand(game.current, { type: 'place', tile: 0, to: 'reserve' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});
