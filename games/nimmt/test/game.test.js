import { describe, it, expect } from 'vitest';
import Game, { bullsOf, sumBulls, targetRow } from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { players, makeGame, setup, playAll, snapshot } from './helpers.js';

describe('牛の頭の数', () => {
    it('ふつう1、5の倍数2、10の倍数3、ぞろ目5、55は7', () => {
        expect(bullsOf(1)).toBe(1);
        expect(bullsOf(104)).toBe(1);
        expect(bullsOf(5)).toBe(2);
        expect(bullsOf(85)).toBe(2);
        expect(bullsOf(10)).toBe(3);
        expect(bullsOf(100)).toBe(3);
        expect(bullsOf(11)).toBe(5);
        expect(bullsOf(99)).toBe(5);
        expect(bullsOf(55)).toBe(7);
    });

    it('全部で171頭（1が76枚・2が9枚・3が10枚・5が8枚・7が1枚）', () => {
        const all = Array.from({ length: 104 }, (_, i) => i + 1);
        const count = (n) => all.filter(c => bullsOf(c) === n).length;
        expect([count(1), count(2), count(3), count(5), count(7)]).toEqual([76, 9, 10, 8, 1]);
        expect(sumBulls(all)).toBe(171);
    });
});

describe('準備', () => {
    it.each([2, 5, 10])('%i人：各自10枚、4列に1枚ずつ。カードは重ならない', (n) => {
        const game = makeGame(n);
        game.players.forEach(p => expect(p.hand).toHaveLength(10));
        expect(game.rows).toHaveLength(4);
        game.rows.forEach(row => expect(row).toHaveLength(1));
        const all = [...game.players.flatMap(p => p.hand), ...game.rows.flat()];
        expect(new Set(all).size).toBe(n * 10 + 4);
        all.forEach(c => expect(c >= 1 && c <= 104).toBe(true));
    });

    it('10人では104枚をちょうど使い切る', () => {
        const game = makeGame(10);
        expect(game.players.flatMap(p => p.hand).length + game.rows.flat().length).toBe(104);
    });

    it('人数は2〜10人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(11))).toThrow();
    });

    it('同じシードなら同じ配り方', () => {
        expect(snapshot(makeGame(4, 9))).toBe(snapshot(makeGame(4, 9)));
        expect(JSON.stringify(makeGame(4, 9).rows)).not.toBe(JSON.stringify(makeGame(4, 10).rows));
    });
});

describe('置く列', () => {
    it('末尾がカードより小さい列のうち、差がいちばん小さい列', () => {
        const rows = [[10], [20], [30], [40]];
        expect(targetRow(rows, 25)).toBe(1);
        expect(targetRow(rows, 45)).toBe(3);
        expect(targetRow(rows, 11)).toBe(0);
        expect(targetRow(rows, 5)).toBe(-1);
    });
});

describe('同時に出す', () => {
    it('全員がそろうまでは公開せず、そろったら小さい順に置く', () => {
        const game = makeGame(3);
        setup(game, { hands: [[23, 1, 2, 3, 4, 5, 6, 7, 8, 9], [21, 61, 62, 63, 64, 65, 66, 67, 68, 69], [22, 71, 72, 73, 74, 75, 76, 77, 78, 79]], rows: [[10], [20], [30], [40]] });
        game.applyCommand(0, { type: 'play', card: 23 });
        expect(game.rows[1]).toEqual([20]);
        expect(createGameView(game, 1).players[0].selected).toBe(true);
        expect(JSON.stringify(createGameView(game, 1))).not.toContain('"mySelection":23');
        expect(createGameView(game, 0).mySelection).toBe(23);
        game.applyCommand(1, { type: 'play', card: 21 });
        game.applyCommand(2, { type: 'play', card: 22 });
        expect(game.rows[1]).toEqual([20, 21, 22, 23]);
        expect(game.turn).toBe(2);
        expect(game.players[0].hand).not.toContain(23);
    });

    it('1回に1枚だけ。持っていないカードは出せない', () => {
        const game = makeGame(2);
        setup(game, { hands: [[50, 51, 52, 53, 54, 56, 57, 58, 59, 60], [70, 71, 72, 73, 74, 75, 76, 77, 78, 79]], rows: [[10], [20], [30], [40]] });
        expect(game.applyCommand(0, { type: 'play', card: 70 })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 50 })).toBe(true);
        expect(game.applyCommand(0, { type: 'play', card: 51 })).toBe(false);
        expect(game.applyCommand(0, { type: 'takeRow', row: 0 })).toBe(false);
    });

    it('6枚目になったら、その列の5枚を引き取り、出したカードが先頭になる', () => {
        const game = makeGame(2);
        setup(game, { hands: [[26, 90, 91, 92, 93, 94, 95, 96, 97, 98], [80, 81, 82, 83, 84, 85, 86, 87, 88, 89]], rows: [[10, 11, 15, 20, 25], [50], [60], [70]] });
        playAll(game, [26, 80]);
        expect(game.rows[0]).toEqual([26]);
        expect(game.players[0].taken).toEqual([10, 11, 15, 20, 25]);
        expect(createGameView(game, 1).players[0].bulls).toBe(3 + 5 + 2 + 3 + 2);
        expect(game.rows[3]).toEqual([70, 80]);
    });

    it('どの列にも置けないときは、出した人が引き取る列を選ぶ。選ぶまで後のカードは置かない', () => {
        const game = makeGame(3);
        setup(game, { hands: [[5, 90, 91, 92, 93, 94, 95, 96, 97, 98], [8, 81, 82, 83, 84, 85, 86, 87, 88, 89], [45, 71, 72, 73, 74, 75, 76, 77, 78, 79]], rows: [[10, 11], [20], [30, 33, 55], [40]] });
        playAll(game, [5, 8, 45]);
        expect(game.phase).toBe('chooseRow');
        expect(game.actors()).toEqual([0]);
        expect(createGameView(game, 2).chooser).toBe(0);
        expect(game.rows[3]).toEqual([40]); // 45 はまだ置かない
        expect(game.applyCommand(1, { type: 'takeRow', row: 1 })).toBe(false);
        expect(game.applyCommand(0, { type: 'takeRow', row: 4 })).toBe(false);
        expect(game.applyCommand(0, { type: 'play', card: 90 })).toBe(false);
        expect(game.applyCommand(0, { type: 'takeRow', row: 1 })).toBe(true);
        expect(game.rows[1]).toEqual([5, 8]); // 8 は 5 の列に置かれる
        expect(game.players[0].taken).toEqual([20]);
        expect(game.rows[3]).toEqual([40, 45]);
        expect(game.phase).toBe('select');
    });

    it('同じ手番で2人が続けて列を選ぶこともある', () => {
        const game = makeGame(2);
        setup(game, { hands: [[1, 90, 91, 92, 93, 94, 95, 96, 97, 98], [2, 81, 82, 83, 84, 85, 86, 87, 88, 89]], rows: [[10], [20], [30], [40]] });
        playAll(game, [1, 2]);
        expect(game.actors()).toEqual([0]);
        game.applyCommand(0, { type: 'takeRow', row: 3 });
        // 2 は 1 の列に置ける
        expect(game.rows[3]).toEqual([1, 2]);
        expect(game.phase).toBe('select');
    });
});

describe('ラウンドと終わり', () => {
    // 席0が毎回いちばん小さいカードを出し、席1は大きいカードを出す10手
    const playRound = (game, choose = 0) => {
        for (let i = 0; i < 10; i++) {
            game.players.forEach(p => {
                const card = p.hand[p.id === 0 ? 0 : p.hand.length - 1];
                game.applyCommand(p.id, { type: 'play', card });
            });
            while (game.phase === 'chooseRow') game.applyCommand(game.actors()[0], { type: 'takeRow', row: choose });
        }
    };

    it('10回出したら失点を足し、配り直す', () => {
        const game = makeGame(2, 4);
        playRound(game);
        expect(game.round).toBe(2);
        expect(game.turn).toBe(1);
        game.players.forEach(p => {
            expect(p.hand).toHaveLength(10);
            expect(p.taken).toEqual([]);
        });
        const roundEnd = game.events.find(e => e.type === 'roundEnd');
        expect(roundEnd.results.map(r => r.score)).toEqual(game.players.map(p => p.score));
        expect(game.players.reduce((s, p) => s + p.score, 0)).toBeGreaterThan(0);
    });

    it('だれかが66点以上でラウンドを終えたら終わり、失点のいちばん少ない人が勝ち', () => {
        const game = makeGame(3, 4);
        setup(game, { scores: [65, 10, 20] });
        game.players[0].hand = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
        game.rows = [[90], [91], [92], [93]];
        game.players[1].hand = [11, 12, 13, 14, 15, 16, 17, 18, 19, 20].map(c => c + 50);
        game.players[2].hand = [21, 22, 23, 24, 25, 26, 27, 28, 29, 30].map(c => c + 50);
        playRound(game);
        expect(game.phase).toBe('end');
        expect(game.players[0].score).toBeGreaterThanOrEqual(66);
        const best = Math.min(...game.players.map(p => p.score));
        expect(game.winners).toEqual(game.players.filter(p => p.score === best).map(p => p.id));
        expect(game.applyCommand(1, { type: 'play', card: 61 })).toBe(false);
    });

    it('66点に届かなければ続く', () => {
        const game = makeGame(2, 4);
        setup(game, { scores: [0, 0] });
        playRound(game);
        expect(game.phase).toBe('select');
    });

    it('失点のいちばん少ない人が複数なら、全員が勝ち', () => {
        const game = makeGame(3, 4);
        game.players.forEach(p => { p.score = [70, 5, 5][p.id]; });
        game.endGame();
        expect(game.winners).toEqual([1, 2]);
    });
});

describe('記録と再現', () => {
    it('断った操作では、状態が少しも変わらない', () => {
        const game = makeGame(3, 2);
        const before = snapshot(game);
        [{ type: 'play', card: 200 }, { type: 'takeRow', row: 0 }, { type: 'nope' }, null, { type: 'play' }].forEach(command => {
            expect(game.applyCommand(0, command)).toBe(false);
            expect(snapshot(game)).toBe(before);
        });
        expect(game.applyCommand(9, { type: 'play', card: game.players[0].hand[0] })).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('記録から同じ状態を作り直せる。余計な項目は記録しない', () => {
        const game = makeGame(3, 5);
        game.players.forEach(p => game.applyCommand(p.id, { type: 'play', card: p.hand[0], junk: 'x' }));
        while (game.phase === 'chooseRow') game.applyCommand(game.actors()[0], { type: 'takeRow', row: 2 });
        expect(game.commands[0].command).toEqual({ type: 'play', card: game.commands[0].command.card });
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });
});

describe('ビュー', () => {
    it('ほかの人の手札は枚数だけ。配ったイベントの手札も本人の分だけ', () => {
        const game = makeGame(4, 3);
        const view = createGameView(game, 1);
        expect(view.hand).toEqual(game.players[1].hand);
        expect(view.players[0].handCount).toBe(10);
        expect(JSON.stringify(view.players)).not.toContain('"hand"');
        const deal = view.events.find(e => e.type === 'deal');
        expect(deal.hand).toEqual(game.players[1].hand);
        expect(deal.hands).toBeUndefined();
        expect(createGameView(game, null).hand).toEqual([]);
    });

    it('JSON にしても同じ内容になる', () => {
        const view = createGameView(makeGame(10), 3);
        expect(JSON.parse(JSON.stringify(view))).toEqual(view);
    });
});
