import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { ROWS, CELLS, CELL_COUNT, NEIGHBORS, cellAt, between } from '../public/js/board.js';
import { players, newGame, at, movePhase, flatFish, snapshot, totalTiles } from './helpers.js';

describe('盤', () => {
    it('7枚と8枚が交互の8列で、60マス', () => {
        expect(ROWS).toEqual([7, 8, 7, 8, 7, 8, 7, 8]);
        expect(CELL_COUNT).toBe(60);
        CELLS.forEach(({ x, y }, c) => expect(cellAt(x, y)).toBe(c));
    });

    it('となりは6方向で、互いにとなり合う。角は少ない', () => {
        NEIGHBORS.forEach((list, c) => list.forEach(nb => { if (nb >= 0) expect(NEIGHBORS[nb]).toContain(c); }));
        const count = (c) => NEIGHBORS[c].filter(nb => nb >= 0).length;
        expect(count(at(7, 2))).toBe(6);  // 真ん中
        expect(count(at(0, 1))).toBe(3);  // 8枚の列の左端
        expect(count(at(1, 0))).toBe(3);  // 上の列の左端（下の2つと右）
        expect(count(at(14, 7))).toBe(2); // 下の列の右端
    });

    it('まっすぐの線の上のマスと、間のマスが分かる', () => {
        expect(between(at(0, 1), at(6, 1))).toEqual([at(2, 1), at(4, 1)]);
        expect(between(at(1, 0), at(4, 3))).toEqual([at(2, 1), at(3, 2)]);
        expect(between(at(1, 0), at(4, 1))).toBe(null);
    });
});

describe('準備', () => {
    it('魚1匹30枚・2匹20枚・3匹10枚を、シードで混ぜる', () => {
        const game = newGame(3, 5);
        [1, 2, 3].forEach((f, i) => expect(game.fish.filter(x => x === f).length).toBe([30, 20, 10][i]));
        expect(snapshot(new Game(players(3), { seed: 5, startPlayer: 0 }))).toBe(snapshot(game));
        expect(new Game(players(3), { seed: 6, startPlayer: 0 }).fish).not.toEqual(game.fish);
    });

    it('ペンギンは 2人4羽・3人3羽・4人2羽', () => {
        expect([2, 3, 4].map(n => newGame(n).penguins.length / n)).toEqual([4, 3, 2]);
    });
});

describe('置く', () => {
    it('魚1匹の空いている氷にだけ、順に1羽ずつ置く。置き終えたら最初の人から動かす', () => {
        const game = new Game(players(3), { seed: 2, startPlayer: 1 });
        const two = game.fish.indexOf(2);
        expect(game.applyCommand(1, { type: 'place', cell: two })).toBe(false);
        const ones = game.placeable();
        expect(game.applyCommand(1, { type: 'place', cell: ones[0] })).toBe(true);
        expect(game.applyCommand(2, { type: 'place', cell: ones[0] })).toBe(false); // もういる
        expect(game.current).toBe(2);
        const order = [];
        while (game.phase === 'place') {
            order.push(game.current);
            game.applyCommand(game.current, { type: 'place', cell: game.placeable()[0] });
        }
        expect(order).toEqual([2, 0, 1, 2, 0, 1, 2, 0]);
        expect(game.phase).toBe('move');
        expect(game.current).toBe(1);
        expect(game.penguins.every(p => game.fish[p.cell] === 1)).toBe(true);
    });
});

describe('動かす', () => {
    it('まっすぐ何マスでも動け、出発した氷を取る', () => {
        const game = newGame(2);
        flatFish(game);
        game.fish[at(0, 1)] = 3;
        movePhase(game, { 0: at(0, 1), 4: at(14, 7) });
        expect(game.applyCommand(0, { type: 'move', penguin: 0, to: at(14, 1) })).toBe(true);
        expect(game.fish[at(0, 1)]).toBe(0);
        expect(game.players[0].catch).toEqual([3]);
        expect(game.penguins[0].cell).toBe(at(14, 1));
        expect(game.current).toBe(1);
    });

    it('向きは変えられず、穴とペンギンは越えられない', () => {
        const game = newGame(2);
        flatFish(game);
        movePhase(game, { 0: at(0, 1), 4: at(8, 1) });
        game.fish[at(4, 1)] = 0; // 穴
        const moves = game.movesOf(0);
        expect(moves).toContain(at(2, 1));
        expect(moves).not.toContain(at(4, 1));
        expect(moves).not.toContain(at(6, 1));    // 穴の先
        expect(moves).not.toContain(at(10, 1));   // ペンギンの先
        moves.forEach(to => expect(between(at(0, 1), to)).not.toBe(null));
        expect(game.applyCommand(0, { type: 'move', penguin: 0, to: at(6, 1) })).toBe(false);
        expect(game.applyCommand(0, { type: 'move', penguin: 4, to: at(10, 1) })).toBe(false); // 相手のペンギン
        // ペンギンの手前までは行ける
        movePhase(game, { 0: at(0, 1), 4: at(4, 1) });
        game.fish[at(4, 1)] = 1;
        expect(game.movesOf(0)).toContain(at(2, 1));
        expect(game.movesOf(0)).not.toContain(at(4, 1));
    });

    it('動けない人は、手番で抜ける。ペンギンを取り除き、足もとの氷を取る', () => {
        const game = newGame(2);
        game.fish.fill(0);
        // 席0のペンギン（0番）は2マスの島、席1のペンギン（4番・5番）は動けない
        [at(0, 1), at(2, 1)].forEach(c => { game.fish[c] = 1; });
        game.fish[at(14, 7)] = 3;
        game.fish[at(7, 0)] = 2;
        movePhase(game, { 0: at(0, 1), 4: at(14, 7), 5: at(7, 0) });
        expect(game.applyCommand(0, { type: 'move', penguin: 0, to: at(2, 1) })).toBe(true);
        // 席1は動けないので抜け、席0の番に戻る……が席0ももう動けないので、終わる
        expect(game.players[1].out).toBe(true);
        expect(game.players[1].catch.sort()).toEqual([2, 3]);
        expect(game.isOver()).toBe(true);
        expect(game.players[0].catch).toEqual([1, 1]); // 取った氷と、抜けたときの足もと
        expect(game.winners).toEqual([1]);
    });

    it('ほかの人が抜けても、動ける人は続けて動く', () => {
        const game = newGame(2);
        game.fish.fill(0);
        [at(0, 1), at(2, 1), at(4, 1), at(6, 1)].forEach(c => { game.fish[c] = 1; });
        game.fish[at(14, 7)] = 1;
        movePhase(game, { 0: at(0, 1), 4: at(14, 7) });
        game.applyCommand(0, { type: 'move', penguin: 0, to: at(2, 1) });
        expect(game.players[1].out).toBe(true);
        expect(game.current).toBe(0);
        game.applyCommand(0, { type: 'move', penguin: 0, to: at(4, 1) });
        expect(game.current).toBe(0);
    });
});

describe('得点', () => {
    const ended = (catches) => {
        const game = newGame(catches.length);
        game.fish.fill(0);
        movePhase(game, {});
        game.players.forEach((p, i) => { p.catch = catches[i]; });
        game.startTurn();
        return game;
    };

    it('魚の合計が多い人の勝ち', () => {
        expect(ended([[3, 3], [1, 1, 1]]).winners).toEqual([0]);
    });

    it('同じなら氷の枚数が多い人。それも同じなら分け合う', () => {
        expect(ended([[3, 3], [2, 2, 2]]).winners).toEqual([1]);
        expect(ended([[3, 1], [2, 2], [1]]).winners).toEqual([0, 1]);
    });
});

describe('断る操作', () => {
    it('番でない人・知らない操作・形の違う項目は断り、状態を変えない', () => {
        const game = newGame(2);
        const before = snapshot(game);
        const one = game.placeable()[0];
        expect(game.applyCommand(1, { type: 'place', cell: one })).toBe(false);
        expect(game.applyCommand(0, { type: 'move', penguin: 0, to: one })).toBe(false);
        expect(game.applyCommand(0, { type: 'place', cell: '3' })).toBe(false);
        expect(game.applyCommand(0, { type: 'place', cell: 60 })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(totalTiles(game)).toBe(60);
    });

    it('記録には決まった項目だけを残す', () => {
        const game = newGame(2);
        const cell = game.placeable()[0];
        game.applyCommand(0, { type: 'place', cell, extra: 'x' });
        expect(game.commands).toEqual([{ playerId: 0, command: { type: 'place', cell } }]);
    });
});
