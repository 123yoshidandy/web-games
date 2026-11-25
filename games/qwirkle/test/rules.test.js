import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { checkPlacements, isValidLine, largestSet, generateMoves, keyOf, colorOf, shapeOf } from '../public/js/board.js';
import { makeGame, players, T, setBoard, snapshot } from './helpers.js';

const boardOf = (cells) => new Map(cells.map(([x, y, t]) => [keyOf(x, y), t]));
const play = (cells) => cells.map(([x, y, tile]) => ({ x, y, tile }));

describe('タイル', () => {
    it('108枚で、6色×6形が3枚ずつ', () => {
        const game = makeGame(4);
        const all = [...game.bag, ...game.players.flatMap(p => p.hand)];
        expect(all).toHaveLength(108);
        const counts = new Map();
        all.forEach(t => counts.set(`${colorOf(t)}-${shapeOf(t)}`, (counts.get(`${colorOf(t)}-${shapeOf(t)}`) ?? 0) + 1));
        expect(counts.size).toBe(36);
        counts.forEach(n => expect(n).toBe(3));
    });

    it('手札は6枚ずつ。最初の手番は一番大きな組を持つ人', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = makeGame(3, seed);
            game.players.forEach(p => expect(p.hand).toHaveLength(6));
            const sizes = game.players.map(p => largestSet(p.hand));
            expect(game.firstSize).toBe(Math.max(...sizes));
            expect(game.current).toBe(sizes.indexOf(Math.max(...sizes)));
        }
    });

    it('列は、同じ色で形が違うか、同じ形で色が違う。6枚まで', () => {
        expect(isValidLine([T(0, 0), T(0, 1), T(0, 2)])).toBe(true);
        expect(isValidLine([T(0, 0), T(1, 0), T(2, 0)])).toBe(true);
        expect(isValidLine([T(0, 0), T(0, 0, 1)])).toBe(false);
        expect(isValidLine([T(0, 0), T(1, 1)])).toBe(false);
        expect(isValidLine([0, 1, 2, 3, 4, 5].map(s => T(2, s)))).toBe(true);
        expect(largestSet([T(0, 0), T(0, 1), T(0, 1, 1), T(1, 0), T(2, 0), T(3, 0)])).toBe(4);
    });
});

describe('置き方と得点', () => {
    const base = [[0, 0, T(0, 0)], [1, 0, T(0, 1)], [2, 0, T(0, 2)]];

    it('最初は一番大きな組の枚数を置く。1枚だけなら1点', () => {
        expect(checkPlacements(new Map(), play([[0, 0, T(0, 0)], [1, 0, T(0, 1)]]), { firstSize: 3 }).ok).toBe(false);
        expect(checkPlacements(new Map(), play([[0, 0, T(0, 0)], [1, 0, T(0, 1)], [2, 0, T(0, 2)]]), { firstSize: 3 }).score).toBe(3);
        expect(checkPlacements(new Map(), play([[0, 0, T(0, 0)]]), { firstSize: 1 }).score).toBe(1);
    });

    it('すでにあるタイルに接して置く。列を伸ばすと列の枚数が得点', () => {
        const board = boardOf(base);
        expect(checkPlacements(board, play([[5, 5, T(0, 3)]])).ok).toBe(false);
        const r = checkPlacements(board, play([[3, 0, T(0, 3)]]));
        expect(r.ok).toBe(true);
        expect(r.score).toBe(4);
    });

    it('置くタイルは1本の線の上。間に空きがあってはならないが、すでにあるタイルをはさむのはよい', () => {
        const board = boardOf(base);
        // 両端に置く：つながっているのでよい（5点）
        const both = checkPlacements(board, play([[-1, 0, T(0, 3)], [3, 0, T(0, 4)]]));
        expect(both.ok).toBe(true);
        expect(both.score).toBe(5);
        // 違う線の上
        expect(checkPlacements(board, play([[3, 0, T(0, 3)], [0, 1, T(0, 4)]])).ok).toBe(false);
        // 間が空く
        expect(checkPlacements(board, play([[3, 0, T(0, 3)], [5, 0, T(0, 4)]])).ok).toBe(false);
    });

    it('置くタイルどうしも、同じ色か同じ形で重複なし', () => {
        const board = boardOf(base);
        expect(checkPlacements(board, play([[0, 1, T(1, 0)], [1, 1, T(2, 1)]])).ok).toBe(false);
    });

    it('2つの列にまたがると、両方の列の枚数が得点', () => {
        // 赤の円・クロス・ひし形の下に、青の円・クロス（形の列が2本と、青の列）
        const board = boardOf(base);
        const r = checkPlacements(board, play([[0, 1, T(4, 0)], [1, 1, T(4, 1)]]));
        expect(r.ok).toBe(true);
        expect(r.score).toBe(2 + 2 + 2);
    });

    it('同じ種類が並ぶ列や、色も形も合わない列はできない', () => {
        const board = boardOf(base);
        expect(checkPlacements(board, play([[3, 0, T(0, 0, 1)]])).ok).toBe(false);
        expect(checkPlacements(board, play([[3, 0, T(1, 3)]])).ok).toBe(false);
        expect(checkPlacements(board, play([[0, 1, T(1, 3)]])).ok).toBe(false);
    });

    it('6枚の列（クワークル）は +6。7枚目は置けない', () => {
        const board = boardOf([0, 1, 2, 3, 4].map(s => [s, 0, T(1, s)]));
        const r = checkPlacements(board, play([[5, 0, T(1, 5)]]));
        expect(r.qwirkles).toBe(1);
        expect(r.score).toBe(12);
        const full = boardOf([0, 1, 2, 3, 4, 5].map(s => [s, 0, T(1, s)]));
        expect(checkPlacements(full, play([[6, 0, T(1, 0, 1)]])).ok).toBe(false);
    });

    it('置ける手を全部挙げる（どれも正しい置き方）', () => {
        const board = boardOf(base);
        const moves = generateMoves(board, [T(0, 3), T(0, 4), T(4, 0), T(5, 5), T(0, 3, 1), T(1, 1)]);
        expect(moves.length).toBeGreaterThan(5);
        moves.forEach(m => expect(checkPlacements(board, m.placements).ok).toBe(true));
        expect(moves.some(m => m.placements.length === 2 && m.score === 5)).toBe(true);
    });
});

describe('手番の進行', () => {
    it('置くと得点が入り、6枚まで引いて次の人へ', () => {
        const game = makeGame(2, 3);
        const seat = game.current;
        const move = game.movesFor(seat)[0];
        const bag = game.bag.length;
        expect(game.applyCommand(seat, { type: 'play', placements: move.placements })).toBe(true);
        expect(game.players[seat].score).toBe(move.score);
        expect(game.players[seat].hand).toHaveLength(6);
        expect(game.bag.length).toBe(bag - move.placements.length);
        expect(game.current).toBe(1 - seat);
    });

    it('最初の手番は交換できない。持っていないタイルは置けない', () => {
        const game = makeGame(2, 3);
        const seat = game.current;
        expect(game.applyCommand(seat, { type: 'trade', tiles: [game.players[seat].hand[0]] })).toBe(false);
        const other = game.bag[0];
        expect(game.applyCommand(seat, { type: 'play', placements: [{ x: 0, y: 0, tile: other }] })).toBe(false);
    });

    it('交換：同じ枚数を引き、出したタイルは袋に戻る。袋の枚数までしかできない', () => {
        const game = makeGame(2, 3);
        const seat = game.current;
        game.applyCommand(seat, { type: 'play', placements: game.movesFor(seat)[0].placements });
        const p = game.players[game.current];
        const out = p.hand.slice(0, 3);
        const bag = game.bag.length;
        expect(game.applyCommand(p.id, { type: 'trade', tiles: out })).toBe(true);
        expect(p.hand).toHaveLength(6);
        expect(game.bag.length).toBe(bag);
        out.forEach(t => expect(game.bag).toContain(t));
        const q = game.players[game.current];
        game.bag = game.bag.slice(0, 2);
        expect(game.applyCommand(q.id, { type: 'trade', tiles: q.hand.slice(0, 3) })).toBe(false);
    });

    it('袋があるうちはパスできない', () => {
        const game = makeGame(2, 3);
        expect(game.applyCommand(game.current, { type: 'pass' })).toBe(false);
    });

    it('袋が空で、最初に手札を出し切った人が +6。そこで終わる', () => {
        const game = makeGame(2, 3);
        const seat = game.current;
        setBoard(game, [[0, 0, T(0, 0)], [1, 0, T(0, 1)]]);
        game.bag = [];
        game.players[seat].hand = [T(0, 2)];
        expect(game.applyCommand(seat, { type: 'play', placements: [{ x: 2, y: 0, tile: T(0, 2) }] })).toBe(true);
        expect(game.players[seat].score).toBe(3 + 6);
        expect(game.isOver()).toBe(true);
        expect(game.endReason).toBe('out');
        expect(game.winners).toEqual([seat]);
    });

    it('袋が空で置けなければパス。全員が続けてパスしたら終わる', () => {
        const game = makeGame(2, 3);
        // 盤には赤の円だけ。手札は色も形も違うオレンジのクロスなので、どこにも置けない
        setBoard(game, [[0, 0, T(0, 0)]]);
        game.bag = [];
        game.players.forEach(p => { p.hand = [T(1, 1)]; });
        expect(game.movesFor(game.current)).toHaveLength(0);
        expect(game.applyCommand(game.current, { type: 'pass' })).toBe(true);
        expect(game.applyCommand(game.current, { type: 'pass' })).toBe(true);
        expect(game.isOver()).toBe(true);
        expect(game.endReason).toBe('stuck');
    });

    it('断った操作は状態を変えない', () => {
        const game = makeGame(3, 9);
        const before = snapshot(game);
        const seat = game.current;
        [
            [(seat + 1) % 3, { type: 'play', placements: game.movesFor(seat)[0].placements }],
            [seat, { type: 'play', placements: [] }],
            [seat, { type: 'play', placements: [{ x: 'a', y: 0, tile: 0 }] }],
            [seat, { type: 'play', placements: [{ x: 0, y: 0, tile: 999 }] }],
            [seat, { type: 'trade', tiles: [] }],
            [seat, { type: 'pass' }],
            [seat, { type: 'nope' }],
            [seat, null]
        ].forEach(([s, c]) => expect(game.applyCommand(s, c)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('記録から同じゲームを再現できる。余計な項目は記録しない', () => {
        const game = makeGame(2, 11);
        const seat = game.current;
        const move = game.movesFor(seat)[0];
        game.applyCommand(seat, { type: 'play', placements: move.placements.map(p => ({ ...p, extra: 1 })), junk: 'x' });
        expect(Object.keys(game.commands[0].command)).toEqual(['type', 'placements']);
        expect(Object.keys(game.commands[0].command.placements[0])).toEqual(['x', 'y', 'tile']);
        const other = game.current;
        game.applyCommand(other, { type: 'trade', tiles: game.players[other].hand.slice(0, 2) });
        const saved = JSON.parse(JSON.stringify(game.persist()));
        expect(snapshot(Game.replay(saved.players, saved.options, saved.commands))).toBe(snapshot(game));
    });

    it('人数は2〜4人', () => {
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(5))).toThrow();
    });
});
