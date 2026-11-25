import { describe, it, expect } from 'vitest';
import Game, { CARDS, NOBLES, COLORS, GOLD, countTokens, pointsOf } from '../public/js/game.js';
import { players, makeGame, tokens, findCard, giveBonuses, placeOnBoard, snapshot } from './helpers.js';

describe('カードと貴族のデータ', () => {
    it('カードは90枚（レベル1：40・2：30・3：20）で、各レベルの色ごとの枚数がそろっている', () => {
        expect(CARDS).toHaveLength(90);
        const perLevel = { 1: 8, 2: 6, 3: 4 };
        [1, 2, 3].forEach(level => {
            COLORS.forEach(color => {
                expect(CARDS.filter(c => c.level === level && c.bonus === color)).toHaveLength(perLevel[level]);
            });
        });
    });

    it('同じレベルの色ごとのカードは、色を入れ替えた同じ組み合わせになっている', () => {
        const signature = (card) => `${card.points}:${COLORS.map(c => card.cost[c]).sort().join('')}`;
        [1, 2, 3].forEach(level => {
            const sets = COLORS.map(color => CARDS.filter(c => c.level === level && c.bonus === color).map(signature).sort().join('|'));
            expect(new Set(sets).size).toBe(1);
        });
    });

    it('点数の合計と、よく知られたカード', () => {
        expect(CARDS.filter(c => c.level === 1).reduce((s, c) => s + c.points, 0)).toBe(5);
        expect(CARDS.filter(c => c.level === 3 && c.points === 5)).toHaveLength(5);
        const blue3 = CARDS.find(c => c.level === 3 && c.bonus === 'blue' && c.points === 3);
        expect(blue3.cost).toEqual({ white: 3, blue: 0, green: 3, red: 3, black: 5 });
    });

    it('貴族は10枚、どれも3点で、条件は4・4か3・3・3', () => {
        expect(NOBLES).toHaveLength(10);
        NOBLES.forEach(noble => {
            expect(noble.points).toBe(3);
            const req = COLORS.map(c => noble.req[c]).filter(n => n > 0).sort().join('');
            expect(['44', '333']).toContain(req);
        });
    });
});

describe('準備', () => {
    it.each([[2, 4, 3], [3, 5, 4], [4, 7, 5]])('%i人：宝石は各色%i個、黄金5個、貴族%i枚', (n, gems, nobles) => {
        const game = makeGame(n);
        COLORS.forEach(c => expect(game.bank[c]).toBe(gems));
        expect(game.bank[GOLD]).toBe(5);
        expect(game.nobles).toHaveLength(nobles);
        expect(new Set(game.nobles).size).toBe(nobles);
    });

    it('各レベル4枚ずつ表向きに並び、残りが山札になる', () => {
        const game = makeGame(3);
        expect(game.board[1]).toHaveLength(4);
        expect(game.decks[1]).toHaveLength(36);
        expect(game.decks[2]).toHaveLength(26);
        expect(game.decks[3]).toHaveLength(16);
        game.board[2].forEach(id => expect(CARDS[id].level).toBe(2));
    });

    it('人数は2〜4人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(5))).toThrow();
    });

    it('同じシードなら同じ並び、違うシードなら違う並び', () => {
        const a = new Game(players(3), { seed: 42 });
        const b = new Game(players(3), { seed: 42 });
        const c = new Game(players(3), { seed: 43 });
        expect(snapshot(a)).toBe(snapshot(b));
        expect(a.startPlayer).toBe(b.startPlayer);
        expect(JSON.stringify(a.decks)).not.toBe(JSON.stringify(c.decks));
    });

    it('最初の手番の人は、シードで決まる', () => {
        const starts = new Set(Array.from({ length: 40 }, (_, seed) => new Game(players(4), { seed }).startPlayer));
        expect(starts.size).toBe(4);
    });
});

describe('宝石を取る', () => {
    it('違う色を3個取れる', () => {
        const game = makeGame();
        expect(game.applyCommand(0, { type: 'take', tokens: { white: 1, blue: 1, green: 1 } })).toBe(true);
        expect(game.players[0].tokens).toEqual(tokens({ white: 1, blue: 1, green: 1 }));
        expect(game.bank.white).toBe(3);
        expect(game.current).toBe(1);
    });

    it('3色残っているのに、違う色を2個だけは取れない', () => {
        const game = makeGame();
        expect(game.applyCommand(0, { type: 'take', tokens: { white: 1, blue: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'take', tokens: { white: 1 } })).toBe(false);
    });

    it('同じ色を2個取れるのは、取る前に4個以上残っているときだけ', () => {
        const game = makeGame(2); // 各色4個
        expect(game.applyCommand(0, { type: 'take', tokens: { red: 2 } })).toBe(true);
        expect(game.bank.red).toBe(2);
        game.bank.blue = 3;
        expect(game.applyCommand(1, { type: 'take', tokens: { blue: 2 } })).toBe(false);
        expect(game.applyCommand(1, { type: 'take', tokens: { red: 2 } })).toBe(false);
        expect(game.lastError).toMatch(/4個以上/);
    });

    it('黄金は取れない。4個以上・色の重複・残っていない色も取れない', () => {
        const game = makeGame();
        expect(game.applyCommand(0, { type: 'take', tokens: { gold: 1, white: 1, blue: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'take', tokens: { white: 1, blue: 1, green: 1, red: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'take', tokens: { white: 2, blue: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'take', tokens: { red: 3 } })).toBe(false);
        game.bank.white = 0;
        expect(game.applyCommand(0, { type: 'take', tokens: { white: 1, blue: 1, green: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'take', tokens: {} })).toBe(false);
        expect(game.applyCommand(0, { type: 'take', tokens: { white: -1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'take', tokens: { white: 1.5 } })).toBe(false);
    });

    it('残っている色が3色に満たないときは、残りの色を1個ずつ取れる', () => {
        const game = makeGame();
        game.bank = tokens({ white: 2, blue: 1, gold: 5 });
        expect(game.applyCommand(0, { type: 'take', tokens: { white: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'take', tokens: { white: 1, blue: 1 } })).toBe(true);
    });

    it('手番でない人は操作できない', () => {
        const game = makeGame();
        expect(game.applyCommand(1, { type: 'take', tokens: { white: 1, blue: 1, green: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'unknown' })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
    });
});

describe('予約する', () => {
    it('場のカードを予約すると黄金を1個もらい、場は山札から補充される', () => {
        const game = makeGame();
        const card = game.board[2][1];
        const top = game.decks[2][0];
        expect(game.applyCommand(0, { type: 'reserve', card })).toBe(true);
        expect(game.players[0].reserved).toEqual([{ id: card, hidden: false }]);
        expect(game.players[0].tokens.gold).toBe(1);
        expect(game.bank.gold).toBe(4);
        expect(game.board[2][1]).toBe(top);
        expect(game.decks[2]).toHaveLength(25);
    });

    it('山札の一番上を伏せたまま予約できる', () => {
        const game = makeGame();
        const top = game.decks[3][0];
        expect(game.applyCommand(0, { type: 'reserve', level: 3 })).toBe(true);
        expect(game.players[0].reserved).toEqual([{ id: top, hidden: true }]);
        expect(game.decks[3]).toHaveLength(15);
    });

    it('予約は3枚まで', () => {
        const game = makeGame();
        game.players[0].reserved = [0, 1, 2].map(id => ({ id: game.decks[1].pop(), hidden: false }));
        expect(game.applyCommand(0, { type: 'reserve', level: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'reserve', card: game.board[1][0] })).toBe(false);
    });

    it('黄金がなくても予約はできる（黄金はもらえない）', () => {
        const game = makeGame();
        game.bank.gold = 0;
        expect(game.applyCommand(0, { type: 'reserve', level: 1 })).toBe(true);
        expect(game.players[0].tokens.gold).toBe(0);
    });

    it('なくなった山札からは予約できず、山札がなければ場は空いたまま', () => {
        const game = makeGame();
        game.decks[1] = [];
        expect(game.applyCommand(0, { type: 'reserve', level: 1 })).toBe(false);
        const card = game.board[1][2];
        expect(game.applyCommand(0, { type: 'reserve', card })).toBe(true);
        expect(game.board[1][2]).toBe(null);
        expect(game.applyCommand(1, { type: 'reserve', card: 9999 })).toBe(false);
        expect(game.applyCommand(1, { type: 'reserve', level: 4 })).toBe(false);
    });
});

describe('買う', () => {
    it('ボーナスの分だけ安くなり、払った宝石は場に戻る', () => {
        const game = makeGame();
        const card = findCard(c => c.level === 1 && c.bonus === 'black' && c.cost.green === 3); // 緑3
        placeOnBoard(game, 1, 0, card);
        const p = game.players[0];
        giveBonuses(p, { green: 1 });
        p.tokens = tokens({ green: 2 });
        game.bank.green -= 2;
        expect(game.applyCommand(0, { type: 'buy', card })).toBe(true);
        expect(p.cards).toContain(card);
        expect(p.tokens.green).toBe(0);
        expect(game.bank.green).toBe(4);
        expect(game.board[1][0]).not.toBe(card);
        expect(game.board[1][0]).not.toBe(null);
    });

    it('足りない分は黄金で払える。黄金も足りなければ買えない', () => {
        const game = makeGame();
        const card = findCard(c => c.level === 1 && c.bonus === 'blue' && c.cost.red === 4); // 赤4
        placeOnBoard(game, 1, 0, card);
        const p = game.players[0];
        p.tokens = tokens({ red: 2, gold: 1 });
        expect(game.applyCommand(0, { type: 'buy', card })).toBe(false);
        expect(game.lastError).toMatch(/足りません/);
        p.tokens.gold = 2;
        expect(game.applyCommand(0, { type: 'buy', card })).toBe(true);
        expect(p.tokens).toEqual(tokens());
        expect(pointsOf(p)).toBe(1);
    });

    it('予約したカードを買える', () => {
        const game = makeGame();
        const card = findCard(c => c.level === 1 && c.bonus === 'red' && c.cost.white === 3);
        placeOnBoard(game, 1, 0, null);
        game.players[0].reserved = [{ id: card, hidden: true }];
        game.players[0].tokens = tokens({ white: 3 });
        expect(game.applyCommand(0, { type: 'buy', card })).toBe(true);
        expect(game.players[0].reserved).toEqual([]);
    });

    it('ほかの人が予約したカードや、場にないカードは買えない', () => {
        const game = makeGame();
        const card = game.decks[1][5];
        game.players[1].reserved = [{ id: card, hidden: false }];
        game.players[0].tokens = tokens({ gold: 5 });
        expect(game.applyCommand(0, { type: 'buy', card })).toBe(false);
    });

    it('支払いを指定すると、色の宝石の代わりに黄金を使える。数が合わなければ断る', () => {
        const game = makeGame();
        const card = findCard(c => c.level === 1 && c.bonus === 'red' && c.cost.white === 3);
        placeOnBoard(game, 1, 0, card);
        const p = game.players[0];
        p.tokens = tokens({ white: 3, gold: 1 });
        expect(game.applyCommand(0, { type: 'buy', card, payment: { white: 3, gold: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'buy', card, payment: { white: 1, gold: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'buy', card, payment: { white: 2, gold: 2 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'buy', card, payment: { white: 2, gold: 1 } })).toBe(true);
        expect(p.tokens).toEqual(tokens({ white: 1 }));
    });

    it('ボーナスだけで払えるカードは、宝石なしで買える', () => {
        const game = makeGame();
        const card = findCard(c => c.level === 1 && c.bonus === 'red' && c.cost.white === 3);
        placeOnBoard(game, 1, 0, card);
        giveBonuses(game.players[0], { white: 3 });
        expect(game.applyCommand(0, { type: 'buy', card })).toBe(true);
    });
});

describe('宝石は10個まで', () => {
    it('10個を超えたら、手番の終わりに超えた分を選んで返す（取ったばかりの宝石も返せる）', () => {
        const game = makeGame();
        const p = game.players[0];
        p.tokens = tokens({ white: 2, blue: 2, green: 3, red: 2 });
        expect(game.applyCommand(0, { type: 'take', tokens: { white: 1, black: 1, red: 1 } })).toBe(true);
        expect(game.phase).toBe('discard');
        expect(game.current).toBe(0);
        expect(game.applyCommand(0, { type: 'take', tokens: { white: 1, black: 1, red: 1 } })).toBe(false);
        expect(game.applyCommand(0, { type: 'discard', tokens: { black: 2 } })).toBe(false); // 黒は1個しかない
        expect(game.applyCommand(0, { type: 'discard', tokens: { black: 1 } })).toBe(false); // 1個では足りない
        expect(game.applyCommand(0, { type: 'discard', tokens: { black: 1, white: 1 } })).toBe(true);
        expect(countTokens(p.tokens)).toBe(10);
        expect(game.phase).toBe('action');
        expect(game.current).toBe(1);
    });

    it('黄金も数え、黄金を返してもよい', () => {
        const game = makeGame();
        const p = game.players[0];
        p.tokens = tokens({ white: 3, blue: 3, green: 4 });
        expect(game.applyCommand(0, { type: 'reserve', level: 1 })).toBe(true);
        expect(game.phase).toBe('discard');
        expect(game.applyCommand(0, { type: 'discard', tokens: { gold: 1 } })).toBe(true);
        expect(game.bank.gold).toBe(5);
    });

    it('ちょうど10個なら返さない', () => {
        const game = makeGame();
        game.players[0].tokens = tokens({ white: 3, blue: 2, green: 2 });
        game.applyCommand(0, { type: 'take', tokens: { white: 1, black: 1, red: 1 } });
        expect(game.phase).toBe('action');
        expect(game.current).toBe(1);
    });
});

describe('貴族', () => {
    const setupNobles = (game, ids) => { game.nobles = ids; };

    it('手番の終わりに、ボーナスが条件を満たせば自動で訪れる（宝石は数えない）', () => {
        const game = makeGame();
        const noble = NOBLES.findIndex(n => n.req.white === 4 && n.req.blue === 4);
        setupNobles(game, [noble]);
        const p = game.players[0];
        giveBonuses(p, { white: 4, blue: 3 });
        p.tokens = tokens({ blue: 3 });
        game.applyCommand(0, { type: 'take', tokens: { green: 1, red: 1, black: 1 } });
        expect(p.nobles).toEqual([]);

        const card = findCard(c => c.level === 1 && c.bonus === 'blue' && c.cost.black === 3);
        placeOnBoard(game, 1, 0, card);
        game.players[1].tokens = tokens({ black: 3 });
        giveBonuses(game.players[1], { white: 4, blue: 3 });
        expect(game.applyCommand(1, { type: 'buy', card })).toBe(true);
        expect(game.players[1].nobles).toEqual([noble]);
        expect(game.nobles).toEqual([]);
        expect(pointsOf(game.players[1])).toBe(3);
    });

    it('複数の貴族が条件を満たしたら、1人を選ぶ（1手番に1人まで）', () => {
        const game = makeGame();
        const a = NOBLES.findIndex(n => n.req.white === 4 && n.req.blue === 4);
        const b = NOBLES.findIndex(n => n.req.blue === 4 && n.req.green === 4);
        setupNobles(game, [a, b]);
        giveBonuses(game.players[0], { white: 4, blue: 4, green: 4 });
        game.applyCommand(0, { type: 'take', tokens: { green: 1, red: 1, black: 1 } });
        expect(game.phase).toBe('noble');
        expect(game.nobleChoices).toEqual([a, b]);
        expect(game.applyCommand(0, { type: 'noble', noble: 7 })).toBe(false);
        expect(game.applyCommand(0, { type: 'noble', noble: b })).toBe(true);
        expect(game.players[0].nobles).toEqual([b]);
        expect(game.current).toBe(1);
        // 次の自分の手番の終わりに、残りの貴族が訪れる
        game.applyCommand(1, { type: 'take', tokens: { green: 1, red: 1, black: 1 } });
        game.applyCommand(0, { type: 'take', tokens: { green: 1, red: 1, black: 1 } });
        expect(game.players[0].nobles).toEqual([b, a]);
    });

    it('宝石を返してから、貴族が訪れる', () => {
        const game = makeGame();
        const a = NOBLES.findIndex(n => n.req.white === 4 && n.req.blue === 4);
        setupNobles(game, [a]);
        giveBonuses(game.players[0], { white: 4, blue: 4 });
        game.players[0].tokens = tokens({ red: 4, black: 4 });
        game.applyCommand(0, { type: 'take', tokens: { white: 1, blue: 1, green: 1 } });
        expect(game.phase).toBe('discard');
        expect(game.players[0].nobles).toEqual([]);
        game.applyCommand(0, { type: 'discard', tokens: { red: 1 } });
        expect(game.players[0].nobles).toEqual([a]);
    });
});

describe('終わり方', () => {
    // 席 seat に15点ぶんのカードを持たせ、何か1手させる
    const reach15 = (game, seat) => {
        const fives = CARDS.filter(c => c.points === 5).map(c => c.id).slice(0, 3);
        game.players[seat].cards.push(...fives);
    };
    const takeAny = (game, seat) => {
        const colors = COLORS.filter(c => game.bank[c] > 0).slice(0, 3);
        const ok = game.applyCommand(seat, { type: 'take', tokens: Object.fromEntries(colors.map(c => [c, 1])) });
        if (game.phase === 'discard') game.applyCommand(seat, { type: 'discard', tokens: { [colors[0]]: countTokens(game.players[seat].tokens) - 10 } });
        return ok;
    };

    it('15点に達したら、その巡の終わり（最初の手番の人の前）まで続ける', () => {
        const game = new Game(players(3), { seed: 5, startPlayer: 1 });
        // 手番は 1 → 2 → 0 の順。席2が15点に達する
        takeAny(game, 1);
        reach15(game, 2);
        takeAny(game, 2);
        expect(game.finalRound).toBe(true);
        expect(game.phase).toBe('action');
        expect(game.current).toBe(0);
        takeAny(game, 0);
        expect(game.phase).toBe('end');
        expect(game.winners).toEqual([2]);
        expect(game.applyCommand(1, { type: 'pass' })).toBe(false);
    });

    it('巡の最後の人が15点に達したら、すぐに終わる', () => {
        const game = makeGame(2);
        takeAny(game, 0);
        reach15(game, 1);
        takeAny(game, 1);
        expect(game.phase).toBe('end');
    });

    it('点数が同じなら、買ったカードの少ない人が勝ち。それも同じなら全員が勝ち', () => {
        const game = makeGame(2);
        reach15(game, 0);
        game.players[1].cards.push(...CARDS.filter(c => c.points === 4).map(c => c.id).slice(0, 2), ...CARDS.filter(c => c.points === 3).map(c => c.id).slice(0, 1), ...CARDS.filter(c => c.points === 4).map(c => c.id).slice(2, 3));
        // 席0：5点×3枚＝15点、席1：4+4+3+4＝15点で4枚
        takeAny(game, 0);
        takeAny(game, 1);
        expect(game.phase).toBe('end');
        expect(game.winners).toEqual([0]);

        const tie = makeGame(2);
        reach15(tie, 0);
        reach15(tie, 1);
        takeAny(tie, 0);
        takeAny(tie, 1);
        expect(tie.winners).toEqual([0, 1]);
    });

    it('貴族の点数も数える', () => {
        const game = makeGame(2);
        game.players[0].cards.push(...CARDS.filter(c => c.points === 4).map(c => c.id).slice(0, 3));
        game.players[0].nobles.push(0);
        expect(pointsOf(game.players[0])).toBe(15);
    });
});

describe('パス', () => {
    it('できる操作があるときはパスできない', () => {
        const game = makeGame();
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false);
    });

    it('どの操作もできないときだけパスでき、全員が続けてパスしたら終わる', () => {
        const game = makeGame();
        game.bank = tokens({ gold: 5 });
        game.players.forEach(p => { p.reserved = [0, 1, 2].map(i => ({ id: game.decks[1].pop(), hidden: false })); });
        expect(game.applyCommand(0, { type: 'pass' })).toBe(true);
        expect(game.phase).toBe('action');
        expect(game.applyCommand(1, { type: 'pass' })).toBe(true);
        expect(game.phase).toBe('end');
        expect(game.endReason).toBe('stalled');
    });
});

describe('記録と再現', () => {
    it('断った操作では、状態が少しも変わらない', () => {
        const game = makeGame(3, 9);
        game.players[0].tokens = tokens({ white: 4, blue: 4, gold: 1 });
        const before = snapshot(game);
        const bad = [
            { type: 'take', tokens: { white: 1, blue: 1 } },
            { type: 'take', tokens: { gold: 1 } },
            { type: 'reserve', level: 7 },
            { type: 'reserve', card: -1 },
            { type: 'buy', card: game.decks[3][0] },
            { type: 'buy', card: game.board[3][0], payment: { white: 99 } },
            { type: 'discard', tokens: { white: 1 } },
            { type: 'noble', noble: 0 },
            { type: 'pass' }
        ];
        bad.forEach(command => {
            expect(game.applyCommand(0, command)).toBe(false);
            expect(snapshot(game)).toBe(before);
        });
    });

    it('記録から同じ状態を作り直せる', () => {
        const game = makeGame(2, 3);
        game.applyCommand(0, { type: 'take', tokens: { white: 1, blue: 1, green: 1 } });
        game.applyCommand(1, { type: 'reserve', level: 2 });
        game.applyCommand(0, { type: 'take', tokens: { red: 2 } });
        const saved = JSON.parse(JSON.stringify(game.persist()));
        const again = Game.replay(saved.players, saved.options, saved.commands);
        expect(snapshot(again)).toBe(snapshot(game));
    });
});
