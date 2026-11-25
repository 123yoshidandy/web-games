import { describe, it, expect } from 'vitest';
import Game, { CARDS } from '../public/js/game.js';
import { newGame, players, setHand, setTableau, pickAll, totalCards, snapshot } from './helpers.js';

describe('準備', () => {
    it('108枚。人数ごとに 10・9・8・7枚を配る', () => {
        expect(Object.values(CARDS).reduce((s, c) => s + c.count, 0)).toBe(108);
        [[2, 10], [3, 9], [4, 8], [5, 7]].forEach(([n, size]) => {
            const game = newGame(n);
            game.players.forEach(p => expect(p.hand).toHaveLength(size));
            expect(game.deck).toHaveLength(108 - n * size);
            expect(totalCards(game)).toBe(108);
        });
    });

    it('人数は2〜5人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(6))).toThrow();
    });
});

describe('選んで渡す', () => {
    it('全員が選ぶまでは表にせず、そろったら置いて、手札を次の席へ渡す', () => {
        const game = newGame(3);
        setHand(game, 0, ['tempura', 'sashimi', 'egg']);
        setHand(game, 1, ['dumpling', 'maki2', 'pudding']);
        setHand(game, 2, ['wasabi', 'squid', 'chopsticks']);
        game.applyCommand(0, { type: 'pick', card: 'tempura' });
        game.applyCommand(1, { type: 'pick', card: 'maki2' });
        expect(game.players[0].tableau).toEqual([]);
        expect(game.actors()).toEqual([2]);
        expect(game.applyCommand(0, { type: 'pick', card: 'sashimi' })).toBe(false); // もう選んだ
        game.applyCommand(2, { type: 'pick', card: 'wasabi' });
        expect(game.players.map(p => p.tableau.map(c => c.type))).toEqual([['tempura'], ['maki2'], ['wasabi']]);
        // 0 の残りは 1 へ、1 の残りは 2 へ、2 の残りは 0 へ
        expect(game.players[1].hand).toEqual(['sashimi', 'egg']);
        expect(game.players[2].hand).toEqual(['dumpling', 'pudding']);
        expect(game.players[0].hand).toEqual(['squid', 'chopsticks']);
    });

    it('わさびのあとのにぎりは、わさびに載る（わさび1枚に1枚まで）', () => {
        const game = newGame(2);
        setTableau(game, 0, ['wasabi']);
        setHand(game, 0, ['salmon', 'squid', 'x']);
        setHand(game, 1, ['egg', 'egg', 'x']);
        pickAll(game, ['salmon', 'egg']);
        expect(game.players[0].tableau).toEqual([{ type: 'wasabi', nigiri: 'salmon' }]);
    });

    it('箸があれば2枚取れ、箸は手札に戻って渡る', () => {
        const game = newGame(2);
        setTableau(game, 0, ['chopsticks']);
        setHand(game, 0, ['wasabi', 'squid', 'egg', 'tempura']);
        setHand(game, 1, ['dumpling', 'dumpling', 'dumpling', 'dumpling']);
        pickAll(game, [['wasabi', 'squid'], 'dumpling']);
        // わさび → イカの順に置くので、イカはわさびに載る
        expect(game.players[0].tableau).toEqual([{ type: 'wasabi', nigiri: 'squid' }]);
        expect(game.players[1].hand.sort()).toEqual(['chopsticks', 'egg', 'tempura']);
        expect(game.players[0].hand).toHaveLength(3);
    });

    it('箸がない・同じ札がない・手札にない札は断り、状態を変えない', () => {
        const game = newGame(2);
        setHand(game, 0, ['wasabi', 'squid', 'egg']);
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'pick', card: 'wasabi', second: 'squid' })).toBe(false);
        setTableau(game, 0, ['chopsticks']);
        const before2 = snapshot(game);
        expect(game.applyCommand(0, { type: 'pick', card: 'egg', second: 'egg' })).toBe(false);
        expect(game.applyCommand(0, { type: 'pick', card: 'pudding' })).toBe(false);
        expect(game.applyCommand(0, { type: 'pick', card: 'toString' })).toBe(false);
        expect(game.applyCommand(0, { type: 'nextRound' })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(snapshot(game)).toBe(before2);
        expect(before).not.toBe(before2);
    });

    it('その番に取った箸は、その番には使えない', () => {
        const game = newGame(2);
        setHand(game, 0, ['chopsticks', 'squid', 'egg']);
        expect(game.applyCommand(0, { type: 'pick', card: 'chopsticks', second: 'squid' })).toBe(false);
    });

    it('最後の1枚は自動で置き、ラウンドの得点を数えて次のラウンドを配る', () => {
        const game = newGame(2);
        setHand(game, 0, ['tempura', 'tempura']);
        setHand(game, 1, ['maki3', 'pudding']);
        pickAll(game, ['tempura', 'pudding']);
        // 残りの1枚（0 には maki3、1 には tempura）は自動で置かれる
        expect(game.round).toBe(2);
        expect(game.roundResult.round).toBe(1);
        expect(game.roundResult.tableaus.map(t => t.map(c => c.type))).toEqual([['tempura', 'maki3'], ['pudding', 'tempura']]);
        expect(game.roundResult.scores.map(s => s.total)).toEqual([6, 0]);
        expect(game.players.map(p => p.puddings)).toEqual([0, 1]);
        expect(game.players[0].hand).toHaveLength(10);
        expect(game.players[0].tableau).toEqual([]);
    });

    it('3ラウンドのあとにプリンを数え、合計点で勝ち。同点はプリンの多い人', () => {
        const game = newGame(3);
        game.round = 3;
        setHand(game, 0, ['egg']);
        setHand(game, 1, ['egg']);
        setHand(game, 2, ['egg']);
        game.players[0].score = 10;
        game.players[1].score = 16;
        game.players[2].score = 16;
        game.players.forEach((p, i) => { p.puddings = [3, 2, 1][i]; });
        // 手札が1枚になった状態からは、選べばそのまま終わる
        pickAll(game, ['egg', 'egg', 'egg']);
        expect(game.isOver()).toBe(true);
        expect(game.puddingResult).toEqual([6, 0, -6]);
        expect(game.players.map(p => p.score)).toEqual([17, 17, 11]);
        expect(game.winners).toEqual([0]); // 17 点で並び、プリンの多い 0
        expect(game.actors()).toEqual([]);
    });

    it('合計点もプリンも同じなら、全員の勝ち', () => {
        const game = newGame(2);
        game.round = 3;
        setHand(game, 0, ['egg']);
        setHand(game, 1, ['egg']);
        pickAll(game, ['egg', 'egg']);
        expect(game.winners).toEqual([0, 1]);
    });

    it('記録には決まった項目だけを残す', () => {
        const game = newGame(2);
        const card = game.players[0].hand[0];
        game.applyCommand(0, { type: 'pick', card, extra: 1 });
        expect(game.commands[0]).toEqual({ playerId: 0, command: { type: 'pick', card } });
    });
});
