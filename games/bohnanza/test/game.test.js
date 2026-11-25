import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { BEANS, BEAN_TYPES, coinsFor, nextStep, setupFor, legalFieldsFor, canHarvestField } from '../public/js/cards.js';
import { newGame, players, run, totalCards, snapshot } from './helpers.js';

const f = (type, n) => ({ type, n });

describe('カードと売値の表', () => {
    it('11種類・154枚（24・22・20・18・16・14・12・10・8・6・4）', () => {
        expect(BEAN_TYPES.length).toBe(11);
        expect(BEAN_TYPES.map(t => BEANS[t].count)).toEqual([24, 22, 20, 18, 16, 14, 12, 10, 8, 6, 4]);
        expect(BEAN_TYPES.reduce((s, t) => s + BEANS[t].count, 0)).toBe(154);
    });

    it('売値の表（ルールブックの例：くさい豆 1〜2枚0金・3〜4枚1金・5〜6枚2金・7枚3金・8枚以上4金）', () => {
        expect([1, 2, 3, 4, 5, 6, 7, 8, 12].map(n => coinsFor('stink', n))).toEqual([0, 0, 1, 1, 2, 2, 3, 4, 4]);
        expect([3, 4, 7, 10, 12].map(n => coinsFor('coffee', n))).toEqual([0, 1, 2, 3, 4]);
        expect([1, 2, 3, 4].map(n => coinsFor('garden', n))).toEqual([0, 2, 3, 3]);
        expect([1, 2, 3, 4].map(n => coinsFor('cocoa', n))).toEqual([0, 2, 3, 4]);
        expect([2, 3, 4, 5].map(n => coinsFor('red', n))).toEqual([1, 2, 3, 4]);
        expect(nextStep('stink', 4)).toBe(1);
        expect(nextStep('stink', 8)).toBe(null);
        expect(nextStep('garden', 3)).toBe(null);
    });

    it('人数ごと：3人はカカオなし・最初から畑3つ・山2回で終わり。4〜5人はコーヒーなし・山3回', () => {
        expect(setupFor(3)).toMatchObject({ thirdField: true, canBuyField: false, exhaustLimit: 2 });
        expect(setupFor(3).types).not.toContain('cocoa');
        expect(setupFor(4).types).not.toContain('coffee');
        expect(setupFor(5)).toMatchObject({ thirdField: false, canBuyField: true, exhaustLimit: 3 });
        const g3 = new Game(players(3), { seed: 2 });
        expect(totalCards(g3)).toBe(150);
        expect(g3.players.every(p => p.fields.length === 3)).toBe(true);
        const g5 = new Game(players(5), { seed: 2 });
        expect(totalCards(g5)).toBe(130);
        expect(g5.players.every(p => p.fields.length === 2)).toBe(true);
        expect(() => new Game(players(2))).toThrow();
        expect(() => new Game(players(6))).toThrow();
    });

    it('最初に手札5枚ずつ', () => {
        const game = new Game(players(4), { seed: 3 });
        expect(game.players.map(p => p.hand.length)).toEqual([5, 5, 5, 5]);
    });
});

describe('植える・売る', () => {
    it('同じ種類の畑があればそこだけ、なければ空いた畑', () => {
        expect(legalFieldsFor([f('red', 2), null], 'red')).toEqual([0]);
        expect(legalFieldsFor([f('red', 2), null], 'soy')).toEqual([1]);
        expect(legalFieldsFor([f('red', 2), f('soy', 1)], 'blue')).toEqual([]);
    });

    it('1枚だけの畑は、ほかに2枚以上の畑があれば売れない', () => {
        expect(canHarvestField([f('red', 1), f('soy', 3)], 0)).toBe(false);
        expect(canHarvestField([f('red', 1), f('soy', 3)], 1)).toBe(true);
        expect(canHarvestField([f('red', 1), f('soy', 1)], 0)).toBe(true);
        expect(canHarvestField([f('red', 1), null], 0)).toBe(true);
    });

    it('手札の一番前を植え、2枚目は植えても植えなくてもよい。3枚目は植えられない', () => {
        const game = newGame(4, { hands: [['red', 'red', 'red', 'soy']], fields: [[null, null]], deck: ['blue', 'wax', 'green', 'chili', 'stink'] });
        expect(game.applyCommand(0, { type: 'next' })).toBe(false);
        run(game, [[0, { type: 'plant', field: 1 }]]);
        expect(game.applyCommand(0, { type: 'plant', field: 0 })).toBe(false);
        run(game, [[0, { type: 'plant', field: 1 }]]);
        expect(game.players[0].fields[1]).toEqual(f('red', 2));
        // 2枚植えたら、表に2枚
        expect(game.phase).toBe('trade');
        expect(game.faceUp).toEqual(['blue', 'wax']);
        expect(game.players[0].hand).toEqual(['red', 'soy']);
    });

    it('植える畑がなければ、先に売る。売ると金と捨て札になる', () => {
        const game = newGame(4, { hands: [['blue']], fields: [[f('chili', 4), f('soy', 2)]] });
        expect(game.applyCommand(0, { type: 'plant', field: 0 })).toBe(false);
        run(game, [[0, { type: 'harvest', field: 0 }]]);
        expect(game.players[0].coins).toEqual(['chili']);
        expect(game.discard).toEqual(['chili', 'chili', 'chili']);
        run(game, [[0, { type: 'plant', field: 0 }]]);
        expect(game.players[0].fields[0]).toEqual(f('blue', 1));
    });

    it('売るのと畑を買うのは、手番でなくてもできる。4人の3つ目の畑は3金（金は捨て札に戻る）', () => {
        const game = newGame(4, { fields: [[null, null], [f('red', 5), null]] });
        run(game, [[1, { type: 'harvest', field: 0 }]]);
        expect(game.players[1].coins.length).toBe(4);
        run(game, [[1, { type: 'buyField' }]]);
        expect(game.players[1].fields.length).toBe(3);
        expect(game.players[1].coins.length).toBe(1);
        expect(game.discard.length).toBe(1 + 3);
        expect(game.applyCommand(1, { type: 'buyField' })).toBe(false);
        expect(game.applyCommand(2, { type: 'buyField' })).toBe(false);
        expect(new Game(players(3), { seed: 1 }).applyCommand(0, { type: 'buyField' })).toBe(false);
    });
});

describe('取引', () => {
    // 席0の手番で、表に blue・wax を出したところ
    function trading() {
        const game = newGame(4, {
            hands: [['red', 'soy', 'green'], ['chili', 'stink', 'chili'], ['soy', 'red'], ['wax']],
            fields: [[f('red', 1), null], [f('blue', 2), null], [null, null], [null, null]],
            deck: ['blue', 'wax', 'green', 'chili', 'stink', 'soy', 'red', 'garden']
        });
        run(game, [[0, { type: 'plant', field: 0 }], [0, { type: 'next' }]]);
        return game;
    }

    it('手番の人は表と手札を出せる。受けた人は、もらった豆を取っておく', () => {
        const game = trading();
        expect(game.faceUp).toEqual(['blue', 'wax']);
        expect(game.actors()).toEqual([0, 1, 2, 3]);
        run(game, [[0, { type: 'offer', to: 1, give: { faceUp: [0], hand: [1] }, want: { types: { chili: 1 } } }]]);
        expect(game.actors()).toEqual([1]);
        // 求められた種類と合わない
        expect(game.applyCommand(1, { type: 'respond', accept: true, hand: [1] })).toBe(false);
        run(game, [[1, { type: 'respond', accept: true, hand: [2] }]]);
        expect(game.players[1].toPlant).toEqual(['blue', 'green']);
        expect(game.players[1].hand).toEqual(['chili', 'stink']);
        expect(game.players[0].toPlant).toEqual(['chili']);
        expect(game.players[0].hand).toEqual(['soy']);
        expect(game.faceUp).toEqual(['wax']);
    });

    it('手番でない人は、手番の人とだけ取引でき、表のカードを求められる。断ってもよい', () => {
        const game = trading();
        expect(game.applyCommand(2, { type: 'offer', to: 3, give: { hand: [0] }, want: {} })).toBe(false);
        expect(game.applyCommand(2, { type: 'offer', to: 0, give: { faceUp: [0] }, want: {} })).toBe(false);
        run(game, [[2, { type: 'offer', to: 0, give: { hand: [0] }, want: { faceUp: [1] } }]]);
        run(game, [[0, { type: 'respond', accept: false }]]);
        expect(game.offer).toBe(null);
        expect(game.turnOffers.at(-1)).toMatchObject({ from: 2, to: 0, give: ['soy'], want: ['wax'], accepted: false });
        run(game, [[2, { type: 'offer', to: 0, give: { hand: [0] }, want: { faceUp: [1] } }], [0, { type: 'respond', accept: true, hand: [] }]]);
        expect(game.players[2].toPlant).toEqual(['wax']);
        expect(game.players[0].toPlant).toEqual(['soy']);
    });

    it('あげるだけ（贈与）もできる。取引しないと言った人は、もう提案できない', () => {
        const game = trading();
        run(game, [[0, { type: 'offer', to: 3, give: { faceUp: [1] }, want: {} }], [3, { type: 'respond', accept: true, hand: [] }]]);
        expect(game.players[3].toPlant).toEqual(['wax']);
        run(game, [[3, { type: 'pass' }]]);
        expect(game.applyCommand(3, { type: 'offer', to: 0, give: { hand: [0] }, want: {} })).toBe(false);
        expect(game.actors()).toEqual([0, 1, 2]);
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false);
    });

    it('取引を終えると、残った表の豆は手番の人が植える。全員が植えたら手番の人が3枚を手札の後ろへ', () => {
        const game = trading();
        run(game, [[0, { type: 'offer', to: 1, give: { faceUp: [0] }, want: {} }], [1, { type: 'respond', accept: true, hand: [] }], [0, { type: 'endTrade' }]]);
        expect(game.phase).toBe('plantTraded');
        expect(game.players[0].toPlant).toEqual(['wax']);
        expect(game.actors()).toEqual([0, 1]);
        expect(game.applyCommand(1, { type: 'plantPending', index: 0, field: 1 })).toBe(false);
        run(game, [[1, { type: 'plantPending', index: 0, field: 0 }]]);
        expect(game.players[1].fields[0]).toEqual(f('blue', 3));
        run(game, [[0, { type: 'plantPending', index: 0, field: 1 }]]);
        expect(game.players[0].hand).toEqual(['soy', 'green', 'green', 'chili', 'stink']);
        expect(game.active).toBe(1);
        expect(game.phase).toBe('plant');
    });

    it('1人が1つの手番に出せる提案は8件まで', () => {
        const game = trading();
        for (let k = 0; k < 8; k++) run(game, [[0, { type: 'offer', to: 2, give: { hand: [0] }, want: {} }], [2, { type: 'respond', accept: false }]]);
        expect(game.applyCommand(0, { type: 'offer', to: 2, give: { hand: [0] }, want: {} })).toBe(false);
    });

    it('通らない提案は状態を変えない', () => {
        const game = trading();
        const before = snapshot(game);
        [{ type: 'offer', to: 0, give: { hand: [0] } }, { type: 'offer', to: 1 }, { type: 'offer', to: 1, give: { hand: [9] } },
            { type: 'offer', to: 1, give: { hand: [0, 0] } }, { type: 'offer', to: 1, want: { types: { moon: 1 } } },
            { type: 'offer', to: 1, give: { faceUp: [5] } }, { type: 'respond', accept: true }, { type: 'plantPending', index: 0, field: 0 }, null]
            .forEach(c => expect(game.applyCommand(0, c)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });
});

describe('終わり', () => {
    it('山が決まった回数なくなったら終わり。表の2枚の途中なら、その手番の植えるまで続く', () => {
        const game = newGame(4, { hands: [['red']], fields: [[null, null]], deck: ['blue'] });
        game.exhausted = 2;
        game.discard = [];
        // 手札がなくなったら、そのまま表を引く
        run(game, [[0, { type: 'plant', field: 0 }]]);
        expect(game.faceUp).toEqual(['blue']);
        expect(game.endAfterTurn).toBe(true);
        run(game, [[0, { type: 'endTrade' }], [0, { type: 'plantPending', index: 0, field: 1 }]]);
        expect(game.isOver()).toBe(true);
    });

    it('3枚引く途中でなくなれば、すぐに終わり。畑は売り、金の多い人の勝ち。同点なら手札の多い人', () => {
        const game = newGame(4, {
            hands: [['red', 'soy'], ['soy', 'soy', 'soy'], ['red'], []],
            fields: [[null, null], [f('chili', 3), null], [f('chili', 3), null], [null, null]],
            deck: ['soy', 'soy', 'green']
        });
        game.exhausted = 2;
        run(game, [[0, { type: 'plant', field: 0 }], [0, { type: 'next' }], [0, { type: 'endTrade' }],
            [0, { type: 'plantPending', index: 0, field: 1 }], [0, { type: 'plantPending', index: 0, field: 1 }]]);
        // 金は3人が1ずつ。手札は席0が2枚・席1が3枚・席2が1枚
        expect(game.players[0].coins.length).toBe(1);
        expect(game.players[0].hand.length).toBe(2);
        expect(game.isOver()).toBe(true);
        expect(game.players[1].coins.length).toBe(1);
        expect(game.players[2].coins.length).toBe(1);
        expect(game.winners).toEqual([1]);
        expect(game.applyCommand(1, { type: 'harvest', field: 0 })).toBe(false);
    });

    it('山がなくなったら捨て札を切り直す', () => {
        const game = newGame(4, { hands: [['red']], fields: [[null, null]], deck: [] });
        game.discard = ['soy', 'soy', 'blue'];
        run(game, [[0, { type: 'plant', field: 0 }]]);
        expect(game.exhausted).toBe(1);
        expect(game.faceUp.length).toBe(2);
        expect(game.deck.length).toBe(1);
    });
});
