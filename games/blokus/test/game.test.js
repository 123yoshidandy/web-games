import { describe, it, expect } from 'vitest';
import Game, { PIECES, PIECE_ORDER, SHARED, canPlaceCells, legalMoves, anchors, placedCells } from '../public/js/game.js';
import { TOTAL_SQUARES, transform } from '../public/js/pieces.js';
import { newGame, players, paint, place, snapshot } from './helpers.js';

describe('ピース', () => {
    it('21個（1マス1・2マス1・3マス2・4マス5・5マス12）、合わせて89マス', () => {
        expect(PIECE_ORDER).toHaveLength(21);
        const bySize = [1, 2, 3, 4, 5].map(n => PIECE_ORDER.filter(p => PIECES[p].size === n).length);
        expect(bySize).toEqual([1, 1, 2, 5, 12]);
        expect(TOTAL_SQUARES).toBe(89);
    });

    it('21個はどれも違う形（回しても裏返しても重ならない）', () => {
        const canon = (p) => PIECES[p].orientations.map(o => JSON.stringify(o)).sort()[0];
        expect(new Set(PIECE_ORDER.map(canon)).size).toBe(21);
    });

    it('向きの数：1マスは1、正方形は1、X は1、I5 は2、L5 は8、F は8', () => {
        expect(PIECES.I1.distinct).toHaveLength(1);
        expect(PIECES.O4.distinct).toHaveLength(1);
        expect(PIECES.X5.distinct).toHaveLength(1);
        expect(PIECES.I5.distinct).toHaveLength(2);
        expect(PIECES.L5.distinct).toHaveLength(8);
        expect(PIECES.F5.distinct).toHaveLength(8);
        // 5マスの12個の向きの合計は63（知られている数）
        expect(PIECE_ORDER.filter(p => PIECES[p].size === 5).reduce((n, p) => n + PIECES[p].distinct.length, 0)).toBe(63);
    });

    it('回転は4回で元に戻り、裏返しは2回で元に戻る', () => {
        const cells = PIECES.F5.cells;
        expect(transform(cells, 0)).toEqual(cells);
        expect(transform(transform(cells, 1), 3)).toEqual(cells);
        expect(transform(transform(cells, 4), 4)).toEqual(cells);
    });
});

describe('準備と色の持ち主', () => {
    it('4人は1人1色。先手が青、そのあと黄・赤・緑の順', () => {
        const game = new Game(players(4), { seed: 1, startPlayer: 2 });
        expect(game.owners).toEqual([2, 3, 0, 1]);
        expect(game.actors()).toEqual([2]);
    });

    it('2人は先手が青と赤、後手が黄と緑', () => {
        const game = new Game(players(2), { seed: 1, startPlayer: 1 });
        expect(game.owners).toEqual([1, 0, 1, 0]);
    });

    it('3人は緑を交代で置く（先手から）', () => {
        const game = new Game(players(3), { seed: 1, startPlayer: 1 });
        expect(game.owners).toEqual([1, 2, 0, SHARED]);
        expect(game.seatOf(3)).toBe(1);
    });

    it('人数は2〜4人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(5))).toThrow();
    });

    it('得点法は上級が既定、基本も選べる', () => {
        expect(newGame(4, 1).options.scoring).toBe('advanced');
        expect(newGame(4, 1, 'basic').options.scoring).toBe('basic');
    });
});

describe('置き方', () => {
    it('最初のピースは、その色の角のマスを覆う', () => {
        const game = newGame();
        expect(place(game, 'I2', 0, 1, 0)).toBe(false);
        expect(game.lastError).toBe('最初は角のマスを覆います');
        expect(place(game, 'I2', 0, 0, 0)).toBe(true);
        // 黄は右上
        expect(place(game, 'I1', 0, 0, 19)).toBe(false);
        expect(place(game, 'I1', 0, 19, 0)).toBe(true);
    });

    it('同じ色と角で接すれば置け、辺で接すると置けない', () => {
        const game = newGame();
        paint(game, 0, 0, ['B']);
        game.colors[0].placed = 1;
        expect(canPlaceCells(game.board, 0, [[1, 1]], false)).toBe(true);
        expect(canPlaceCells(game.board, 0, [[1, 0]], false)).toBe(false);
        expect(canPlaceCells(game.board, 0, [[2, 2]], false)).toBe(false); // 接していない
        expect(canPlaceCells(game.board, 0, [[1, 1], [2, 1], [1, 0]], false)).toBe(false); // 角で接しても、辺でも接する
    });

    it('ほかの色とは辺で接してよい。重ねたり盤の外に出したりはできない', () => {
        const game = newGame();
        paint(game, 0, 0, ['B.', '.Y']);
        expect(canPlaceCells(game.board, 0, [[2, 1]], false)).toBe(false);
        paint(game, 2, 2, ['B']);
        expect(canPlaceCells(game.board, 0, [[1, 3], [2, 1]].slice(0, 1), false)).toBe(true);
        expect(canPlaceCells(game.board, 0, [[1, 1]], false)).toBe(false);
        expect(canPlaceCells(game.board, 0, [[-1, 1]], false)).toBe(false);
        expect(canPlaceCells(game.board, 0, [[3, 3], [3, 20]], false)).toBe(false);
    });

    it('置いたピースはなくなり、次の色の番になる。同じピースは2回置けない', () => {
        const game = newGame();
        expect(place(game, 'V3', 0, 0, 0)).toBe(true);
        expect(game.colors[0].pieces).not.toContain('V3');
        expect(game.current).toBe(1);
        game.current = 0;
        expect(place(game, 'V3', 0, 2, 2)).toBe(false);
    });

    it('起点のマスと置ける手は、ルールと一致する', () => {
        const game = newGame();
        place(game, 'I1', 0, 0, 0);
        expect(anchors(game.board, 0, false)).toEqual([[1, 1]]);
        const moves = legalMoves(game.board, 0, game.colors[0].pieces, false);
        moves.forEach(m => expect(canPlaceCells(game.board, 0, placedCells(m.piece, m.orient, m.x, m.y), false)).toBe(true));
        expect(moves.every(m => placedCells(m.piece, m.orient, m.x, m.y).some(([x, y]) => x === 1 && y === 1))).toBe(true);
    });

    it('置けない操作は断り、状態を変えない', () => {
        const game = newGame();
        const before = snapshot(game);
        [
            [1, { type: 'place', piece: 'I1', orient: 0, x: 0, y: 0 }],
            [0, { type: 'place', piece: 'I1', orient: 8, x: 0, y: 0 }],
            [0, { type: 'place', piece: 'I1', orient: 0, x: 0.5, y: 0 }],
            [0, { type: 'place', piece: 'Q9', orient: 0, x: 0, y: 0 }],
            [0, { type: 'pass' }],
            [0, null]
        ].forEach(([seat, command]) => expect(game.applyCommand(seat, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });
});

describe('パスと終わり', () => {
    it('置けない色は飛ばされ、もう番が来ない', () => {
        const game = newGame();
        // 黄の角をふさぐ
        paint(game, 19, 0, ['R']);
        place(game, 'I1', 0, 0, 0);
        expect(game.colors[1].out).toBe(true);
        expect(game.current).toBe(2);
    });

    it('どの色も置けなくなったら終わり', () => {
        const game = newGame();
        paint(game, 19, 0, ['R']);
        paint(game, 19, 19, ['G']);
        paint(game, 0, 19, ['Y']);
        // 青の起点も、1マスを置いたらなくなるように囲む
        paint(game, 1, 1, ['R']);
        place(game, 'I1', 0, 0, 0);
        expect(game.isOver()).toBe(true);
    });

    it('3人の緑は、置くたびに次の人へ回る', () => {
        const game = new Game(players(3), { seed: 1, startPlayer: 0 });
        place(game, 'I1', 0, 0, 0);
        place(game, 'I1', 0, 19, 0);
        place(game, 'I1', 0, 19, 19);
        expect(game.actors()).toEqual([0]);
        place(game, 'I1', 0, 0, 19);
        expect(game.sharedNext).toBe(1);
        place(game, 'I2', 0, 1, 1);
        place(game, 'I2', 0, 17, 1);
        place(game, 'I2', 0, 17, 18);
        expect(game.actors()).toEqual([1]);
    });
});

describe('得点', () => {
    const finished = (n, scoring, setup) => {
        const game = newGame(n, 1, scoring);
        setup(game);
        game.finish();
        return game;
    };

    it('上級：残り1マスで−1点、全部置けたら+15点、最後が1マスなら+20点', () => {
        const game = finished(4, 'advanced', (g) => {
            g.colors[0].pieces = [];
            g.colors[0].last = 'I1';
            g.colors[1].pieces = [];
            g.colors[1].last = 'X5';
            g.colors[2].pieces = ['I1', 'I5'];
        });
        expect(game.scores()).toEqual([20, 15, -6, -89]);
        expect(game.winners).toEqual([0]);
    });

    it('基本：残りのマスだけで比べる（ボーナスなし）', () => {
        const game = finished(4, 'basic', (g) => {
            g.colors[0].pieces = [];
            g.colors[0].last = 'I1';
            g.colors[1].pieces = ['I1'];
        });
        expect(game.scores()).toEqual([0, -1, -89, -89]);
    });

    it('2人は2色の合計、3人は緑を数えない', () => {
        const two = finished(2, 'advanced', (g) => { g.colors[0].pieces = ['I1']; g.colors[2].pieces = ['I2']; });
        expect(two.scores()).toEqual([-3, -178]);
        const three = finished(3, 'advanced', (g) => { g.colors[3].pieces = []; });
        expect(three.scores()).toEqual([-89, -89, -89]);
        expect(three.winners).toEqual([0, 1, 2]);
    });

    it('同点なら、同点の人がみな勝ち', () => {
        const game = finished(4, 'advanced', (g) => { g.colors[0].pieces = ['I1']; g.colors[2].pieces = ['I1']; });
        expect(game.winners).toEqual([0, 2]);
    });
});
