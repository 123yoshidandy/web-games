import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { CARDS, ARTISTS, DEAL, TYPE_IDS } from '../public/js/cards.js';
import { ranking, paintingValues, addTokens } from '../public/js/market.js';
import { newGame, players, run, card, snapshot, totalMoney } from './helpers.js';

const LM = 0, YO = 1, CP = 2, KG = 3, KR = 4;

describe('カードと準備', () => {
    it('70枚。画家ごとに 12・13・14・15・16 枚で、競りの種類が5つともある', () => {
        expect(CARDS).toHaveLength(70);
        expect(ARTISTS.map((_, a) => CARDS.filter(c => c.artist === a).length)).toEqual([12, 13, 14, 15, 16]);
        ARTISTS.forEach((_, a) => TYPE_IDS.forEach(t => expect(CARDS.some(c => c.artist === a && c.type === t)).toBe(true)));
        expect(TYPE_IDS.map(t => CARDS.filter(c => c.type === t).length)).toEqual([16, 14, 14, 14, 12]);
    });

    it('人数ごとに配り、所持金は100。山の並びと最初の人はシードで決まる', () => {
        for (const n of [3, 4, 5]) {
            const game = new Game(players(n), { seed: 3 });
            game.players.forEach(p => {
                expect(p.hand).toHaveLength(DEAL[n][0]);
                expect(p.money).toBe(100);
            });
            expect(game.deck.length).toBe(70 - n * DEAL[n][0]);
            expect(snapshot(new Game(players(n), { seed: 3 }))).toBe(snapshot(game));
        }
        expect(DEAL).toEqual({ 3: [10, 6, 6, 0], 4: [9, 4, 4, 0], 5: [8, 3, 3, 0] });
    });
});

describe('競り', () => {
    it('公開：左から順に値を上げ、ほかが降りたら終わり。買った人は出した人に払う', () => {
        const game = newGame(3, { hands: [[card(KR, 'open')], [card(KR, 'open', 1)], [card(KR, 'open', 2)]] });
        run(game, [[0, { type: 'play', card: card(KR, 'open') }]]);
        expect(game.actors()).toEqual([1]);
        expect(game.applyCommand(1, { type: 'bid', amount: 0 })).toBe(false);
        run(game, [[1, { type: 'bid', amount: 10 }], [2, { type: 'bid', amount: 15 }]]);
        expect(game.actors()).toEqual([0]);
        expect(game.applyCommand(0, { type: 'bid', amount: 15 })).toBe(false);
        run(game, [[0, { type: 'pass' }], [1, { type: 'bid', amount: 20 }], [2, { type: 'pass' }]]);
        expect(game.phase).toBe('play');
        expect(game.players.map(p => p.money)).toEqual([120, 80, 100]);
        expect(game.players[1].won).toEqual([card(KR, 'open')]);
        expect(game.auctioneer).toBe(1);
    });

    it('出した人が自分で買ったら銀行に払う。だれも値を付けなければ無料でもらう', () => {
        const game = newGame(3, { hands: [[card(KR, 'open'), card(KR, 'open', 3)], [card(KR, 'open', 1)], [card(KR, 'open', 2)]] });
        run(game, [[0, { type: 'play', card: card(KR, 'open') }], [1, { type: 'pass' }], [2, { type: 'pass' }], [0, { type: 'bid', amount: 7 }]]);
        expect(game.players.map(p => p.money)).toEqual([93, 100, 100]);
        run(game, [[1, { type: 'play', card: card(KR, 'open', 1) }], [2, { type: 'pass' }], [0, { type: 'pass' }], [1, { type: 'pass' }]]);
        expect(game.players[1].won).toHaveLength(1);
        expect(game.players.map(p => p.money)).toEqual([93, 100, 100]);
    });

    it('一声：左から1人1回、前より高く。出した人が最後', () => {
        const game = newGame(4, { hands: [[card(YO, 'once')], [card(KR, 'open')], [card(KR, 'open', 1)], [card(KR, 'open', 2)]] });
        run(game, [[0, { type: 'play', card: card(YO, 'once') }], [1, { type: 'bid', amount: 12 }], [2, { type: 'pass' }]]);
        expect(game.applyCommand(3, { type: 'bid', amount: 12 })).toBe(false);
        run(game, [[3, { type: 'bid', amount: 13 }]]);
        expect(game.actors()).toEqual([0]);
        run(game, [[0, { type: 'pass' }]]);
        expect(game.players[3].won).toEqual([card(YO, 'once')]);
        expect(game.players[0].money).toBe(113);
        expect(game.players[1].money).toBe(100);
    });

    it('入札：全員が同時に握る。同額なら出した人から時計回りで近い人（出した人が入っていれば出した人）', () => {
        const game = newGame(4, { hands: [[card(CP, 'sealed'), card(CP, 'sealed', 1)], [card(KR, 'open'), card(LM, 'open')], [card(KR, 'open', 1)], [card(KR, 'open', 2)]] });
        run(game, [[0, { type: 'play', card: card(CP, 'sealed') }]]);
        expect(game.actors()).toEqual([0, 1, 2, 3]);
        run(game, [[3, { type: 'bid', amount: 20 }], [1, { type: 'bid', amount: 8 }]]);
        expect(game.applyCommand(3, { type: 'bid', amount: 30 })).toBe(false);
        expect(game.actors()).toEqual([0, 2]);
        run(game, [[2, { type: 'bid', amount: 20 }], [0, { type: 'pass' }]]);
        expect(game.players[2].won).toEqual([card(CP, 'sealed')]);
        expect(game.players.map(p => p.money)).toEqual([120, 100, 80, 100]);
        // 出した人も同額なら、出した人が銀行に払って買う
        run(game, [[1, { type: 'play', card: card(KR, 'open') }], [2, { type: 'pass' }], [3, { type: 'pass' }], [0, { type: 'pass' }], [1, { type: 'pass' }]]);
        run(game, [[2, { type: 'play', card: card(KR, 'open', 1) }], [3, { type: 'pass' }], [0, { type: 'pass' }], [1, { type: 'pass' }], [2, { type: 'pass' }]]);
        run(game, [[3, { type: 'play', card: card(KR, 'open', 2) }], [0, { type: 'pass' }], [1, { type: 'pass' }], [2, { type: 'pass' }], [3, { type: 'pass' }]]);
        run(game, [[0, { type: 'play', card: card(CP, 'sealed', 1) }], [1, { type: 'bid', amount: 5 }], [0, { type: 'bid', amount: 5 }], [2, { type: 'bid', amount: 0 }], [3, { type: 'bid', amount: 0 }]]);
        expect(game.players[0].won).toEqual([card(CP, 'sealed', 1)]);
        expect(game.players[0].money).toBe(115);
    });

    it('入札で全員が0なら、出した人が無料でもらう', () => {
        const game = newGame(3, { hands: [[card(CP, 'sealed')], [card(KR, 'open')], [card(KR, 'open', 1)]] });
        run(game, [[0, { type: 'play', card: card(CP, 'sealed') }], [0, { type: 'pass' }], [1, { type: 'pass' }], [2, { type: 'bid', amount: 0 }]]);
        expect(game.players[0].won).toEqual([card(CP, 'sealed')]);
        expect(game.players[0].money).toBe(100);
    });

    it('指値：出した人が所持金までで値を決め、左から買うか断る。全員断ったら出した人が銀行に払って買う', () => {
        const game = newGame(3, { hands: [[card(KG, 'fixed'), card(KG, 'fixed', 1)], [card(KR, 'open'), card(LM, 'open')], [card(KR, 'open', 1)]] });
        run(game, [[0, { type: 'play', card: card(KG, 'fixed') }]]);
        expect(game.actors()).toEqual([0]);
        expect(game.applyCommand(0, { type: 'price', amount: 101 })).toBe(false);
        expect(game.applyCommand(0, { type: 'price', amount: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false);
        run(game, [[0, { type: 'price', amount: 30 }], [1, { type: 'pass' }], [2, { type: 'buy' }]]);
        expect(game.players.map(p => p.money)).toEqual([130, 100, 70]);
        run(game, [[1, { type: 'play', card: card(KR, 'open') }], [2, { type: 'pass' }], [0, { type: 'pass' }], [1, { type: 'pass' }]]);
        run(game, [[2, { type: 'play', card: card(KR, 'open', 1) }], [0, { type: 'pass' }], [1, { type: 'pass' }], [2, { type: 'pass' }]]);
        run(game, [[0, { type: 'play', card: card(KG, 'fixed', 1) }], [0, { type: 'price', amount: 25 }], [1, { type: 'pass' }], [2, { type: 'pass' }]]);
        expect(game.players[0].money).toBe(105);
        expect(game.players[0].won).toEqual([card(KG, 'fixed', 1)]);
    });

    it('所持金より高い値は付けられず、買えない', () => {
        const game = newGame(3, { hands: [[card(KG, 'fixed')], [card(KR, 'open')], [card(KR, 'open', 1)]] });
        game.players[1].money = 10;
        run(game, [[0, { type: 'play', card: card(KG, 'fixed') }], [0, { type: 'price', amount: 20 }]]);
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'buy' })).toBe(false);
        expect(snapshot(game)).toBe(before);
        run(game, [[1, { type: 'pass' }], [2, { type: 'pass' }]]);
        const g2 = newGame(3, { hands: [[card(KR, 'open')], [card(KR, 'open', 1)], [card(KR, 'open', 2)]] });
        g2.players[1].money = 10;
        run(g2, [[0, { type: 'play', card: card(KR, 'open') }]]);
        expect(g2.applyCommand(1, { type: 'bid', amount: 11 })).toBe(false);
    });
});

describe('ダブル', () => {
    it('出した人が同じ画家のダブルでない1枚を足し、足したカードの方法で2枚まとめて競る', () => {
        const game = newGame(3, { hands: [[card(KR, 'double'), card(KR, 'fixed'), card(KR, 'double', 1), card(YO, 'open')], [card(LM, 'open')], [card(LM, 'open', 1)]] });
        run(game, [[0, { type: 'play', card: card(KR, 'double') }]]);
        expect(game.phase).toBe('double');
        expect(game.applyCommand(0, { type: 'second', card: card(KR, 'double', 1) })).toBe(false);
        expect(game.applyCommand(0, { type: 'second', card: card(YO, 'open') })).toBe(false);
        run(game, [[0, { type: 'second', card: card(KR, 'fixed') }], [0, { type: 'price', amount: 40 }], [1, { type: 'buy' }]]);
        expect(game.players[1].won).toEqual([card(KR, 'double'), card(KR, 'fixed')]);
        expect(game.players[0].money).toBe(140);
        expect(game.counts[KR]).toBe(2);
    });

    it('出した人が足さなければ、左から順に足せる。足した人が新しく出す人になり、お金を受け取り、次はその左から', () => {
        const game = newGame(4, { hands: [[card(KR, 'double'), card(YO, 'open')], [card(LM, 'open')], [card(KR, 'once'), card(LM, 'open', 1)], [card(LM, 'open', 2)]] });
        run(game, [[0, { type: 'play', card: card(KR, 'double') }], [0, { type: 'second', card: null }], [1, { type: 'second', card: null }]]);
        run(game, [[2, { type: 'second', card: card(KR, 'once') }]]);
        expect(game.lot.seller).toBe(2);
        expect(game.actors()).toEqual([3]);
        run(game, [[3, { type: 'bid', amount: 30 }], [0, { type: 'pass' }], [1, { type: 'pass' }], [2, { type: 'pass' }]]);
        expect(game.players[3].won).toHaveLength(2);
        expect(game.players.map(p => p.money)).toEqual([100, 100, 130, 70]);
        expect(game.auctioneer).toBe(3);
    });

    it('だれも足さなければ、最初に出した人が無料でもらう', () => {
        const game = newGame(3, { hands: [[card(KR, 'double'), card(YO, 'open')], [card(LM, 'open')], [card(LM, 'open', 1)]] });
        run(game, [[0, { type: 'play', card: card(KR, 'double') }], [0, { type: 'second', card: null }], [1, { type: 'second', card: null }], [2, { type: 'second', card: null }]]);
        expect(game.players[0].won).toEqual([card(KR, 'double')]);
        expect(game.players[0].money).toBe(100);
        expect(game.auctioneer).toBe(1);
    });
});

describe('回の終わりと得点', () => {
    it('順位：枚数の多い3人。同数なら盤の左の画家が上。0枚は入らない', () => {
        expect(ranking([3, 5, 3, 1, 0])).toEqual([1, 0, 2]);
        expect(ranking([0, 0, 2, 0, 0])).toEqual([2]);
        expect(ranking([1, 1, 1, 1, 1])).toEqual([0, 1, 2]);
    });

    it('絵の価値：3位までに入った画家だけ、これまでの回の値の合計。入らなければ前の値があっても0', () => {
        let tokens = Array.from({ length: 4 }, () => [0, 0, 0, 0, 0]);
        tokens = addTokens(tokens, 1, [4, 0, 2]);
        expect(paintingValues(tokens, [4, 0, 2])).toEqual([20, 0, 10, 0, 30]);
        tokens = addTokens(tokens, 2, [2, 3, 1]);
        expect(paintingValues(tokens, [2, 3, 1])).toEqual([0, 10, 40, 20, 0]);
    });

    it('5枚目が出たら競らずに回を終え、絵を売り、次の回を配る。次は5枚目を出した人の左から', () => {
        const hands = [[card(KR, 'open'), card(KR, 'open', 1), card(KR, 'once')], [card(KR, 'open', 2), card(CP, 'open')], [card(KR, 'open', 3), card(YO, 'open')]];
        const game = newGame(3, { hands });
        // 席1・2・0・1 の順に、クリプトを4枚売る（席2が2枚、席0が1枚、席1が1枚買う）
        const sell = (seller, c, buyer) => {
            run(game, [[seller, { type: 'play', card: c }]]);
            const order = [1, 2, 0].map(k => (seller + k) % 3);
            order.forEach(s => run(game, [[s, s === buyer && game.auction.high === 0 ? { type: 'bid', amount: 10 } : { type: 'pass' }]]));
        };
        sell(0, card(KR, 'open'), 2);
        sell(1, card(KR, 'open', 2), 2);
        sell(2, card(KR, 'open', 3), 0);
        sell(0, card(KR, 'open', 1), 1);
        sell(1, card(CP, 'open'), 1);
        expect(game.counts).toEqual([0, 0, 1, 0, 4]);
        // 席2が ヨーコ、席0が クリプト5枚目
        sell(2, card(YO, 'open'), 2);
        run(game, [[0, { type: 'play', card: card(KR, 'once') }]]);
        expect(game.round).toBe(2);
        expect(game.history[0].rank).toEqual([KR, YO, CP]);
        expect(game.history[0].counts).toEqual([0, 1, 1, 0, 5]);
        expect(game.tokens[0]).toEqual([0, 20, 10, 0, 30]);
        // 席0：クリプト1枚=30。席1：クリプト1枚+クリスティン1枚=40。席2：クリプト2枚+ヨーコ1枚=80
        expect(game.history[0].paid).toEqual([30, 40, 80]);
        game.players.forEach(p => expect(p.won).toEqual([]));
        game.players.forEach(p => expect(p.hand.length).toBe(6));
        expect(game.auctioneer).toBe(1);
        expect(game.counts).toEqual([0, 0, 0, 0, 0]);
    });

    it('ダブルの2枚目が5枚目なら、2枚とも競らずに回を終える。ダブルが5枚目なら2枚目は出さない', () => {
        const game = newGame(3, { seed: 2 });
        game.counts[KR] = 3;
        game.players[0].hand = [card(KR, 'double'), card(KR, 'open')];
        run(game, [[0, { type: 'play', card: card(KR, 'double') }], [0, { type: 'second', card: card(KR, 'open') }]]);
        expect(game.round).toBe(2);
        expect(game.history[0].counts[KR]).toBe(5);
        expect(game.players.every(p => !p.won.length)).toBe(true);
        const g2 = newGame(3, { seed: 2 });
        g2.counts[KR] = 4;
        g2.players[0].hand = [card(KR, 'double'), card(KR, 'open')];
        run(g2, [[0, { type: 'play', card: card(KR, 'double') }]]);
        expect(g2.round).toBe(2);
        expect(g2.players[0].hand).toContain(card(KR, 'open'));
    });

    it('手札のない人は飛ばす。全員の手札がなくなったら、最後に出たカードは競らずに回を終える', () => {
        const game = newGame(3, { hands: [[card(KR, 'open')], [], [card(YO, 'open')]] });
        run(game, [[0, { type: 'play', card: card(KR, 'open') }], [1, { type: 'pass' }], [2, { type: 'pass' }], [0, { type: 'pass' }]]);
        expect(game.auctioneer).toBe(2);
        run(game, [[2, { type: 'play', card: card(YO, 'open') }]]);
        expect(game.round).toBe(2);
        // ヨーコは競らないが数える。1枚ずつの同数は、盤の左のヨーコが上。席0はクリプト（2位）を無料でもらっていた
        expect(game.history[0].rank).toEqual([YO, KR]);
        expect(game.history[0].paid).toEqual([20, 0, 0]);
        expect(game.players.map(p => p.money)).toEqual([120, 100, 100]);
    });

    it('4回目のあとで終わり、お金の多い人の勝ち。同点なら分け合う', () => {
        const game = newGame(3, { hands: [[card(KR, 'open')], [card(YO, 'open')], []] });
        game.round = 4;
        game.players[1].money = 130;
        game.players[2].money = 130;
        run(game, [[0, { type: 'play', card: card(KR, 'open') }], [1, { type: 'pass' }], [2, { type: 'pass' }], [0, { type: 'pass' }]]);
        expect(game.isOver()).toBe(false);
        // 席1の最後の1枚は競らずに終わる。席0のクリプトは2位で20、これまでの値はないので20
        run(game, [[1, { type: 'play', card: card(YO, 'open') }]]);
        expect(game.isOver()).toBe(true);
        expect(game.players[0].money).toBe(120);
        game.players[0].money = 130;
        game.finish();
        expect(game.winners).toEqual([0, 1, 2]);
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false);
    });
});

describe('断る操作', () => {
    it('番でない人・知らない操作・おかしな値は断り、状態を変えない', () => {
        const game = newGame(3, { hands: [[card(KR, 'open')], [card(YO, 'open')], [card(CP, 'open')]] });
        const before = snapshot(game);
        const money = totalMoney(game);
        [[1, { type: 'play', card: card(YO, 'open') }], [0, { type: 'play', card: card(YO, 'open') }], [0, null], [0, { type: 'fly' }],
            [0, { type: 'bid', amount: 5 }], [0, { type: 'second', card: null }], [0, { type: 'price', amount: 5 }], [0, { type: 'buy' }],
            [0, { type: 'play', card: '0' }], [9, { type: 'pass' }]]
            .forEach(([seat, command]) => expect(game.applyCommand(seat, command), JSON.stringify(command)).toBe(false));
        expect(snapshot(game)).toBe(before);
        expect(totalMoney(game)).toBe(money);
    });
});
