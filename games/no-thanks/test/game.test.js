import { describe, it, expect } from 'vitest';
import Game, { chipsFor, runsOf, cardPoints, scoreOf, addedPoints, DECK_COUNT, LOWEST, HIGHEST, REMOVED_COUNT } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { players, makeGame, setup, act, snapshot } from './helpers.js';

describe('準備', () => {
    it.each([[3, 11], [4, 11], [5, 11], [6, 9], [7, 7]])('%i人なら、チップは%i枚ずつ', (n, chips) => {
        expect(chipsFor(n)).toBe(chips);
        expect(makeGame(n).players.every(p => p.chips === chips)).toBe(true);
    });

    it('3〜35 から9枚を除き、24枚の山札から1枚めくって始める', () => {
        const game = makeGame(4, 3);
        expect(game.removed).toHaveLength(REMOVED_COUNT);
        expect(game.deck).toHaveLength(DECK_COUNT - 1);
        const all = [...game.removed, ...game.deck, game.current].sort((a, b) => a - b);
        expect(all).toEqual(Array.from({ length: HIGHEST - LOWEST + 1 }, (_, i) => LOWEST + i));
        expect(game.pot).toBe(0);
        expect(game.phase).toBe('play');
    });

    it('人数は3〜7人', () => {
        expect(() => new Game(players(2))).toThrow();
        expect(() => new Game(players(8))).toThrow();
    });

    it('同じシードなら、同じ山札と最初の手番になる。シードが違えば最初の手番も散らばる', () => {
        expect(snapshot(makeGame(5, 9))).toBe(snapshot(makeGame(5, 9)));
        const firsts = new Set(Array.from({ length: 40 }, (_, seed) => makeGame(5, seed).turn));
        expect(firsts.size).toBe(5);
    });
});

describe('得点', () => {
    it('連続した数は、一番小さい数だけを数える', () => {
        expect(runsOf([25, 3, 15, 13, 14])).toEqual([[3], [13, 14, 15], [25]]);
        // ルールブックの例：3 + 7・8 + 13〜16 + 25 = 48、チップ8枚で 40
        expect(cardPoints([3, 7, 8, 13, 14, 15, 16, 25])).toBe(48);
        expect(scoreOf([3, 7, 8, 13, 14, 15, 16, 25], 8)).toBe(40);
        expect(cardPoints([])).toBe(0);
    });

    it('取ったときに増える失点：つながれば増えず、すき間を埋めると減る', () => {
        expect(addedPoints([13, 15, 16], 20)).toBe(20);
        expect(addedPoints([13, 15, 16], 17)).toBe(0);
        expect(addedPoints([13, 15, 16], 12)).toBe(-1);
        expect(addedPoints([13, 15, 16], 14)).toBe(-15);
    });
});

describe('手番', () => {
    it('いらないなら、チップを1枚置いて次の人へ。取ったら、チップをもらい、次のカードも同じ人が選ぶ', () => {
        const game = makeGame(3);
        setup(game, { deck: [20, 30], current: 11, pot: 0, turn: 0 });
        act(game, 'pp');
        expect(game.pot).toBe(2);
        expect(game.players[0].chips).toBe(10);
        expect(game.players[1].chips).toBe(10);
        expect(game.turn).toBe(2);
        act(game, 't');
        expect(game.players[2].cards).toEqual([11]);
        expect(game.players[2].chips).toBe(13);
        expect(game.pot).toBe(0);
        expect(game.current).toBe(20);
        expect(game.turn).toBe(2);
        act(game, 'p');
        expect(game.turn).toBe(0); // 最後の席の次は最初の席
    });

    it('チップがなければ、いらないとは言えない（状態も変えない）', () => {
        const game = makeGame(3);
        setup(game, { turn: 1, chips: [11, 0, 11] });
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'pass' })).toBe(false);
        expect(game.lastError).toMatch('チップがない');
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(1, { type: 'take' })).toBe(true);
    });

    it('手番でない人・知らない操作・終わったあとの操作は断り、状態を変えない', () => {
        const game = makeGame(4, 2);
        const before = snapshot(game);
        const other = (game.turn + 1) % 4;
        [[other, { type: 'take' }], [game.turn, { type: 'steal' }], [game.turn, null], [9, { type: 'take' }], [game.turn, 'take']].forEach(([seat, command]) => {
            expect(game.applyCommand(seat, command)).toBe(false);
        });
        expect(snapshot(game)).toBe(before);
    });

    it('最後のカードを取ったら終わる。得点の一番少ない人の勝ち', () => {
        const game = makeGame(3);
        setup(game, { deck: [], current: 35, pot: 0, turn: 0, cards: [[3], [10, 11], [20]], chips: [5, 11, 11] });
        act(game, 'pp');
        // 2番目の人が 35 とチップ2枚を取って終わる
        act(game, 't');
        expect(game.isOver()).toBe(true);
        expect(game.actors()).toEqual([]);
        const scores = game.results().map(r => r.score);
        expect(scores).toEqual([3 - 4, 10 - 10, 20 + 35 - 13]);
        expect(game.winners).toEqual([0]);
        expect(game.applyCommand(0, { type: 'take' })).toBe(false);
    });

    it('同点なら、その全員で勝ちを分け合う', () => {
        const game = makeGame(3);
        setup(game, { deck: [], current: 4, pot: 0, turn: 2, cards: [[10], [12], [5]], chips: [3, 5, 4] });
        act(game, 't');
        // 7・7・(4・5 は 4) − 4 = 0 … 0 が勝ち
        expect(game.results().map(r => r.score)).toEqual([7, 7, 0]);
        expect(game.winners).toEqual([2]);
        const tie = makeGame(3);
        setup(tie, { deck: [], current: 30, pot: 0, turn: 2, cards: [[10], [12], [5]], chips: [3, 5, 28] });
        act(tie, 't');
        expect(tie.results().map(r => r.score)).toEqual([7, 7, 7]);
        expect(tie.winners).toEqual([0, 1, 2]);
    });
});

describe('記録と再現', () => {
    // シードから作った別の乱数で、通る操作をでたらめに選んで最後まで進める
    const randomPlay = (n, seed) => {
        const game = new Game(players(n), { seed });
        let x = seed * 7919 + 1;
        while (!game.isOver()) {
            x = (x * 1103515245 + 12345) % 2147483648;
            const type = game.players[game.turn].chips > 0 && x % 3 !== 0 ? 'pass' : 'take';
            expect(game.applyCommand(game.turn, { type })).toBe(true);
        }
        return game;
    };

    it.each([3, 5, 7])('%i人のでたらめな試合が最後まで進み、記録から同じ状態を再現できる', (n) => {
        for (let seed = 1; seed <= 10; seed++) {
            const game = randomPlay(n, seed);
            expect(game.players.reduce((sum, p) => sum + p.cards.length, 0)).toBe(DECK_COUNT);
            expect(game.players.reduce((sum, p) => sum + p.chips, 0)).toBe(chipsFor(n) * n);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('記録には決まった項目だけを残す', () => {
        const game = makeGame(3);
        game.applyCommand(game.turn, { type: 'pass', extra: 'x'.repeat(100) });
        expect(game.commands.at(-1).command).toEqual({ type: 'pass' });
    });
});

describe('ビュー', () => {
    it('ほかの人のチップの数・除いたカード・山札の並びは見せない。終わったら見せる', () => {
        const game = makeGame(4, 5);
        const view = createGameView(game, 1);
        expect(view.players[1].chips).toBe(11);
        [0, 2, 3].forEach(seat => expect(view.players[seat].chips).toBe(null));
        expect(view.removed).toBe(null);
        expect(view.deckCount).toBe(DECK_COUNT - 1);
        const text = JSON.stringify(view);
        expect(text).not.toContain('"deck"');
        expect(createGameView(game, null).players.every(p => p.chips === null)).toBe(true);

        while (!game.isOver()) game.applyCommand(game.turn, { type: 'take' });
        const end = createGameView(game, 1);
        expect(end.players.every(p => p.chips !== null)).toBe(true);
        expect(end.removed).toHaveLength(REMOVED_COUNT);
        expect(end.results).toHaveLength(4);
    });

    it('連続をまとめる前のカードと、カードの失点を出す', () => {
        const game = makeGame(3);
        setup(game, { cards: [[13, 14, 15, 30], [], []] });
        const view = createGameView(game, 0);
        expect(view.players[0].cards).toEqual([13, 14, 15, 30]);
        expect(view.players[0].cardPoints).toBe(43);
    });
});
