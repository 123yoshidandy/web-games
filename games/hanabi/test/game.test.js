import { describe, it, expect } from 'vitest';
import Game, { bitsToColors, bitsToRanks, handSizeFor } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { newGame, PLAYERS, setCard, playRandom, snapshot } from './helpers.js';

describe('準備', () => {
    it('50枚：各色 1が3枚・2〜4が2枚・5が1枚', () => {
        const game = newGame(2, 1);
        const all = [...game.deck, ...game.cards];
        expect(all).toHaveLength(50);
        for (let color = 0; color < 5; color++) {
            const ranks = all.filter(c => c.color === color).map(c => c.rank).sort();
            expect(ranks).toEqual([1, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
        }
    });

    it.each([[2, 5], [3, 5], [4, 4], [5, 4]])('%i人なら手札は%i枚', (n, size) => {
        const game = newGame(n, 2);
        expect(handSizeFor(n)).toBe(size);
        expect(game.hands.every(h => h.length === size)).toBe(true);
        expect(game.deck).toHaveLength(50 - n * size);
        expect(game.clues).toBe(8);
        expect(game.mistakes).toBe(0);
    });

    it('人数が範囲の外なら作れない', () => {
        expect(() => new Game(PLAYERS(1), { seed: 1 })).toThrow();
        expect(() => new Game(PLAYERS(6), { seed: 1 })).toThrow();
    });

    it('同じシードなら同じ並び', () => {
        expect(snapshot(newGame(3, 42))).toBe(snapshot(newGame(3, 42)));
        expect(snapshot(newGame(3, 42))).not.toBe(snapshot(newGame(3, 43)));
    });
});

describe('ヒント', () => {
    it('その色の札をすべて指し、ほかの札はその色でないと分かる', () => {
        const game = newGame(2, 3);
        const seat = game.current;
        const target = 1 - seat;
        const hand = game.hands[target];
        setCard(game, hand[0], 0, 1);
        setCard(game, hand[1], 2, 3);
        setCard(game, hand[2], 0, 4);
        setCard(game, hand[3], 3, 1);
        setCard(game, hand[4], 4, 2);
        expect(game.applyCommand(seat, { type: 'clue', target, kind: 'color', value: 0 })).toBe(true);
        expect(bitsToColors(game.knowledge[hand[0]].colors)).toEqual([0]);
        expect(bitsToColors(game.knowledge[hand[2]].colors)).toEqual([0]);
        expect(bitsToColors(game.knowledge[hand[1]].colors)).toEqual([1, 2, 3, 4]);
        expect(game.knowledge[hand[0]].clued).toBe(true);
        expect(game.knowledge[hand[1]].clued).toBe(false);
        expect(game.clues).toBe(7);
        expect(game.clueLog[0]).toMatchObject({ giver: seat, target, kind: 'color', value: 0, touched: [hand[0], hand[2]] });
        expect(game.current).toBe(target);
    });

    it('数字のヒントも同じ', () => {
        const game = newGame(2, 3);
        const seat = game.current;
        const target = 1 - seat;
        const hand = game.hands[target];
        setCard(game, hand[0], 0, 1);
        setCard(game, hand[1], 2, 1);
        setCard(game, hand[2], 1, 4);
        game.applyCommand(seat, { type: 'clue', target, kind: 'rank', value: 1 });
        expect(bitsToRanks(game.knowledge[hand[0]].ranks)).toEqual([1]);
        expect(bitsToRanks(game.knowledge[hand[2]].ranks)).toEqual([2, 3, 4, 5]);
    });

    it('2回目に指された札は、新しく指された札に入らない', () => {
        const game = newGame(2, 3);
        const a = game.current;
        const b = 1 - a;
        const hand = game.hands[b];
        setCard(game, hand[0], 0, 1);
        setCard(game, hand[1], 0, 2);
        for (let i = 2; i < 5; i++) setCard(game, hand[i], 3, 3);
        game.applyCommand(a, { type: 'clue', target: b, kind: 'rank', value: 1 });
        game.applyCommand(b, { type: 'clue', target: a, kind: 'color', value: game.cards[game.hands[a][0]].color });
        game.applyCommand(a, { type: 'clue', target: b, kind: 'color', value: 0 });
        expect(game.clueLog[2].newly).toEqual([hand[1]]);
    });
});

describe('出す・捨てる', () => {
    it('続きの数字なら花火に並ぶ', () => {
        const game = newGame(2, 4);
        const seat = game.current;
        const order = game.hands[seat][0];
        setCard(game, order, 1, 1);
        expect(game.applyCommand(seat, { type: 'play', order })).toBe(true);
        expect(game.fireworks[1]).toBe(1);
        expect(game.mistakes).toBe(0);
        expect(game.hands[seat]).toHaveLength(5);
        expect(game.hands[seat]).not.toContain(order);
        // 新しい札は右に入る
        expect(game.hands[seat][4]).toBe(game.cards.length - 1);
    });

    it('続きでなければミスになり、札は捨て札へ', () => {
        const game = newGame(2, 4);
        const seat = game.current;
        const order = game.hands[seat][0];
        setCard(game, order, 1, 3);
        game.applyCommand(seat, { type: 'play', order });
        expect(game.mistakes).toBe(1);
        expect(game.discards).toEqual([order]);
        expect(game.fireworks[1]).toBe(0);
    });

    it('5を出し切るとヒントが1つ戻る（8つのときは戻らない）', () => {
        const game = newGame(2, 4);
        game.fireworks[2] = 4;
        game.clues = 5;
        const seat = game.current;
        const order = game.hands[seat][0];
        setCard(game, order, 2, 5);
        game.applyCommand(seat, { type: 'play', order });
        expect(game.clues).toBe(6);
        const g2 = newGame(2, 4);
        g2.fireworks[2] = 4;
        const o2 = g2.hands[g2.current][0];
        setCard(g2, o2, 2, 5);
        g2.applyCommand(g2.current, { type: 'play', order: o2 });
        expect(g2.clues).toBe(8);
    });

    it('捨てるとヒントが1つ戻る。8つのときは捨てられない', () => {
        const game = newGame(2, 4);
        const seat = game.current;
        const order = game.hands[seat][0];
        const before = snapshot(game);
        expect(game.applyCommand(seat, { type: 'discard', order })).toBe(false);
        expect(snapshot(game)).toBe(before);
        game.clues = 6;
        expect(game.applyCommand(seat, { type: 'discard', order })).toBe(true);
        expect(game.clues).toBe(7);
        expect(game.discards).toEqual([order]);
    });
});

describe('断る操作', () => {
    const cases = [
        ['手番でない', g => g.applyCommand(1 - g.current, { type: 'play', order: g.hands[1 - g.current][0] })],
        ['他人の札を出す', g => g.applyCommand(g.current, { type: 'play', order: g.hands[1 - g.current][0] })],
        ['自分にヒント', g => g.applyCommand(g.current, { type: 'clue', target: g.current, kind: 'rank', value: 1 })],
        ['1枚も指さないヒント', g => {
            const t = 1 - g.current;
            const missing = [1, 2, 3, 4, 5].find(r => g.clueTouches(t, 'rank', r).length === 0);
            return g.applyCommand(g.current, { type: 'clue', target: t, kind: 'rank', value: missing });
        }],
        ['ヒントが0', g => { g.clues = 0; return g.applyCommand(g.current, { type: 'clue', target: 1 - g.current, kind: 'color', value: g.cards[g.hands[1 - g.current][0]].color }); }],
        ['不正な色', g => g.applyCommand(g.current, { type: 'clue', target: 1 - g.current, kind: 'color', value: 7 })],
        ['不正な種類', g => g.applyCommand(g.current, { type: 'pass' })],
        ['形が不正', g => g.applyCommand(g.current, null)]
    ];
    it.each(cases)('%s：断り、状態を変えない', (_, act) => {
        const game = newGame(2, 5);
        let before = null;
        const original = game.applyCommand.bind(game);
        game.applyCommand = (seat, command) => {
            before = snapshot(game);
            return original(seat, command);
        };
        expect(act(game)).toBe(false);
        expect(game.lastError).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });
});

describe('ゲームの終わり', () => {
    it('ミス3回で花火が爆発して終わり、全員の負けで0点', () => {
        const game = newGame(2, 6);
        game.fireworks = [3, 2, 0, 1, 0];
        game.mistakes = 2;
        expect(game.score).toBe(6);
        const seat = game.current;
        const order = game.hands[seat][0];
        setCard(game, order, 0, 5);
        game.applyCommand(seat, { type: 'play', order });
        expect(game.isOver).toBe(true);
        expect(game.endReason).toBe('mistakes');
        expect(game.score).toBe(0);
        expect(createGameView(game, 0).score).toBe(0);
    });

    it('山札が尽きたら、引いた人を含めて全員があと1回ずつ', () => {
        for (const n of [2, 3, 5]) {
            const game = newGame(n, 7);
            game.clues = 0;
            // 山札を1枚にする
            game.deck.splice(0, game.deck.length - 1);
            const drawer = game.current;
            game.applyCommand(drawer, { type: 'discard', order: game.hands[drawer][0] });
            expect(game.deck).toHaveLength(0);
            const turns = [];
            while (!game.isOver) {
                turns.push(game.current);
                game.applyCommand(game.current, { type: 'discard', order: game.hands[game.current][0] });
            }
            expect(turns).toHaveLength(n);
            expect(turns[n - 1]).toBe(drawer);
            expect(game.endReason).toBe('deck');
        }
    });

    it('25点で終わる', () => {
        const game = newGame(2, 8);
        game.fireworks = [5, 5, 5, 5, 4];
        const seat = game.current;
        const order = game.hands[seat][0];
        setCard(game, order, 4, 5);
        game.applyCommand(seat, { type: 'play', order });
        expect(game.score).toBe(25);
        expect(game.endReason).toBe('perfect');
    });
});

describe('試合を通して', () => {
    for (const n of [2, 3, 4, 5]) {
        it(`${n}人：ランダムな手で最後まで進み、記録から再現できる`, () => {
            for (let seed = 1; seed <= 30; seed++) {
                const game = newGame(n, seed * 13);
                playRandom(game, seed, g => {
                    const inHands = g.hands.flat().length;
                    const played = g.fireworks.reduce((a, b) => a + b, 0);
                    expect(inHands + g.deck.length + g.discards.length + played).toBe(50);
                    expect(g.clues).toBeGreaterThanOrEqual(0);
                    expect(g.clues).toBeLessThanOrEqual(8);
                });
                expect(game.isOver).toBe(true);
                const replayed = Game.replay(PLAYERS(n), { seed: game.seed }, game.commands);
                expect(snapshot(replayed)).toBe(snapshot(game));
            }
        });
    }
});

describe('ビュー', () => {
    it('自分の手札の中身は入らず、相手の手札は見える', () => {
        const game = newGame(3, 9);
        const view = createGameView(game, 0);
        expect(view.players[0].hand.every(c => c.color === null && c.rank === null)).toBe(true);
        expect(view.players[1].hand.every(c => c.color !== null && c.rank !== null)).toBe(true);
        expect(view.deck).toBeUndefined();
        expect(view.deckCount).toBe(game.deck.length);
        expect(JSON.stringify(view)).not.toContain('"cards"');
    });
});
