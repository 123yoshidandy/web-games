import { describe, it, expect } from 'vitest';
import Game, { GEISHA, fullDeck, ACTIONS } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { createRandom } from '../public/js/random.js';
import { players, makeGame, setup, snapshot, legalCommands } from './helpers.js';

const allCards = (game) => [
    ...game.deck, game.removed,
    ...game.players.flatMap(p => [...p.hand, ...p.discards, ...(p.secret === null ? [] : [p.secret])]),
    ...game.players.flatMap(p => p.placed.flatMap((n, g) => Array(n).fill(g))),
    ...(game.pending ? (game.pending.cards ?? game.pending.groups.flat()) : [])
].sort((a, b) => a - b);

// ランダムに通る手を打って、ゲームを最後まで進める
function playRandom(game, seed) {
    const random = createRandom(seed);
    let steps = 0;
    while (!game.isOver() && steps++ < 2000) {
        const list = legalCommands(game);
        const command = list[Math.floor(random() * list.length)];
        expect(game.applyCommand(game.actor(), command)).toBe(true);
        expect(allCards(game)).toEqual(fullDeck());
    }
    return game;
}

describe('芸者とカード', () => {
    it('芸者は7人（2・2・2・3・3・4・5）、品物は21枚で芸者ごとに点数と同じ枚数', () => {
        expect(GEISHA.map(g => g.value)).toEqual([2, 2, 2, 3, 3, 4, 5]);
        expect(fullDeck()).toHaveLength(21);
        GEISHA.forEach((g, i) => expect(fullDeck().filter(c => c === i)).toHaveLength(g.value));
    });
});

describe('準備', () => {
    it('1枚を除き、各自に6枚配り、山札は8枚。1番手が1枚引いている', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = makeGame(seed);
            const first = game.players[game.starter];
            const second = game.players[1 - game.starter];
            expect(first.hand).toHaveLength(7);
            expect(second.hand).toHaveLength(6);
            expect(game.deck).toHaveLength(7);
            expect(allCards(game)).toEqual(fullDeck());
            expect(game.current).toBe(game.starter);
            expect(game.favor.every(f => f === null)).toBe(true);
        }
    });

    it('2人でしか遊べない。同じシードなら同じ配り方', () => {
        expect(() => new Game([{ name: 'A' }])).toThrow();
        expect(snapshot(makeGame(9))).toBe(snapshot(makeGame(9)));
    });
});

describe('行動', () => {
    it('秘密：1枚を伏せて取っておき、相手の番になって相手が1枚引く', () => {
        const game = makeGame();
        setup(game, { hands: [[0, 1, 2, 3, 4, 5, 6], [0, 1, 2, 3, 4, 5]], deck: [6, 6] });
        expect(game.applyCommand(0, { type: 'secret', card: 6 })).toBe(true);
        expect(game.players[0].secret).toBe(6);
        expect(game.players[0].hand).toEqual([0, 1, 2, 3, 4, 5]);
        expect(game.current).toBe(1);
        expect(game.players[1].hand).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(game.deck).toEqual([6]);
    });

    it('放棄：2枚を捨てる', () => {
        const game = makeGame();
        setup(game, { hands: [[0, 0, 1, 2, 3, 4, 5], [1]], deck: [6] });
        expect(game.applyCommand(0, { type: 'discard', cards: [0, 0] })).toBe(true);
        expect(game.players[0].discards).toEqual([0, 0]);
        expect(game.players[0].hand).toEqual([1, 2, 3, 4, 5]);
    });

    it('贈り物：相手が1枚選んで相手の側へ、残りの2枚は自分の側へ。そのあと相手の番', () => {
        const game = makeGame();
        setup(game, { hands: [[0, 3, 6, 6, 1, 2, 4], [5]], deck: [5] });
        expect(game.applyCommand(0, { type: 'gift', cards: [6, 3, 6] })).toBe(true);
        expect(game.phase).toBe('choose');
        expect(game.pending).toEqual({ type: 'gift', from: 0, cards: [3, 6, 6] });
        expect(game.actor()).toBe(1);
        expect(game.applyCommand(0, { type: 'pick', index: 0 })).toBe(false);
        expect(game.applyCommand(1, { type: 'secret', card: 5 })).toBe(false);
        expect(game.applyCommand(1, { type: 'pick', index: 1 })).toBe(true);
        expect(game.players[1].placed[6]).toBe(1);
        expect(game.players[0].placed[6]).toBe(1);
        expect(game.players[0].placed[3]).toBe(1);
        expect(game.phase).toBe('play');
        expect(game.current).toBe(1);
        expect(game.players[1].hand).toEqual([5, 5]);
    });

    it('競争：相手が1組選んで相手の側へ、残りの1組は自分の側へ', () => {
        const game = makeGame();
        setup(game, { hands: [[0, 1, 5, 6, 2, 3, 4], [5]], deck: [5] });
        expect(game.applyCommand(0, { type: 'compete', groups: [[6, 5], [0, 1]] })).toBe(true);
        expect(game.pending.groups).toEqual([[5, 6], [0, 1]]);
        expect(game.applyCommand(1, { type: 'pick', index: 2 })).toBe(false);
        expect(game.applyCommand(1, { type: 'pick', index: 0 })).toBe(true);
        expect(game.players[1].placed.slice(5)).toEqual([1, 1]);
        expect(game.players[0].placed.slice(0, 2)).toEqual([1, 1]);
    });

    it('同じ行動は1ラウンドに1回だけ。枚数が違う・持っていないカードは断る', () => {
        const game = makeGame();
        setup(game, { hands: [[0, 1, 2, 3, 4, 5, 6], [0]], deck: [6], used: [['secret'], []] });
        expect(game.applyCommand(0, { type: 'secret', card: 0 })).toBe(false);
        expect(game.lastError).toMatch(/使いました/);
        expect(game.applyCommand(0, { type: 'discard', cards: [0] })).toBe(false);
        expect(game.applyCommand(0, { type: 'discard', cards: [0, 0] })).toBe(false);
        expect(game.applyCommand(0, { type: 'gift', cards: [0, 1, 9] })).toBe(false);
        expect(game.applyCommand(0, { type: 'compete', groups: [[0, 1, 2], [3]] })).toBe(false);
        expect(game.applyCommand(0, { type: 'compete', groups: [[0, 1], [2, 2]] })).toBe(false);
        expect(game.applyCommand(1, { type: 'secret', card: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'pick', index: 0 })).toBe(false);
        expect(game.applyCommand(0, { type: 'nope' })).toBe(false);
    });

    it('断った操作は状態を変えない（ランダムな操作で確かめる）', () => {
        const random = createRandom(3);
        for (let seed = 1; seed <= 10; seed++) {
            const game = makeGame(seed);
            while (!game.isOver()) {
                const junk = [
                    { type: 'secret', card: Math.floor(random() * 9) - 1 },
                    { type: 'discard', cards: [Math.floor(random() * 7), Math.floor(random() * 7)] },
                    { type: 'gift', cards: [0, 0, 0] },
                    { type: 'compete', groups: [[6, 6], [6, 6]] },
                    { type: 'pick', index: Math.floor(random() * 4) - 1 }
                ];
                for (const command of junk) {
                    if (game.isOver()) break;
                    const before = snapshot(game);
                    // 通る操作だったときは、そのまま続ける
                    if (!game.applyCommand(Math.floor(random() * 2), command)) expect(snapshot(game)).toBe(before);
                }
                if (game.isOver()) break;
                const list = legalCommands(game);
                expect(game.applyCommand(game.actor(), list[Math.floor(random() * list.length)])).toBe(true);
            }
        }
    });
});

describe('ラウンドの終わり', () => {
    // 両者が3つの行動を使い終え、席0が秘密だけ残している場面を作る
    function lastTurn(game, { placed, favor, secretCard = 6, opponentSecret = null }) {
        setup(game, { hands: [[secretCard], []], deck: [], used: [['discard', 'gift', 'compete'], ACTIONS], placed, favor });
        game.players[1].secret = opponentSecret;
    }

    it('秘密を含めて多い方が好意を得る。同数なら前のまま。点数と人数を数える', () => {
        const game = makeGame();
        lastTurn(game, {
            placed: [[1, 0, 2, 0, 1, 0, 2], [0, 1, 2, 1, 1, 0, 2]],
            favor: [null, null, 1, null, 0, null, null],
            opponentSecret: 4
        });
        expect(game.applyCommand(0, { type: 'secret', card: 6 })).toBe(true);
        const result = game.history[0];
        expect(result.counts[0]).toEqual([1, 0, 2, 0, 1, 0, 3]);
        expect(result.counts[1]).toEqual([0, 1, 2, 1, 2, 0, 2]);
        // 柳（同数）は席1のまま、藤（0対0）はだれのものでもないまま。桔梗は席1が上回って移る
        expect(result.favor).toEqual([0, 1, 1, 1, 1, null, 0]);
        expect(result.points).toEqual([2 + 5, 2 + 2 + 3 + 3]);
        expect(result.geishas).toEqual([2, 4]);
        // 席1が芸者4人で勝ち
        expect(game.winner).toBe(1);
        expect(result.reason).toBe('geishas');
        expect(game.phase).toBe('end');
    });

    it('11点の方が、芸者4人より先', () => {
        const game = makeGame();
        lastTurn(game, {
            placed: [[0, 0, 0, 0, 0, 1, 2], [1, 1, 1, 1, 0, 0, 0]],
            favor: [null, null, null, null, null, null, null]
        });
        expect(game.applyCommand(0, { type: 'secret', card: 4 })).toBe(false);
        game.players[0].hand = [4];
        expect(game.applyCommand(0, { type: 'secret', card: 4 })).toBe(true);
        // 席0：藤4＋桜5＋桔梗3＝12点（3人）、席1：2＋2＋2＋3＝9点（4人）
        expect(game.history[0].points).toEqual([12, 9]);
        expect(game.winner).toBe(0);
        expect(game.history[0].reason).toBe('points');
    });

    it('決まらなければ、好意の印を残して次のラウンド。手番の順を入れ替える', () => {
        const game = makeGame(4);
        const starter = game.starter;
        lastTurn(game, { placed: [[1, 0, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0, 0]], favor: Array(7).fill(null) });
        expect(game.applyCommand(0, { type: 'secret', card: 6 })).toBe(true);
        expect(game.round).toBe(2);
        expect(game.favor).toEqual([0, 1, null, null, null, null, 0]);
        expect(game.starter).toBe(1 - starter);
        expect(game.current).toBe(1 - starter);
        expect(game.players.every(p => p.used.length === 0 && p.secret === null && p.placed.every(n => n === 0))).toBe(true);
        expect(allCards(game)).toEqual(fullDeck());
    });

    it('各ラウンドで、両者がちょうど4つの行動を使い、山札を引き切る', () => {
        for (let seed = 1; seed <= 30; seed++) {
            const game = makeGame(seed);
            const random = createRandom(seed);
            let round = game.round;
            let actions = 0;
            while (!game.isOver()) {
                const list = legalCommands(game);
                expect(list.length).toBeGreaterThan(0);
                const command = list[Math.floor(random() * list.length)];
                if (command.type !== 'pick') actions++;
                // 最後の行動の前に、山札は引き切っている
                if (game.phase === 'play' && game.players[0].used.length + game.players[1].used.length === 7) expect(game.deck).toHaveLength(0);
                game.applyCommand(game.actor(), command);
                if (game.round !== round || game.isOver()) {
                    expect(actions).toBe(8);
                    actions = 0;
                    round = game.round;
                }
            }
        }
    });
});

describe('記録と再現', () => {
    it('ランダムな試合が必ず終わり、操作の記録から同じ状態を作り直せる', () => {
        for (let seed = 1; seed <= 40; seed++) {
            const game = playRandom(makeGame(seed), seed * 7);
            expect(game.isOver()).toBe(true);
            const saved = JSON.parse(JSON.stringify(game.persist()));
            expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
        }
    });

    it('余計な項目は記録しない', () => {
        const game = makeGame();
        setup(game, { hands: [[0, 1, 2, 3, 4, 5, 6], [0]], deck: [6] });
        expect(game.applyCommand(0, { type: 'secret', card: 3, extra: 'x' })).toBe(true);
        expect(game.commands.at(-1).command).toEqual({ type: 'secret', card: 3 });
    });
});

describe('ビュー', () => {
    it('相手の手札・秘密・放棄・引いたカードは見せない。自分の分は見せる', () => {
        const game = new Game(players(), { seed: 2 });
        const seat = game.starter;
        const other = 1 - seat;
        const card = game.players[seat].hand[0];
        expect(game.applyCommand(seat, { type: 'secret', card })).toBe(true);
        const h2 = game.players[other].hand;
        expect(game.applyCommand(other, { type: 'discard', cards: [h2[0], h2[1]] })).toBe(true);
        const view = createGameView(game, seat);
        expect(view.players[seat].secret).toBe(card);
        expect(view.players[other].hand).toBe(null);
        expect(view.players[other].discards).toBe(null);
        expect(view.players[other].discardUsed).toBe(true);
        expect(view.players[other].handCount).toBe(game.players[other].hand.length);
        const json = JSON.stringify(view);
        expect(json).not.toContain('"removed"');
        expect(json).not.toContain('"deck":');
        view.events.forEach(e => {
            if (e.type === 'deal') expect(e.hands).toBeUndefined();
            if (e.type === 'draw' && e.seat === other) expect(e.card).toBe(null);
            if (e.type === 'secret' && e.seat === other) expect(e.card).toBe(null);
            if (e.type === 'discard' && e.seat === other) expect(e.cards).toBe(null);
        });
        const spectator = createGameView(game, null);
        expect(spectator.players.every(p => p.hand === null && p.secret === null)).toBe(true);
    });

    it('ラウンドの終わりのイベントで、両者の秘密を見せる', () => {
        const game = playRandom(makeGame(5), 11);
        const view = createGameView(game, 0);
        const ends = view.events.filter(e => e.type === 'roundEnd');
        expect(ends.length).toBeGreaterThan(0);
        ends.forEach(e => expect(e.secrets.every(s => Number.isInteger(s))).toBe(true));
    });
});
