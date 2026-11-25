import { describe, it, expect } from 'vitest';
import Game, { GOODS, CAMEL, CARD_COUNTS, GOODS_TOKENS, BONUS_TOKENS } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { players, makeGame, setup, snapshot } from './helpers.js';

const D = 'diamond', G = 'gold', S = 'silver', C = 'cloth', P = 'spice', L = 'leather', K = CAMEL;
const allCards = (game) => [...game.deck, ...game.market, ...game.players.flatMap(p => [...p.hand, ...Array(p.herd).fill(K)])];

describe('カードとトークン', () => {
    it('カードは55枚（ダイヤ6・金6・銀6・布8・香辛料8・革10・ラクダ11）', () => {
        expect(Object.values(CARD_COUNTS).reduce((s, n) => s + n, 0)).toBe(55);
        const game = makeGame();
        const cards = allCards(game);
        expect(cards).toHaveLength(55);
        Object.entries(CARD_COUNTS).forEach(([type, n]) => expect(cards.filter(c => c === type)).toHaveLength(n));
    });

    it('商品トークンは高い順に並び、ボーナストークンは3枚7・4枚6・5枚5', () => {
        expect(GOODS_TOKENS.diamond).toEqual([7, 7, 5, 5, 5]);
        expect(GOODS_TOKENS.leather).toEqual([4, 3, 2, 1, 1, 1, 1, 1, 1]);
        GOODS.forEach(g => expect([...GOODS_TOKENS[g]].sort((a, b) => b - a)).toEqual(GOODS_TOKENS[g]));
        expect(BONUS_TOKENS[3]).toHaveLength(7);
        expect(BONUS_TOKENS[4]).toHaveLength(6);
        expect(BONUS_TOKENS[5]).toHaveLength(5);
    });
});

describe('準備', () => {
    it('市場はラクダ3枚を含む5枚。各自に5枚配り、ラクダは群れに出す', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = makeGame(seed);
            expect(game.market).toHaveLength(5);
            expect(game.market.slice(0, 3)).toEqual([K, K, K]);
            game.players.forEach(p => {
                expect(p.hand.length + p.herd).toBe(5);
                expect(p.hand).not.toContain(K);
            });
            expect(game.deck).toHaveLength(55 - 5 - 10);
        }
    });

    it('2人でしか遊べない。同じシードなら同じ配り方', () => {
        expect(() => new Game([{ name: 'A' }])).toThrow();
        expect(snapshot(makeGame(9))).toBe(snapshot(makeGame(9)));
    });
});

describe('取る', () => {
    it('市場の商品を1枚取り、空きを山札から補充する', () => {
        const game = makeGame();
        setup(game, { hands: [[C]], market: [K, D, G, S, L], deck: [P, P, P] });
        expect(game.applyCommand(0, { type: 'take', index: 1 })).toBe(true);
        expect(game.players[0].hand).toEqual([D, C]);
        expect(game.market).toEqual([K, P, G, S, L]);
        expect(game.current).toBe(1);
    });

    it('ラクダは1枚だけでは取れない。手札が7枚なら取れない', () => {
        const game = makeGame();
        setup(game, { hands: [[C, C, C, P, P, L, L]], market: [K, D, G, S, L], deck: [P, P, P] });
        expect(game.applyCommand(0, { type: 'take', index: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'take', index: 1 })).toBe(false);
        expect(game.lastError).toMatch(/7枚/);
    });

    it('市場のラクダを全部取って群れに入れる（手札の枚数に数えない）', () => {
        const game = makeGame();
        setup(game, { hands: [[C, C, C, P, P, L, L]], herds: [1, 0], market: [K, D, K, S, K], deck: [P, G, L] });
        expect(game.applyCommand(0, { type: 'camels' })).toBe(true);
        expect(game.players[0].herd).toBe(4);
        expect(game.market).toEqual([P, D, G, S, L]);
        setup(game, { current: 1 });
        expect(game.applyCommand(1, { type: 'camels' })).toBe(false);
    });

    it('2枚以上を取り、手札やラクダで同じ枚数を返す', () => {
        const game = makeGame();
        setup(game, { hands: [[C, L]], herds: [2, 0], market: [K, D, G, S, P], deck: [P] });
        expect(game.applyCommand(0, { type: 'exchange', take: [1, 2, 3], give: { cloth: 1, camel: 2 } })).toBe(true);
        expect(game.players[0].hand).toEqual([D, G, S, L]);
        expect(game.players[0].herd).toBe(0);
        expect(game.market.filter(c => c === K)).toHaveLength(3);
        expect(game.market).toContain(C);
        expect(game.deck).toEqual([P]); // 交換では山札から引かない
    });

    it('交換の決まり：2枚以上、同じ枚数、ラクダは取れない、取った種類は返せない、7枚まで', () => {
        const game = makeGame();
        setup(game, { hands: [[D, C, C, L, L, P]], herds: [3, 0], market: [K, D, G, C, P], deck: [P] });
        const bad = [
            { take: [1], give: { cloth: 1 } },                 // 1枚だけ
            { take: [1, 2], give: { cloth: 1 } },              // 枚数が合わない
            { take: [0, 1], give: { cloth: 2 } },              // ラクダは取れない
            { take: [1, 2], give: { diamond: 1, cloth: 1 } },  // ダイヤを取ってダイヤを返す
            { take: [3, 4], give: { cloth: 1, leather: 1 } },  // 布を取って布を返す
            { take: [1, 2], give: { silver: 2 } },             // 持っていない
            { take: [1, 2], give: { camel: 4 } },              // ラクダが足りない
            { take: [1, 2, 4], give: { camel: 3 } },           // 手札が 6 + 3 = 9 枚になる
            { take: [1, 1], give: { camel: 2 } },              // 同じ場所を2回
            { take: [1, 9], give: { camel: 2 } }
        ];
        bad.forEach(command => expect(game.applyCommand(0, { type: 'exchange', ...command }), JSON.stringify(command)).toBe(false));
        expect(game.applyCommand(0, { type: 'exchange', take: [1, 2], give: { camel: 1, leather: 1 } })).toBe(true);
        expect(game.players[0].hand).toHaveLength(7);
    });
});

describe('売る', () => {
    it('1種類を好きな枚数売り、商品トークンを上から枚数分もらう', () => {
        const game = makeGame();
        setup(game, { hands: [[C, C, L]] });
        expect(game.applyCommand(0, { type: 'sell', good: C, count: 2 })).toBe(true);
        expect(game.players[0].tokens.map(t => t.value)).toEqual([5, 3]);
        expect(game.goodsTokens.cloth).toEqual([3, 2, 2, 1, 1]);
        expect(game.players[0].hand).toEqual([L]);
    });

    it('ダイヤ・金・銀は2枚以上でないと売れない。革は1枚でも売れる', () => {
        const game = makeGame();
        setup(game, { hands: [[D, G, S, L]] });
        [D, G, S].forEach(good => expect(game.applyCommand(0, { type: 'sell', good, count: 1 })).toBe(false));
        expect(game.applyCommand(0, { type: 'sell', good: L, count: 1 })).toBe(true);
    });

    it('持っている枚数より多くは売れない。ラクダは売れない', () => {
        const game = makeGame();
        setup(game, { hands: [[C, C]], herds: [3, 0] });
        expect(game.applyCommand(0, { type: 'sell', good: C, count: 3 })).toBe(false);
        expect(game.applyCommand(0, { type: 'sell', good: K, count: 2 })).toBe(false);
        expect(game.applyCommand(0, { type: 'sell', good: C, count: 0 })).toBe(false);
    });

    it.each([[3, 3], [4, 4], [5, 5], [6, 5]])('%i枚売ると、%i枚売りのボーナストークンをもらう', (count, size) => {
        const game = makeGame();
        setup(game, { hands: [Array(count).fill(L)] });
        game.applyCommand(0, { type: 'sell', good: L, count });
        expect(game.players[0].bonus).toHaveLength(1);
        expect(game.players[0].bonus[0].size).toBe(size);
        expect(BONUS_TOKENS[size]).toContain(game.players[0].bonus[0].value);
        expect(game.bonusTokens[size]).toHaveLength(BONUS_TOKENS[size].length - 1);
    });

    it('商品トークンがなくなっていたら、その分はもらえない', () => {
        const game = makeGame();
        setup(game, { hands: [[D, D, D]] });
        game.goodsTokens.diamond = [5];
        game.applyCommand(0, { type: 'sell', good: D, count: 3 });
        expect(game.players[0].tokens.map(t => t.value)).toEqual([5]);
        expect(game.players[0].bonus).toHaveLength(1); // ボーナスはもらえる
    });
});

describe('ラウンドの終わり', () => {
    it('商品トークンの山が3つなくなったら終わり、ラクダの多い人に5点', () => {
        const game = makeGame();
        setup(game, { hands: [[L, L], [C]], herds: [4, 2] });
        game.goodsTokens.diamond = [];
        game.goodsTokens.gold = [];
        game.goodsTokens.leather = [1];
        game.players[1].tokens = [{ good: 'silver', value: 5 }];
        game.applyCommand(0, { type: 'sell', good: L, count: 2 });
        expect(game.round).toBe(2);
        const result = game.history[0];
        expect(result.results[0].camelToken).toBe(true);
        expect(result.results[0].score).toBe(1 + 5);
        expect(result.results[1].score).toBe(5);
        expect(result.winner).toBe(0);
        expect(game.players[0].seals).toBe(1);
        expect(game.current).toBe(1); // 負けた人から
    });

    it('ラクダが同数なら、だれもラクダのトークンをもらわない', () => {
        const game = makeGame();
        setup(game, { hands: [[L], []], herds: [3, 3] });
        Object.assign(game.goodsTokens, { diamond: [], gold: [], leather: [1] });
        game.applyCommand(0, { type: 'sell', good: L, count: 1 });
        expect(game.history[0].results.every(r => !r.camelToken)).toBe(true);
    });

    it('市場を補充できなくなったら終わる', () => {
        const game = makeGame();
        setup(game, { hands: [[]], market: [K, D, G, S, L], deck: [] });
        game.applyCommand(0, { type: 'take', index: 1 });
        expect(game.round).toBe(2);
        expect(game.events.find(e => e.type === 'roundEnd').reason).toBe('deck');
    });

    it('同点なら、ボーナストークンの多い人、それも同じなら商品トークンの多い人が勝ち', () => {
        const end = (a, b) => {
            const game = makeGame();
            setup(game, { hands: [[L], []], herds: [0, 0] });
            Object.assign(game.goodsTokens, { diamond: [], gold: [], leather: [0] });
            game.players[0].tokens = a.tokens;
            game.players[0].bonus = a.bonus;
            game.players[1].tokens = b.tokens;
            game.players[1].bonus = b.bonus;
            game.applyCommand(0, { type: 'sell', good: L, count: 1 }); // 0点のトークンを1枚もらう
            return game.history[0].winner;
        };
        const t = (...values) => values.map(value => ({ good: 'cloth', value }));
        const b = (...values) => values.map(value => ({ size: 3, value }));
        // 席0は売った分の0点のトークンが1枚増える
        expect(end({ tokens: t(5), bonus: b(2) }, { tokens: t(7), bonus: [] })).toBe(0);       // 7 対 7、ボーナス 1 対 0
        expect(end({ tokens: t(7), bonus: [] }, { tokens: t(4, 2, 1), bonus: [] })).toBe(1);   // 7 対 7、ボーナス 0 対 0、商品 2 対 3
        expect(end({ tokens: t(7), bonus: [] }, { tokens: t(5, 2), bonus: [] })).toBe(null);  // 全部同じなら引き分け
    });

    it('引き分けのラウンドは印をだれにも渡さず、2番手から次のラウンドを始める', () => {
        const game = makeGame();
        const starter = game.starter;
        setup(game, { hands: starter === 0 ? [[L], []] : [[], [L]], herds: [0, 0], current: starter });
        Object.assign(game.goodsTokens, { diamond: [], gold: [], leather: [0] });
        game.players[1 - starter].tokens = [{ good: 'leather', value: 0 }];
        game.applyCommand(starter, { type: 'sell', good: L, count: 1 });
        expect(game.history[0].winner).toBe(null);
        expect(game.players.map(p => p.seals)).toEqual([0, 0]);
        expect(game.current).toBe(1 - starter);
    });

    it('2ラウンド先取で終わる', () => {
        const game = makeGame();
        game.players[0].seals = 1;
        setup(game, { hands: [[L], []], herds: [5, 0] });
        Object.assign(game.goodsTokens, { diamond: [], gold: [], leather: [1] });
        game.applyCommand(0, { type: 'sell', good: L, count: 1 });
        expect(game.phase).toBe('end');
        expect(game.winner).toBe(0);
        expect(game.applyCommand(1, { type: 'camels' })).toBe(false);
    });
});

describe('記録と再現', () => {
    it('断った操作では、状態が少しも変わらない', () => {
        const game = makeGame(4);
        setup(game, { hands: [[D, C, C, L, L, P]], herds: [2, 0], market: [K, D, G, C, P] });
        const before = snapshot(game);
        [
            { type: 'take', index: 0 }, { type: 'take', index: 7 }, { type: 'exchange', take: [1, 2], give: { diamond: 2 } },
            { type: 'exchange', take: [1, 2], give: [] }, { type: 'sell', good: D, count: 1 }, { type: 'sell', good: 'x', count: 1 },
            { type: 'nope' }, null
        ].forEach(command => {
            expect(game.applyCommand(0, command)).toBe(false);
            expect(snapshot(game)).toBe(before);
        });
        expect(game.applyCommand(1, { type: 'camels' })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('記録から同じ状態を作り直せる。余計な項目は記録しない', () => {
        const game = makeGame(6);
        game.applyCommand(game.current, { type: 'camels', junk: 1 });
        expect(game.commands[0].command).toEqual({ type: 'camels' });
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });
});

describe('ビュー', () => {
    it('相手の手札と、相手のボーナスの値は見せない。山札は枚数だけ', () => {
        const game = makeGame(3);
        setup(game, { hands: [[L, L, L], [C]] });
        game.applyCommand(0, { type: 'sell', good: L, count: 3 });
        const theirs = createGameView(game, 1);
        expect(theirs.players[0].hand).toBe(null);
        expect(theirs.players[0].bonus).toEqual([{ size: 3, value: null }]);
        expect(theirs.events.find(e => e.type === 'sell').bonus.value).toBe(null);
        expect(theirs.players[1].hand).toEqual([C]);
        const mine = createGameView(game, 0);
        expect(mine.players[0].bonus[0].value).toBeGreaterThan(0);
        expect(JSON.stringify(theirs)).not.toContain('"deck"');
        expect(theirs.deckCount).toBe(game.deck.length);
        const deal = theirs.events.find(e => e.type === 'deal');
        expect(deal.hands).toBeUndefined();
        expect(JSON.parse(JSON.stringify(theirs))).toEqual(theirs);
    });
});
