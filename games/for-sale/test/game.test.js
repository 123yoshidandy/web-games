import { describe, it, expect } from 'vitest';
import Game, { coinsFor, removedFor, CHECKS, rankResults } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { players, makeGame, setup, auction, sellAll, snapshot } from './helpers.js';

describe('準備', () => {
    it.each([[3, 18, 6, 8], [4, 18, 2, 7], [5, 14, 0, 6], [6, 14, 0, 5]])('%i人なら、コイン%i枚・除く%i枚・競りと売りは%i回ずつ', (n, coins, removed, rounds) => {
        expect(coinsFor(n)).toBe(coins);
        expect(removedFor(n)).toBe(removed);
        const game = makeGame(n);
        expect(game.players.every(p => p.coins === coins)).toBe(true);
        expect(game.removedProps).toHaveLength(removed);
        expect(game.removedChecks).toHaveLength(removed);
        expect(game.rounds).toBe(rounds);
        expect(game.market).toHaveLength(n);
        expect(game.phase).toBe('bid');
    });

    it('小切手は 0 と 2〜15 が2枚ずつ', () => {
        expect(CHECKS).toHaveLength(30);
        expect(CHECKS.filter(c => c === 0)).toHaveLength(2);
        expect(CHECKS.includes(1)).toBe(false);
        expect(CHECKS.filter(c => c === 15)).toHaveLength(2);
    });

    it('人数は3〜6人。同じシードなら同じ山札と最初の手番。シードが違えば最初の手番も散らばる', () => {
        expect(() => new Game(players(2))).toThrow();
        expect(() => new Game(players(7))).toThrow();
        expect(snapshot(makeGame(4, 9))).toBe(snapshot(makeGame(4, 9)));
        expect(new Set(Array.from({ length: 40 }, (_, s) => makeGame(4, s).turn)).size).toBe(4);
    });
});

describe('競り', () => {
    // ルールブックの例：テオ（席0）が1、マリアンヌ（席1）が2、ギレーヌ（席2）が5、テオが6。マリアンヌが降りて1が戻り8を、ギレーヌが降りて2が戻り20を、テオは6を払って28を取る
    it('ルールブックの例のとおりに進む', () => {
        const game = makeGame(3);
        setup(game, { market: [8, 20, 28], turn: 0, coins: [18, 18, 18] });
        auction(game, [1, 2, 5, 6, 'p']);
        expect(game.players[1].hand).toEqual([8]);
        expect(game.players[1].coins).toBe(17);
        expect(game.turn).toBe(2);
        auction(game, ['p']);
        expect(game.players[2].hand).toEqual([20]);
        expect(game.players[2].coins).toBe(15);
        expect(game.players[0].hand).toEqual([28]);
        expect(game.players[0].coins).toBe(12);
        // テオが次の競りを始める
        expect(game.turn).toBe(0);
        expect(game.market.every(m => m.takenBy === null)).toBe(true);
        expect(game.players.every(p => p.bid === 0 && !p.passed)).toBe(true);
    });

    it('入札は今の最高額より多く、持っているコイン以下。降りた人は飛ばす', () => {
        const game = makeGame(4);
        setup(game, { market: [3, 9, 15, 21], turn: 1, coins: [18, 18, 4, 18] });
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'bid', amount: 0 })).toBe(false);
        expect(game.applyCommand(1, { type: 'bid', amount: 19 })).toBe(false);
        expect(game.applyCommand(1, { type: 'bid', amount: 1.5 })).toBe(false);
        expect(game.applyCommand(0, { type: 'bid', amount: 3 })).toBe(false); // 手番でない
        expect(snapshot(game)).toBe(before);
        auction(game, [5]);
        expect(game.bidRange(2)).toBe(null); // コイン4では上げられない
        expect(game.applyCommand(2, { type: 'bid', amount: 6 })).toBe(false);
        auction(game, ['p']);           // 席2が降りて3を取る（出していないので払わない）
        expect(game.players[2].hand).toEqual([3]);
        expect(game.players[2].coins).toBe(4);
        auction(game, [6, 'p']);         // 席3が6、席0が降りる
        expect(game.turn).toBe(1);      // 降りた席2は飛ばす
        auction(game, [7]);
        expect(game.turn).toBe(3);
    });

    it('出したコインが奇数なら、戻るのは半分の切り捨て', () => {
        const game = makeGame(3);
        setup(game, { market: [1, 2, 3], turn: 0, coins: [18, 18, 18] });
        auction(game, [5, 6, 'p', 'p']);
        expect(game.players[0].coins).toBe(18 - 3);
        expect(game.players[1].coins).toBe(18 - 6);
    });

    it('全部の物件が出たら後半になり、人数分の小切手が大きい順に並ぶ', () => {
        const game = makeGame(3, 4);
        for (let i = 0; i < game.rounds; i++) auction(game, ['p', 'p']);
        expect(game.phase).toBe('sell');
        expect(game.players.reduce((s, p) => s + p.hand.length, 0)).toBe(24);
        expect(game.checkMarket).toHaveLength(3);
        expect([...game.checkMarket].sort((a, b) => b - a)).toEqual(game.checkMarket);
        expect(game.applyCommand(game.turn, { type: 'pass' })).toBe(false);
    });
});

describe('売り', () => {
    const atSelling = () => {
        const game = makeGame(3);
        setup(game, { propDeck: [], market: [28, 29, 30] });
        auction(game, ['p', 'p']);
        setup(game, { hands: [[1, 30], [10, 20], [5, 25]], checkDeck: [0, 2, 3] });
        game.checkMarket = [15, 9, 0];
        game.selected = [null, null, null];
        return game;
    };

    it('全員が出すまで公開しない。高い物件から順に、高い小切手をもらう', () => {
        const game = atSelling();
        game.applyCommand(0, { type: 'sell', card: 1 });
        const view = createGameView(game, 1);
        expect(JSON.stringify(view.players)).not.toContain('"selected":1');
        expect(view.mySelection).toBe(null);
        expect(createGameView(game, 0).mySelection).toBe(1);
        expect(game.applyCommand(0, { type: 'sell', card: 30 })).toBe(false); // もう出した
        expect(game.applyCommand(1, { type: 'sell', card: 5 })).toBe(false);  // 持っていない
        game.applyCommand(1, { type: 'sell', card: 20 });
        game.applyCommand(2, { type: 'sell', card: 5 });
        expect(game.players.map(p => p.checks)).toEqual([[0], [15], [9]]);
        expect(game.players[0].hand).toEqual([30]);
        expect(game.checkMarket).toEqual([3, 2, 0]); // 次の小切手
    });

    it('最後の小切手を配ったら終わる。得点は小切手＋残りのコイン', () => {
        const game = atSelling();
        game.checkDeck = [];
        game.players.forEach((p, i) => { p.coins = [3, 1, 4][i]; });
        sellAll(game, [30, 10, 25]);
        expect(game.isOver()).toBe(true);
        expect(game.results().map(r => r.score)).toEqual([18, 1, 13]);
        expect(game.winners).toEqual([0]);
    });

    it('同点なら残りのコインが多い人。それでも同点なら、競りで手に入れた一番高い物件の人', () => {
        expect(rankResults([
            { seat: 0, score: 40, coins: 2, best: 30 },
            { seat: 1, score: 40, coins: 5, best: 12 },
            { seat: 2, score: 39, coins: 9, best: 29 }
        ]).map(r => r.seat)).toEqual([1, 0, 2]);
        expect(rankResults([
            { seat: 0, score: 40, coins: 5, best: 22 },
            { seat: 1, score: 40, coins: 5, best: 27 }
        ])[0].seat).toBe(1);
    });
});

describe('記録と再現', () => {
    // 通る操作をでたらめに選んで最後まで進める（判断の乱数はゲームと別）
    const randomPlay = (n, seed) => {
        const game = new Game(players(n), { seed });
        let x = seed * 7919 + 1;
        const next = () => (x = (x * 1103515245 + 12345) % 2147483648);
        while (!game.isOver()) {
            if (game.phase === 'bid') {
                const range = game.bidRange(game.turn);
                const command = range && next() % 3 !== 0 ? { type: 'bid', amount: range.min + (next() % 2) } : { type: 'pass' };
                if (command.type === 'bid' && command.amount > range.max) command.amount = range.max;
                expect(game.applyCommand(game.turn, command)).toBe(true);
            } else {
                const seat = game.actors()[0];
                const hand = game.players[seat].hand;
                expect(game.applyCommand(seat, { type: 'sell', card: hand[next() % hand.length] })).toBe(true);
            }
        }
        return game;
    };

    it.each([3, 4, 5, 6])('%i人のでたらめな試合が最後まで進み、記録から同じ状態を再現できる', (n) => {
        for (let seed = 1; seed <= 10; seed++) {
            const game = randomPlay(n, seed);
            expect(game.players.every(p => p.hand.length === 0 && p.coins >= 0)).toBe(true);
            expect(game.players.reduce((s, p) => s + p.checks.length, 0)).toBe(30 - removedFor(n));
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('記録には決まった項目だけを残す', () => {
        const game = makeGame(3);
        game.applyCommand(game.turn, { type: 'bid', amount: 2, extra: 'x'.repeat(100) });
        expect(game.commands.at(-1).command).toEqual({ type: 'bid', amount: 2 });
    });
});

describe('ビュー', () => {
    it('山札の並びと除いたカードは見せない。終わったら除いたカードを見せる', () => {
        const game = makeGame(3, 5);
        const text = JSON.stringify(createGameView(game, 0));
        expect(text).not.toContain('propDeck');
        expect(text).not.toContain('removed":{');
        expect(createGameView(game, 0).propsLeft).toBe(24 - 3);
    });

    it('自分の番にだけ、入札できる範囲と降りたときに取る物件を出す', () => {
        const game = makeGame(4, 2);
        const me = game.turn;
        const view = createGameView(game, me);
        expect(view.options.range).toEqual({ min: 1, max: 18 });
        expect(view.options.lowest).toBe(game.market[0].card);
        expect(createGameView(game, (me + 1) % 4).options).toBe(null);
    });
});
