import { describe, it, expect } from 'vitest';
import Game, { compareScores } from '../public/js/game.js';
import { CELLS, CELL_COUNT, START_SYMBOLS, NEIGHBORS, radiusFor } from '../public/js/board.js';
import { allTiles, COLOR_ORDER } from '../public/js/colors.js';
import { players, newGame, at, setHand, paint, skipFirst, snapshot, totalTiles } from './helpers.js';

const place = (game, tile, cells) => game.applyCommand(game.current, { type: 'place', tile, cells });
const scoresOf = (list) => Object.fromEntries(COLOR_ORDER.map((c, i) => [c, list[i]]));

describe('盤とタイル', () => {
    it('盤は中心から距離7までの169マス。人数で使う範囲が 91・127・169 マス', () => {
        expect(CELL_COUNT).toBe(169);
        const within = (r) => CELLS.filter(c => c.ring <= r).length;
        expect([2, 3, 4].map(n => within(radiusFor(n)))).toEqual([91, 127, 169]);
        expect(radiusFor(1)).toBe(5);
    });

    it('印刷の記号は6色で、距離5の六角形の頂点にある', () => {
        expect([...START_SYMBOLS.values()].sort()).toEqual([...COLOR_ORDER].sort());
        START_SYMBOLS.forEach((_, cell) => {
            expect(CELLS[cell].ring).toBe(5);
            // 頂点なので、同じ距離のとなりは2つ
            expect(NEIGHBORS[cell].filter(nb => nb >= 0 && CELLS[nb].ring === 5).length).toBe(2);
        });
    });

    it('タイルは120枚：同じ色の組が各5枚、違う色の組が各6枚', () => {
        const tiles = allTiles();
        expect(tiles.length).toBe(120);
        const count = (a, b) => tiles.filter(t => (t[0] === a && t[1] === b) || (t[0] === b && t[1] === a)).length;
        COLOR_ORDER.forEach((a, i) => COLOR_ORDER.forEach((b, j) => {
            if (j >= i) expect(count(a, b), `${a}-${b}`).toBe(a === b ? 5 : 6);
        }));
    });

    it('各自6枚を持って始める。同じシードなら同じ袋', () => {
        const game = newGame(3, 4);
        expect(game.players.map(p => p.hand.length)).toEqual([6, 6, 6]);
        expect(game.bag.length).toBe(102);
        expect(snapshot(newGame(3, 4))).toBe(snapshot(game));
    });
});

describe('置く', () => {
    it('最初の手番は、まだとなりにタイルがない記号のとなりに置く', () => {
        const game = newGame(2);
        // 手札に6色がそろうようにする（置いたあとに取り替えの場面にならないように）
        setHand(game, 0, [['red', 'blue'], ['green', 'orange'], ['yellow', 'purple']]);
        setHand(game, 1, [['green', 'green'], ['red', 'orange'], ['yellow', 'purple'], ['blue', 'blue']]);
        expect(place(game, ['red', 'blue'], [at(0, 0), at(0, 1)])).toBe(false);
        expect(game.lastError).toContain('記号のとなり');
        expect(place(game, ['red', 'blue'], [at(0, -4), at(0, -3)])).toBe(true); // 紫の記号（0,-5）のとなり
        expect(game.current).toBe(1);
        // 紫の記号のとなりにはもうタイルがあるので、席1は紫の記号のとなりには置けない
        expect(place(game, ['green', 'green'], [at(1, -5), at(1, -4)])).toBe(false);
        expect(place(game, ['green', 'green'], [at(4, 0), at(3, 0)])).toBe(true); // 緑の記号（5,0）のとなり
    });

    it('2回目からは、範囲の中の空いたとなり合う2マスならどこでもよい', () => {
        const game = newGame(2);
        skipFirst(game);
        setHand(game, 0, [['red', 'blue']]);
        expect(place(game, ['red', 'blue'], [at(0, 0), at(2, 0)])).toBe(false); // となりでない
        expect(place(game, ['red', 'blue'], [at(0, -5), at(0, -4)])).toBe(false); // 記号のマス
        expect(place(game, ['red', 'blue'], [at(0, -6), at(0, -5) + 0])).toBe(false); // 2人では範囲の外（距離6）
        expect(place(game, ['red', 'blue'], [at(0, 0), at(0, 1)])).toBe(true);
        expect(place(game, ['green', 'green'], [at(0, 0), at(1, 0)])).toBe(false); // もう置いてある
    });

    it('3人なら距離6まで、4人なら7まで置ける', () => {
        const three = newGame(3);
        skipFirst(three);
        setHand(three, 0, [['red', 'blue']]);
        expect(place(three, ['red', 'blue'], [at(0, -6), at(1, -6)])).toBe(true);
        const four = newGame(4);
        skipFirst(four);
        setHand(four, 0, [['red', 'blue']]);
        expect(place(four, ['red', 'blue'], [at(0, -7), at(1, -7)])).toBe(true);
    });
});

describe('得点', () => {
    it('置いた記号から5方向に、まっすぐ同じ記号が続く数を数える（違う記号と空きで止まる）', () => {
        const game = newGame(2);
        skipFirst(game);
        setHand(game, 0, [['red', 'blue']]);
        paint(game, [at(1, 0)], ['red']);   // 右下に赤
        paint(game, [at(2, 0)], ['red']);   // その先も赤
        paint(game, [at(3, 0)], ['green']); // 違う記号で止まる
        paint(game, [at(4, 0)], ['red']);
        paint(game, [at(0, -1)], ['red']);  // 上に赤
        paint(game, [at(0, 2)], ['blue']);  // 青のマスの下に青
        place(game, ['red', 'blue'], [at(0, 0), at(0, 1)]);
        expect(game.sides[0].scores.red).toBe(3);
        expect(game.sides[0].scores.blue).toBe(1);
    });

    it('同じタイルのもう一方の記号は数えない。印刷の記号は数える', () => {
        const game = newGame(2);
        skipFirst(game);
        setHand(game, 0, [['red', 'red'], ['purple', 'green']]);
        paint(game, [at(0, -1)], ['red']);
        paint(game, [at(0, 2)], ['red']);
        place(game, ['red', 'red'], [at(0, 0), at(0, 1)]);
        expect(game.sides[0].scores.red).toBe(2); // 上と下の1つずつ。タイルどうしは数えない
        game.current = 0;
        place(game, ['purple', 'green'], [at(0, -4), at(0, -3)]); // 紫の印刷の記号のとなり
        expect(game.sides[0].scores.purple).toBe(1);
    });

    it('上限は18。18に届いたら、補充の前にもう1枚置く。2色が同時に届けば2枚', () => {
        const game = newGame(2);
        skipFirst(game);
        setHand(game, 0, [['red', 'blue'], ['green', 'green'], ['orange', 'orange'], ['yellow', 'yellow'], ['purple', 'purple'], ['red', 'red']]);
        game.sides[0].scores.red = 17;
        game.sides[0].scores.blue = 16;
        paint(game, [at(1, 0), at(2, 0)], ['red', 'red']);
        paint(game, [at(0, 2), at(0, 3)], ['blue', 'blue']);
        place(game, ['red', 'blue'], [at(0, 0), at(0, 1)]);
        expect(game.sides[0].scores.red).toBe(18); // 17+2 は 18 で止まる
        expect(game.sides[0].scores.blue).toBe(18);
        expect(game.current).toBe(0);
        expect(game.phase).toBe('place');
        expect(game.players[0].hand.length).toBe(5); // まだ補充しない
        expect(place(game, ['green', 'green'], [at(-2, 0), at(-2, 1)])).toBe(true);
        expect(game.current).toBe(0); // 2枚目のもう1枚
        expect(place(game, ['orange', 'orange'], [at(-3, 0), at(-3, 1)])).toBe(true);
        expect(game.current).toBe(1);
        expect(game.players[0].hand.length).toBe(6);
        // 18 のままの色で、もう一度もう1枚にはならない
        expect(game.logs.filter(l => l.includes('インジーニアス')).length).toBe(2);
    });

    it('6色とも18に届いたら、その場で勝ち', () => {
        const game = newGame(2);
        skipFirst(game);
        setHand(game, 0, [['red', 'red']]);
        COLOR_ORDER.forEach(c => { game.sides[0].scores[c] = 18; });
        game.sides[0].scores.red = 17;
        paint(game, [at(1, 0)], ['red']);
        place(game, ['red', 'red'], [at(0, 0), at(0, 1)]);
        expect(game.isOver()).toBe(true);
        expect(game.instantWin).toBe(true);
        expect(game.winners).toEqual([0]);
    });
});

describe('取り替え', () => {
    it('いちばん低い色の記号が手札にないとき、補充の前に取り替えられる', () => {
        const game = newGame(2);
        skipFirst(game);
        COLOR_ORDER.forEach(c => { game.sides[0].scores[c] = 5; });
        game.sides[0].scores.purple = 1; // 紫がいちばん低い
        setHand(game, 0, [['red', 'blue'], ['red', 'red'], ['green', 'green'], ['blue', 'blue'], ['orange', 'yellow'], ['yellow', 'yellow']]);
        const total = totalTiles(game);
        place(game, ['red', 'blue'], [at(0, 0), at(0, 1)]);
        expect(game.phase).toBe('swap');
        const old = game.players[0].hand.map(t => t.join());
        expect(game.applyCommand(0, { type: 'swap' })).toBe(true);
        expect(game.players[0].hand.length).toBe(6);
        expect(game.players[0].hand.map(t => t.join())).not.toEqual(old);
        expect(totalTiles(game)).toBe(total);
        expect(game.current).toBe(1);
    });

    it('取り替えないこともできる。並んで低い色のどれかがあれば取り替えられない', () => {
        const game = newGame(2);
        skipFirst(game);
        setHand(game, 0, [['red', 'blue'], ['red', 'red'], ['green', 'green'], ['blue', 'blue'], ['orange', 'yellow'], ['yellow', 'yellow']]);
        COLOR_ORDER.forEach(c => { game.sides[0].scores[c] = 5; });
        game.sides[0].scores.purple = 1;
        place(game, ['red', 'blue'], [at(0, 0), at(0, 1)]);
        expect(game.applyCommand(0, { type: 'keep' })).toBe(true);
        expect(game.players[0].hand.length).toBe(6);
        // 紫と赤が並んで低く、手札に赤がある → 取り替えられない
        const two = newGame(2);
        skipFirst(two);
        setHand(two, 0, [['red', 'blue'], ['red', 'red'], ['green', 'green'], ['blue', 'blue'], ['orange', 'yellow'], ['yellow', 'yellow']]);
        COLOR_ORDER.forEach(c => { two.sides[0].scores[c] = 5; });
        two.sides[0].scores.purple = 1;
        two.sides[0].scores.red = 1;
        place(two, ['blue', 'blue'], [at(0, 0), at(0, 1)]);
        expect(two.phase).toBe('place');
        expect(two.current).toBe(1);
    });
});

describe('終わりと勝ち負け', () => {
    it('置ける2マスがなくなったら終わる', () => {
        const game = newGame(2);
        skipFirst(game);
        setHand(game, 0, [['red', 'blue']]);
        for (let c = 0; c < CELL_COUNT; c++) {
            if (CELLS[c].ring <= 5 && game.board[c] === null && c !== at(0, 0) && c !== at(0, 1)) game.board[c] = 'green';
        }
        place(game, ['red', 'blue'], [at(0, 0), at(0, 1)]);
        expect(game.isOver()).toBe(true);
    });

    it('いちばん低い色の点で比べ、同じなら次に低い色で比べる', () => {
        const tina = scoresOf([10, 12, 13, 14, 15, 16]);
        const thomas = scoresOf([9, 12, 15, 16, 17, 18]);
        const carl = scoresOf([9, 12, 12, 16, 17, 18]);
        expect(compareScores(tina, thomas)).toBeGreaterThan(0);
        expect(compareScores(thomas, carl)).toBeGreaterThan(0);
        expect(compareScores(carl, carl)).toBe(0);
        const game = newGame(3);
        game.sides[0].scores = carl;
        game.sides[1].scores = thomas;
        game.sides[2].scores = { ...thomas };
        game.finish();
        expect(game.winners).toEqual([1, 2]);
        expect(game.finalScore(0)).toBe(9);
    });
});

describe('1人用と組み合わせ戦', () => {
    it('1人用：手札は1枚で、得点は36まで。もう1枚も取り替えもない', () => {
        const game = new Game(players(1), { seed: 2, mode: 'solo' });
        expect(game.players[0].hand.length).toBe(1);
        expect(game.radius).toBe(5);
        skipFirst(game);
        setHand(game, 0, [['red', 'red']]);
        game.sides[0].scores.red = 17;
        paint(game, [at(1, 0), at(2, 0)], ['red', 'red']);
        place(game, ['red', 'red'], [at(0, 0), at(0, 1)]);
        expect(game.sides[0].scores.red).toBe(20); // 17 + 2（上のマスから右下へ）+ 1（下のマスから右上へ）。36 までは止まらない
        expect(game.phase).toBe('place');
        expect(game.players[0].hand.length).toBe(1); // 次の1枚を引いた
        expect(game.bonus).toBe(0);
    });

    it('組み合わせ戦：向かいの2人が得点を共有し、18と36でもう1枚', () => {
        const game = new Game(players(4), { seed: 3, startPlayer: 0, mode: 'team' });
        expect(game.sides.map(s => s.members)).toEqual([[0, 2], [1, 3]]);
        expect(game.radius).toBe(7);
        skipFirst(game);
        setHand(game, 0, [['red', 'green'], ['blue', 'blue'], ['green', 'orange']]);
        game.sides[0].scores.red = 17;
        paint(game, [at(1, 0)], ['red']);
        place(game, ['red', 'green'], [at(0, 0), at(0, 1)]);
        expect(game.sides[0].scores.red).toBe(18);
        expect(game.current).toBe(0); // 18 でもう1枚
        place(game, ['blue', 'blue'], [at(-3, 0), at(-3, 1)]);
        expect(game.current).toBe(1);
        // 席2が置いても、同じ組の得点が上がる
        game.current = 2;
        setHand(game, 2, [['red', 'red'], ['purple', 'purple']]);
        game.sides[0].scores.red = 35;
        paint(game, [at(2, -3)], ['red']);
        place(game, ['red', 'red'], [at(2, -2), at(2, -1)]);
        expect(game.sides[0].scores.red).toBe(36);
        expect(game.current).toBe(2); // 36 でもう1枚
    });

    it('人数と遊び方が合わなければ作れない', () => {
        expect(() => new Game(players(3), { mode: 'team' })).toThrow();
        expect(() => new Game(players(2), { mode: 'solo' })).toThrow();
        expect(() => new Game(players(5))).toThrow();
    });
});

describe('断る操作', () => {
    it('番でない人・持っていないタイル・形の違う項目は断り、状態を変えない', () => {
        const game = newGame(2);
        setHand(game, 0, [['red', 'blue']]);
        const before = snapshot(game);
        const cells = [at(0, -4), at(0, -3)];
        expect(game.applyCommand(1, { type: 'place', tile: game.players[1].hand[0], cells })).toBe(false);
        expect(place(game, ['green', 'purple'], cells)).toBe(false);
        expect(place(game, ['red', 'pink'], cells)).toBe(false);
        expect(place(game, 'red', cells)).toBe(false);
        expect(place(game, ['red', 'blue'], [at(0, -4)])).toBe(false);
        expect(place(game, ['red', 'blue'], ['1', '2'])).toBe(false);
        expect(game.applyCommand(0, { type: 'swap' })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(snapshot(game)).toBe(before);
    });

    it('記録には決まった項目だけを残す。タイルの向きはそのまま残す', () => {
        const game = newGame(2);
        setHand(game, 0, [['red', 'blue']]);
        game.applyCommand(0, { type: 'place', tile: ['blue', 'red'], cells: [at(0, -4), at(0, -3)], extra: 1 });
        expect(game.commands).toEqual([{ playerId: 0, command: { type: 'place', tile: ['blue', 'red'], cells: [at(0, -4), at(0, -3)] } }]);
        expect(game.board[at(0, -4)]).toBe('blue');
        expect(game.board[at(0, -3)]).toBe('red');
    });
});
