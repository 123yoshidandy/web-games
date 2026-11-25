import { describe, it, expect } from 'vitest';
import Game, { CARDS, COLORS, expeditionScore, canPlace } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { players, makeGame, card, setup, snapshot } from './helpers.js';

const all = (game) => [...game.deck, ...COLORS.flatMap(c => game.discards[c]), ...game.players.flatMap(p => [...p.hand, ...COLORS.flatMap(c => p.expeditions[c])])];

describe('カード', () => {
    it('60枚。色ごとに 2〜10 と握手3枚', () => {
        expect(CARDS).toHaveLength(60);
        COLORS.forEach(color => {
            const values = CARDS.filter(c => c.color === color).map(c => c.value).sort((a, b) => a - b);
            expect(values).toEqual([0, 0, 0, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
        });
    });
});

describe('得点', () => {
    const r = (value, nth = 0) => card('red', value, nth);
    it('数字の合計 − 20。始めていない色は0点', () => {
        expect(expeditionScore([])).toBe(0);
        expect(expeditionScore([r(2), r(3)])).toBe(-15);
        expect(expeditionScore([r(4), r(7), r(9)])).toBe(0);
        expect(expeditionScore([r(8), r(9), r(10)])).toBe(7);
    });

    it('握手の数で×2・×3・×4。握手だけでも −20 を倍にする', () => {
        expect(expeditionScore([r(0), r(8), r(9), r(10)])).toBe(14);
        expect(expeditionScore([r(0), r(0, 1), r(8), r(9), r(10)])).toBe(21);
        expect(expeditionScore([r(0), r(0, 1), r(0, 2), r(8), r(9), r(10)])).toBe(28);
        expect(expeditionScore([r(0)])).toBe(-40);
        expect(expeditionScore([r(0), r(2)])).toBe(-36);
    });

    it('8枚以上で +20（倍にしない）', () => {
        const eight = [r(0), r(2), r(3), r(4), r(5), r(6), r(7), r(8)];
        expect(expeditionScore(eight)).toBe((35 - 20) * 2 + 20);
        const seven = [r(2), r(3), r(4), r(5), r(6), r(7), r(8)];
        expect(expeditionScore(seven)).toBe(15);
        const all12 = CARDS.filter(c => c.color === 'red').map(c => c.id);
        expect(expeditionScore(all12)).toBe((54 - 20) * 4 + 20);
    });

    it('置けるのは小さい順。握手は数字より前だけ', () => {
        expect(canPlace([], r(5))).toBe(true);
        expect(canPlace([r(0)], r(0, 1))).toBe(true);
        expect(canPlace([r(0)], r(2))).toBe(true);
        expect(canPlace([r(3)], r(0))).toBe(false);
        expect(canPlace([r(3)], r(2))).toBe(false);
        expect(canPlace([r(3)], r(4))).toBe(true);
        expect(canPlace([r(3)], r(10))).toBe(true);
    });
});

describe('準備', () => {
    it('各自に8枚配り、残りの44枚が山札', () => {
        const game = makeGame();
        game.players.forEach(p => expect(p.hand).toHaveLength(8));
        expect(game.deck).toHaveLength(44);
        expect(new Set(all(game)).size).toBe(60);
    });

    it('2人でしか遊べない。ラウンドの数は1か3（既定は3）', () => {
        expect(() => new Game([{ name: 'A' }])).toThrow();
        expect(makeGame(1).options.rounds).toBe(3);
        expect(makeGame(1, { rounds: 1 }).options.rounds).toBe(1);
        expect(makeGame(1, { rounds: 7 }).options.rounds).toBe(3);
    });

    it('同じシードなら同じ配り方', () => {
        expect(snapshot(makeGame(5))).toBe(snapshot(makeGame(5)));
    });
});

describe('手番', () => {
    it('出してから引く。出す前に引けず、引く前に出せない', () => {
        const game = makeGame();
        setup(game, { hands: [[card('blue', 5), card('blue', 7)], [card('red', 2)]] });
        expect(game.applyCommand(0, { type: 'draw', from: 'deck' })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: card('blue', 5), to: 'expedition' })).toBe(true);
        expect(game.phase).toBe('draw');
        expect(game.applyCommand(0, { type: 'play', card: card('blue', 7), to: 'expedition' })).toBe(false);
        expect(game.applyCommand(0, { type: 'draw', from: 'deck' })).toBe(true);
        expect(game.players[0].hand).toHaveLength(2);
        expect(game.current).toBe(1);
        expect(game.phase).toBe('play');
    });

    it('探検には小さい順。握手は数字より前', () => {
        const game = makeGame();
        setup(game, { hands: [[card('green', 4), card('green', 0)]], expeditions: [{ green: [card('green', 6)] }, {}] });
        expect(game.applyCommand(0, { type: 'play', card: card('green', 4), to: 'expedition' })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: card('green', 0), to: 'expedition' })).toBe(false);
        expect(game.lastError).toMatch(/握手/);
        expect(game.applyCommand(0, { type: 'play', card: card('green', 4), to: 'discard' })).toBe(true);
        expect(game.discards.green).toEqual([card('green', 4)]);
    });

    it('今捨てたカードは、その手番には引けない。ほかの捨て場からは引ける', () => {
        const game = makeGame();
        setup(game, { hands: [[card('white', 9)], []], discards: { yellow: [card('yellow', 3)] } });
        game.applyCommand(0, { type: 'play', card: card('white', 9), to: 'discard' });
        expect(game.applyCommand(0, { type: 'draw', from: 'white' })).toBe(false);
        expect(game.applyCommand(0, { type: 'draw', from: 'red' })).toBe(false); // 空
        expect(game.applyCommand(0, { type: 'draw', from: 'yellow' })).toBe(true);
        expect(game.players[0].hand).toEqual([card('yellow', 3)]);
        // 次の手番の人は、さっき捨てたカードを引ける
        setup(game, { hands: [[], [card('red', 2)]], current: 1, deck: game.deck, discards: { white: [card('white', 9)] } });
        game.applyCommand(1, { type: 'play', card: card('red', 2), to: 'expedition' });
        expect(game.applyCommand(1, { type: 'draw', from: 'white' })).toBe(true);
    });

    it('捨て場から引けるのは一番上だけ', () => {
        const game = makeGame();
        setup(game, { hands: [[card('red', 10)], []], discards: { blue: [card('blue', 2), card('blue', 8)] } });
        game.applyCommand(0, { type: 'play', card: card('red', 10), to: 'expedition' });
        game.applyCommand(0, { type: 'draw', from: 'blue' });
        expect(game.players[0].hand).toEqual([card('blue', 8)]);
        expect(game.discards.blue).toEqual([card('blue', 2)]);
    });
});

describe('ラウンドの終わり', () => {
    it('山札の最後の1枚を引いたら終わり、得点を足して配り直す。1番手は交代する', () => {
        const game = makeGame(3);
        const first = game.starter;
        const r = (v) => card('red', v);
        setup(game, { hands: first === 0 ? [[r(9)], []] : [[], [r(9)]], expeditions: first === 0 ? [{ red: [r(5), r(7)] }, {}] : [{}, { red: [r(5), r(7)] }], deck: [card('blue', 2)], current: first });
        game.applyCommand(first, { type: 'play', card: r(9), to: 'expedition' });
        game.applyCommand(first, { type: 'draw', from: 'deck' });
        expect(game.round).toBe(2);
        expect(game.history[0].results[first].score).toBe(1);
        expect(game.players[first].total).toBe(1);
        expect(game.current).toBe(1 - first);
        expect(new Set(all(game)).size).toBe(60);
    });

    it('捨て場から引いたら、山札は減らない', () => {
        const game = makeGame(3);
        setup(game, { hands: [[card('red', 9)], []], discards: { blue: [card('blue', 3)] }, deck: [card('blue', 2)] });
        game.applyCommand(0, { type: 'play', card: card('red', 9), to: 'discard' });
        game.applyCommand(0, { type: 'draw', from: 'blue' });
        expect(game.round).toBe(1);
        expect(game.deck).toHaveLength(1);
    });

    it('決めた数のラウンドが終わったら、合計の多い方が勝ち。同じなら引き分け', () => {
        const game = makeGame(3, { rounds: 1 });
        setup(game, { hands: [[card('red', 9)], []], expeditions: [{ red: [card('red', 10)] }, {}], deck: [card('blue', 2)] });
        game.applyCommand(0, { type: 'play', card: card('red', 9), to: 'discard' });
        game.applyCommand(0, { type: 'draw', from: 'deck' });
        expect(game.phase).toBe('end');
        expect(game.winners).toEqual([1]); // −10 対 0
        const tie = makeGame(3, { rounds: 1 });
        setup(tie, { hands: [[card('red', 9)], []], deck: [card('blue', 2)] });
        tie.applyCommand(0, { type: 'play', card: card('red', 9), to: 'discard' });
        tie.applyCommand(0, { type: 'draw', from: 'deck' });
        expect(tie.winners).toEqual([0, 1]);
        expect(tie.applyCommand(1, { type: 'play', card: 0, to: 'discard' })).toBe(false);
    });
});

describe('記録と再現', () => {
    it('断った操作では、状態が少しも変わらない', () => {
        const game = makeGame(4);
        setup(game, { hands: [[card('red', 5)], []], expeditions: [{ red: [card('red', 7)] }, {}] });
        const before = snapshot(game);
        [
            { type: 'play', card: card('red', 5), to: 'expedition' }, { type: 'play', card: card('red', 5), to: 'nowhere' },
            { type: 'play', card: 59, to: 'discard' }, { type: 'draw', from: 'deck' }, { type: 'nope' }, null
        ].forEach(command => {
            expect(game.applyCommand(0, command)).toBe(false);
            expect(snapshot(game)).toBe(before);
        });
        expect(game.applyCommand(1, { type: 'play', card: card('red', 5), to: 'discard' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('記録から同じ状態を作り直せる。余計な項目は記録しない', () => {
        const game = makeGame(6);
        const seat = game.current;
        game.applyCommand(seat, { type: 'play', card: game.players[seat].hand[0], to: 'discard', junk: 1 });
        game.applyCommand(seat, { type: 'draw', from: 'deck' });
        expect(Object.keys(game.commands[0].command)).toEqual(['type', 'card', 'to']);
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });
});

describe('ビュー', () => {
    it('相手の手札と、相手が山札から引いたカードは見せない。捨て場と探検は見せる', () => {
        const game = makeGame(7);
        setup(game, { hands: [[card('red', 5)], [card('blue', 6)]], discards: { green: [card('green', 2)] } });
        game.applyCommand(0, { type: 'play', card: card('red', 5), to: 'expedition' });
        game.applyCommand(0, { type: 'draw', from: 'deck' });
        const theirs = createGameView(game, 1);
        expect(theirs.players[0].hand).toBe(null);
        expect(theirs.players[0].handCount).toBe(1);
        expect(theirs.events.find(e => e.type === 'draw').card).toBe(null);
        expect(createGameView(game, 0).events.find(e => e.type === 'draw').card).toBe(game.players[0].hand[0]);
        expect(theirs.players[0].expeditions.red).toEqual([card('red', 5)]);
        expect(theirs.players[0].scores.red).toBe(-15);
        expect(theirs.discards.green).toEqual([card('green', 2)]);
        expect('deck' in theirs).toBe(false);
        expect(theirs.events.find(e => e.type === 'deal').hands).toBeUndefined();
        expect(JSON.parse(JSON.stringify(theirs))).toEqual(theirs);
    });
});
