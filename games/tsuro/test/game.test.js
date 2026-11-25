import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { TILE_COUNT } from '../public/js/tiles.js';
import { newGame, players, startPlay, findTile, setHand, snapshot, tileTotal } from './helpers.js';

const STRAIGHT = { 0: 5 };                      // 上の左寄りから、下の左寄りへ
const UTURN_ALL = { 0: 1, 2: 3, 4: 5, 6: 7 };   // どの辺でも折り返す（どの向きでも同じ形）

const play = (game, seat, placement) => game.applyCommand(seat, { type: 'play', tile: placement.tile, rotation: placement.rot });

describe('準備', () => {
    it('各自に3枚ずつ配り、残りが山になる。同じシードなら同じ配り方', () => {
        [2, 5, 8].forEach(n => {
            const game = newGame(n, 7);
            game.players.forEach(p => expect(p.hand).toHaveLength(3));
            expect(game.pile).toHaveLength(TILE_COUNT - 3 * n);
            expect(tileTotal(game)).toBe(TILE_COUNT);
            expect(snapshot(newGame(n, 7))).toBe(snapshot(game));
        });
        expect(() => new Game(players(1))).toThrow();
        expect(() => new Game(players(9))).toThrow();
    });

    it('竜のタイルは3人以上のときだけ使う', () => {
        expect(newGame(2).useDragon).toBe(false);
        expect(newGame(3).useDragon).toBe(true);
    });

    it('最初の人から時計回りに縁の印へ駒を置き、全員が置いたら最初の人がタイルを置く', () => {
        const game = newGame(3, 3);
        const first = game.first;
        expect(game.phase).toBe('place');
        expect(game.actors()).toEqual([first]);
        expect(game.applyCommand(first, { type: 'play', tile: game.players[first].hand[0], rotation: 0 })).toBe(false);
        expect(game.applyCommand(first, { type: 'place', mark: 10 })).toBe(true);
        const second = (first + 1) % 3;
        expect(game.actors()).toEqual([second]);
        expect(game.applyCommand(second, { type: 'place', mark: 10 })).toBe(false);
        expect(game.applyCommand(second, { type: 'place', mark: 48 })).toBe(false);
        expect(game.applyCommand(second, { type: 'place', mark: 11 })).toBe(true);
        expect(game.applyCommand((first + 2) % 3, { type: 'place', mark: 30 })).toBe(true);
        expect(game.phase).toBe('play');
        expect(game.actors()).toEqual([first]);
        expect(game.players[first].pos).toEqual({ cell: 5, p: 0 });  // 印10：右上のマスの、上の左寄り
    });
});

describe('タイルを置いて駒を動かす', () => {
    it('駒は置いたタイルの道に沿って進み、次の空いたマスの前で止まる', () => {
        const game = startPlay(newGame(2), [{ cell: 0, p: 0 }, { cell: 35, p: 4 }]);
        const t = findTile(STRAIGHT);
        setHand(game, 0, [t.tile]);
        expect(play(game, 0, t)).toBe(true);
        expect(game.players[0].pos).toEqual({ cell: 6, p: 0 });
        expect(game.players[0].trail).toEqual([[0, 0, 5]]);
        expect(game.board[0]).toEqual({ tile: t.tile, rot: t.rot, seat: 0 });
        expect(game.players[0].hand).toHaveLength(3);  // 手札が3枚に満たないので、3枚になるまで引く
        expect(game.current).toBe(1);
        expect(tileTotal(game)).toBe(TILE_COUNT);
    });

    it('置いてあるタイルの道もたどって進む', () => {
        const game = startPlay(newGame(2), [{ cell: 0, p: 0 }, { cell: 35, p: 4 }]);
        const a = findTile(STRAIGHT);
        const b = findTile(STRAIGHT, { except: [a.tile] });
        game.board[6] = { tile: b.tile, rot: b.rot, seat: 1 };
        setHand(game, 0, [a.tile]);
        expect(play(game, 0, a)).toBe(true);
        expect(game.players[0].pos).toEqual({ cell: 12, p: 0 });
        expect(game.players[0].trail).toEqual([[0, 0, 5], [6, 0, 5]]);
    });

    it('自分の道を盤の縁につなぐ置き方は、ほかに置き方があればできない（状態は変わらない）', () => {
        const game = startPlay(newGame(2), [{ cell: 0, p: 0 }, { cell: 35, p: 4 }]);
        const bad = findTile(UTURN_ALL);
        const good = findTile(STRAIGHT);
        setHand(game, 0, [bad.tile, good.tile]);
        const before = snapshot(game);
        expect(play(game, 0, bad)).toBe(false);
        expect(game.lastError).toContain('脱落');
        expect(snapshot(game)).toBe(before);
    });

    it('ほかに置き方がなければ、自分から盤の外に出る置き方もでき、脱落する', () => {
        const game = startPlay(newGame(3), [{ cell: 0, p: 0 }, { cell: 35, p: 4 }, { cell: 5, p: 1 }]);
        const bad = findTile(UTURN_ALL);
        setHand(game, 0, [bad.tile]);
        expect(play(game, 0, bad)).toBe(true);
        expect(game.players[0].alive).toBe(false);
        expect(game.players[0].out).toBe('edge');
        expect(game.isOver()).toBe(false);
        expect(game.current).toBe(1);
    });

    it('置いたタイルに面しているほかの駒も動き、出会った2つの駒は両方とも脱落する', () => {
        // 席0は下へ抜ける。席1（左の下寄り）と席2（左の上寄り）は同じ道の両側から進んで出会う
        const game = startPlay(newGame(4), [{ cell: 0, p: 0 }, { cell: 0, p: 6 }, { cell: 0, p: 7 }, { cell: 35, p: 4 }]);
        const t = findTile({ 0: 4, 6: 7 });
        setHand(game, 0, [t.tile, ...game.players[0].hand.filter(x => x !== t.tile).slice(0, 2)]);
        const returned = game.players[1].hand.length + game.players[2].hand.length;
        const pileBefore = game.pile.length;
        expect(play(game, 0, t)).toBe(true);
        expect(game.players[0].pos).toEqual({ cell: 6, p: 1 });
        expect([game.players[1].out, game.players[2].out]).toEqual(['collision', 'collision']);
        // 脱落した人の手札は山に戻り、手番の人が1枚引く
        expect(game.players[1].hand).toEqual([]);
        expect(game.pile.length).toBe(pileBefore + returned - 1);
        expect(tileTotal(game)).toBe(TILE_COUNT);
        expect(game.current).toBe(3);
    });

    it('ほかの駒とぶつかる置き方も、自分から脱落する置き方として、ほかに置き方があればできない', () => {
        const game = startPlay(newGame(2), [{ cell: 0, p: 0 }, { cell: 0, p: 7 }]);
        const bad = findTile({ 0: 7 });
        const good = findTile(STRAIGHT, { except: [bad.tile] });
        setHand(game, 0, [bad.tile, good.tile]);
        expect(game.selfOut(0, bad.tile, bad.rot)).toBe(true);
        expect(play(game, 0, bad)).toBe(false);
    });

    it('断る操作は状態を変えない', () => {
        const game = startPlay(newGame(3), [{ cell: 0, p: 0 }, { cell: 35, p: 4 }, { cell: 5, p: 1 }]);
        const before = snapshot(game);
        const tile = game.players[0].hand[0];
        const notMine = game.players[1].hand[0];
        [
            [1, { type: 'play', tile: notMine, rotation: 0 }],
            [0, { type: 'play', tile: notMine, rotation: 0 }],
            [0, { type: 'play', tile, rotation: 4 }],
            [0, { type: 'play', tile, rotation: 1.5 }],
            [0, { type: 'play', tile: String(tile), rotation: 0 }],
            [0, { type: 'place', mark: 3 }],
            [0, { type: 'proxy' }],
            [0, null]
        ].forEach(([seat, command]) => expect(game.applyCommand(seat, command)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });
});

describe('引く・竜のタイル', () => {
    const A = STRAIGHT;           // 席0：マス0の上から入り、下のマス6へ
    const B = { 1: 4 };           // 席1：マス5の上から入り、下のマス11へ

    it('2人のときは竜のタイルを使わず、山が空なら引かない', () => {
        const game = startPlay(newGame(2), [{ cell: 0, p: 0 }, { cell: 5, p: 1 }]);
        const a = findTile(A);
        setHand(game, 0, [a.tile, ...game.players[0].hand.filter(x => x !== a.tile).slice(0, 2)]);
        game.pile = [];
        expect(play(game, 0, a)).toBe(true);
        expect(game.dragon).toBe(null);
        expect(game.players[0].hand).toHaveLength(2);
    });

    it('山が空で引けない人が竜のタイルを取り、タイルが戻ると竜のタイルの人から順に引く', () => {
        // 席3は席2と同じマスに面していて、席2の置いたタイルで盤の外に出る（手札2枚が山に戻る）
        const game = startPlay(newGame(4), [{ cell: 0, p: 0 }, { cell: 5, p: 1 }, { cell: 30, p: 5 }, { cell: 30, p: 6 }]);
        const a = findTile(A);
        const b = findTile(B, { except: [a.tile] });
        const c = findTile({ 5: 1, 6: 7 }, { except: [a.tile, b.tile] });
        const used = [a.tile, b.tile, c.tile];
        const rest = Array.from({ length: TILE_COUNT }, (_, i) => i).filter(t => !used.includes(t));
        game.players[0].hand = [a.tile, rest[0], rest[1]];
        game.players[1].hand = [b.tile, rest[2], rest[3]];
        game.players[2].hand = [c.tile, rest[4], rest[5]];
        game.players[3].hand = [rest[6], rest[7]];
        game.pile = [];
        expect(play(game, 0, a)).toBe(true);
        expect(game.dragon).toBe(0);
        expect(play(game, 1, b)).toBe(true);
        expect(game.dragon).toBe(0);        // 竜のタイルはもう取られている
        expect(game.players[1].hand).toHaveLength(2);
        expect(play(game, 2, c)).toBe(true);
        expect(game.players[3].out).toBe('edge');
        // 戻った2枚は、竜のタイルの席0、続いて席1が引く。手番の席2は引けず、竜のタイルを取る
        expect(game.players.map(p => p.hand.length)).toEqual([3, 3, 2, 0]);
        expect(game.dragon).toBe(2);
        expect(game.pile).toEqual([]);
    });

    it('竜のタイルを持つ人が脱落したら、時計回りで次の、手札が3枚に満たない人に渡す', () => {
        // 席0が竜のタイルを取り、席2の置いたタイルで盤の外に出る
        const game = startPlay(newGame(3), [{ cell: 0, p: 0 }, { cell: 5, p: 1 }, { cell: 6, p: 6 }]);
        const a = findTile(A);
        const b = findTile(B, { except: [a.tile] });
        const c = findTile({ 0: 7, 6: 2 }, { except: [a.tile, b.tile] });
        const used = [a.tile, b.tile, c.tile];
        const rest = Array.from({ length: TILE_COUNT }, (_, i) => i).filter(t => !used.includes(t));
        game.players[0].hand = [a.tile, rest[0], rest[1]];
        game.players[1].hand = [b.tile, rest[2], rest[3]];
        game.players[2].hand = [c.tile, rest[4], rest[5]];
        game.pile = [];
        play(game, 0, a);
        play(game, 1, b);
        expect(game.dragon).toBe(0);
        expect(play(game, 2, c)).toBe(true);
        expect(game.players[0].out).toBe('edge');
        // 竜のタイルは席1へ。席1から引き、引いたら手放す。続いて席2が引く
        expect(game.players.map(p => p.hand.length)).toEqual([0, 3, 3]);
        expect(game.dragon).toBe(null);
        expect(game.isOver()).toBe(false);
    });

    it('手札のない人の番は飛ばす', () => {
        const game = startPlay(newGame(3), [{ cell: 0, p: 0 }, { cell: 5, p: 1 }, { cell: 30, p: 5 }]);
        const a = findTile(A);
        setHand(game, 0, [a.tile, ...game.players[0].hand.filter(x => x !== a.tile).slice(0, 2)]);
        game.pile = [];
        game.dragon = 2;
        game.players[1].hand = [];
        expect(play(game, 0, a)).toBe(true);
        expect(game.current).toBe(2);
    });
});

describe('終わり', () => {
    it('盤に残った駒が1つになったら、その人の勝ち', () => {
        const game = startPlay(newGame(3), [{ cell: 0, p: 0 }, { cell: 0, p: 6 }, { cell: 0, p: 7 }]);
        const t = findTile({ 0: 4, 6: 7 });
        setHand(game, 0, [t.tile]);
        expect(play(game, 0, t)).toBe(true);
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([0]);
        expect(game.actors()).toEqual([]);
        expect(game.applyCommand(0, { type: 'play', tile: game.players[0].hand[0], rotation: 0 })).toBe(false);
    });

    it('残りの全員が同じ手で脱落したら、その人たちの引き分け', () => {
        const game = startPlay(newGame(2), [{ cell: 0, p: 0 }, { cell: 0, p: 6 }]);
        const t = findTile(UTURN_ALL);
        setHand(game, 0, [t.tile]);
        expect(play(game, 0, t)).toBe(true);
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([0, 1]);
    });

    it('タイルがすべて置かれたときに残っている人たちの引き分け', () => {
        const game = startPlay(newGame(3), [{ cell: 0, p: 0 }, { cell: 35, p: 4 }, { cell: 5, p: 1 }]);
        const t = findTile(STRAIGHT);
        setHand(game, 0, [t.tile]);
        game.placed = TILE_COUNT - 1;
        expect(play(game, 0, t)).toBe(true);
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([0, 1, 2]);
    });
});
