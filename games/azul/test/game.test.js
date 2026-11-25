import { describe, it, expect } from 'vitest';
import Game, {
    FACTORY_COUNTS, FIRST, wallColor, wallColumn, placementScore, canPlaceInLine, floorPenaltyFor,
    countRows, countColumns, countColors
} from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { newGame, PLAYERS, wallFrom, countTiles, playRandom, snapshot } from './helpers.js';

const take = (source, color, line) => ({ type: 'take', source, color, line });

describe('準備', () => {
    it.each([[2, 5], [3, 7], [4, 9]])('%i人なら工房は%i枚で、4枚ずつ並ぶ', (n, factories) => {
        const game = newGame(n, 7);
        expect(FACTORY_COUNTS[n]).toBe(factories);
        expect(game.factories).toHaveLength(factories);
        expect(game.factories.every(f => f.length === 4)).toBe(true);
        expect(game.bag).toHaveLength(100 - factories * 4);
        expect(game.center).toEqual([]);
        expect(game.firstInCenter).toBe(true);
        expect(game.round).toBe(1);
        expect(game.current).toBe(game.startSeat);
        expect(countTiles(game)).toBe(100);
    });

    it('各色20枚ずつ', () => {
        const game = newGame(4, 3);
        const all = [...game.bag, ...game.factories.flat()];
        for (let color = 0; color < 5; color++) expect(all.filter(t => t === color)).toHaveLength(20);
    });

    it('人数が範囲の外なら作れない', () => {
        expect(() => new Game(PLAYERS(1), { seed: 1 })).toThrow();
        expect(() => new Game(PLAYERS(5), { seed: 1 })).toThrow();
    });

    it('同じシードなら同じ並び', () => {
        expect(snapshot(newGame(3, 42))).toBe(snapshot(newGame(3, 42)));
        expect(snapshot(newGame(3, 42))).not.toBe(snapshot(newGame(3, 43)));
    });

    it('壁の色は段ごとに右へ1つずれる', () => {
        expect([0, 1, 2, 3, 4].map(c => wallColor(0, c))).toEqual([0, 1, 2, 3, 4]);
        expect([0, 1, 2, 3, 4].map(c => wallColor(1, c))).toEqual([4, 0, 1, 2, 3]);
        for (let row = 0; row < 5; row++) {
            for (let color = 0; color < 5; color++) expect(wallColor(row, wallColumn(row, color))).toBe(color);
        }
    });
});

describe('タイルを取る', () => {
    it('工房から1色を全部取り、残りは中央へ', () => {
        const game = newGame(2, 1);
        game.factories[0] = [0, 0, 1, 2];
        const seat = game.current;
        expect(game.applyCommand(seat, take(0, 0, 1))).toBe(true);
        expect(game.factories[0]).toEqual([]);
        expect(game.center.sort()).toEqual([1, 2]);
        expect(game.players[seat].lines[1]).toEqual({ color: 0, count: 2 });
        expect(game.current).toBe((seat + 1) % 2);
        expect(game.firstInCenter).toBe(true);
    });

    it('入りきらない分は床ラインへ', () => {
        const game = newGame(2, 1);
        game.factories[0] = [3, 3, 3, 1];
        const seat = game.current;
        game.applyCommand(seat, take(0, 3, 0));
        expect(game.players[seat].lines[0]).toEqual({ color: 3, count: 1 });
        expect(game.players[seat].floor).toEqual([3, 3]);
    });

    it('床ラインへ直接置ける', () => {
        const game = newGame(2, 1);
        game.factories[0] = [2, 2, 1, 1];
        const seat = game.current;
        game.applyCommand(seat, take(0, 2, 'floor'));
        expect(game.players[seat].floor).toEqual([2, 2]);
        expect(game.players[seat].lines.every(l => l.count === 0)).toBe(true);
    });

    it('中央から最初に取った人は先手マーカーも取り、床ラインの左に置く', () => {
        const game = newGame(2, 1);
        game.factories[0] = [0, 1, 1, 1];
        const a = game.current;
        game.applyCommand(a, take(0, 1, 2)); // 中央に 0 が1枚
        const b = game.current;
        game.factories[1] = [4, 4, 0, 0];
        game.applyCommand(b, take('center', 0, 4));
        expect(game.firstInCenter).toBe(false);
        expect(game.firstTakenBy).toBe(b);
        expect(game.players[b].floor).toEqual([FIRST]);
        expect(game.players[b].lines[4]).toEqual({ color: 0, count: 1 });
        // 2人目以降は取らない
        game.applyCommand(a, take(1, 4, 3));
        game.applyCommand(b, take('center', 0, 4));
        expect(game.players[b].floor).toEqual([FIRST]);
        expect(game.players[b].lines[4]).toEqual({ color: 0, count: 3 });
    });

    it('床ラインが埋まったら、残りは箱のふたへ', () => {
        const game = newGame(2, 1);
        const seat = game.current;
        game.players[seat].floor = [1, 1, 1, 1, 1];
        game.factories[0] = [2, 2, 2, 2];
        const lid = game.lid.length;
        game.applyCommand(seat, take(0, 2, 'floor'));
        expect(game.players[seat].floor).toEqual([1, 1, 1, 1, 1, 2, 2]);
        expect(game.lid.length).toBe(lid + 2);
    });

    it('床ラインが埋まっていても、先手マーカーを取れば次の先手になる', () => {
        const game = newGame(2, 1);
        const a = game.current;
        game.factories[0] = [0, 1, 1, 1];
        game.applyCommand(a, take(0, 1, 2));
        const b = game.current;
        game.players[b].floor = [3, 3, 3, 3, 3, 3, 3];
        game.applyCommand(b, take('center', 0, 'floor'));
        expect(game.players[b].floor).toHaveLength(7);
        expect(game.firstTakenBy).toBe(b);
    });
});

describe('断る操作', () => {
    const cases = [
        ['手番でない', g => g.applyCommand((g.current + 1) % 2, take(0, g.factories[0][0], 'floor'))],
        ['ない色', g => { g.factories[0] = [1, 1, 1, 1]; return g.applyCommand(g.current, take(0, 2, 'floor')); }],
        ['違う色が入った段', g => {
            g.factories[0] = [1, 1, 1, 1];
            g.players[g.current].lines[3] = { color: 2, count: 1 };
            return g.applyCommand(g.current, take(0, 1, 3));
        }],
        ['埋まった段', g => {
            g.factories[0] = [1, 1, 1, 1];
            g.players[g.current].lines[1] = { color: 1, count: 2 };
            return g.applyCommand(g.current, take(0, 1, 1));
        }],
        ['壁にもう同じ色がある段', g => {
            g.factories[0] = [1, 1, 1, 1];
            g.players[g.current].wall[2][wallColumn(2, 1)] = true;
            return g.applyCommand(g.current, take(0, 1, 2));
        }],
        ['範囲の外の工房', g => g.applyCommand(g.current, take(9, 0, 'floor'))],
        ['空の中央', g => g.applyCommand(g.current, take('center', 0, 'floor'))],
        ['段の番号が不正', g => { g.factories[0] = [1, 1, 1, 1]; return g.applyCommand(g.current, take(0, 1, 5)); }],
        ['種類が不正', g => g.applyCommand(g.current, { type: 'pass' })],
        ['形が不正', g => g.applyCommand(g.current, null)]
    ];
    it.each(cases)('%s：断り、状態を変えない', (_, act) => {
        const game = newGame(2, 5);
        // 書き換えたあとの状態を基準にするため、操作の中で書き換えてから比べる
        const before = { value: null };
        const original = game.applyCommand.bind(game);
        game.applyCommand = (seat, command) => {
            before.value = snapshot(game);
            return original(seat, command);
        };
        expect(act(game)).toBe(false);
        expect(game.lastError).toBeTruthy();
        expect(snapshot(game)).toBe(before.value);
        expect(game.commands).toHaveLength(0);
    });

    it('終わったゲームでは断る', () => {
        const game = newGame(2, 9);
        playRandom(game, 9);
        expect(game.isOver).toBe(true);
        const before = snapshot(game);
        expect(game.applyCommand(game.current, take(0, 0, 'floor'))).toBe(false);
        expect(snapshot(game)).toBe(before);
    });
});

describe('得点', () => {
    it('隣がなければ1点', () => {
        const wall = wallFrom(['x....', '.....', '.....', '.....', '.....']);
        expect(placementScore(wall, 0, 0)).toBe(1);
    });
    it('横につながった数', () => {
        const wall = wallFrom(['xxx..', '.....', '.....', '.....', '.....']);
        expect(placementScore(wall, 0, 2)).toBe(3);
    });
    it('縦横の両方につながれば両方を足す', () => {
        // 公式の例と同じ形：横に3、縦に4
        const wall = wallFrom(['.....', '..x..', 'xxx..', '..x..', '.....']);
        wall[2][2] = true;
        expect(placementScore(wall, 2, 2)).toBe(3 + 3);
        wall[4][2] = true;
        expect(placementScore(wall, 2, 2)).toBe(3 + 4);
    });
    it('間が空いていればつながらない', () => {
        const wall = wallFrom(['x.x..', '.....', '.....', '.....', '.....']);
        expect(placementScore(wall, 0, 2)).toBe(1);
    });
    it('床の失点', () => {
        expect(floorPenaltyFor(0, 1)).toBe(-1);
        expect(floorPenaltyFor(0, 7)).toBe(-14);
        expect(floorPenaltyFor(0, 9)).toBe(-14);
        expect(floorPenaltyFor(2, 2)).toBe(-4);
    });
    it('列・色の数え方', () => {
        const wall = wallFrom(['xxxxx', 'x....', 'x....', 'x....', 'x....']);
        expect(countRows(wall)).toBe(1);
        expect(countColumns(wall)).toBe(1);
        expect(countColors(wall)).toBe(0);
        const diag = wallFrom(['x....', '.x...', '..x..', '...x.', '....x']);
        expect(countColors(diag)).toBe(1); // 色0（青）は対角に並ぶ
    });
    it('置けるかの判定', () => {
        const player = { lines: [{ color: null, count: 0 }, { color: 2, count: 1 }, { color: null, count: 0 }, { color: null, count: 0 }, { color: null, count: 0 }],
            wall: wallFrom(['x....', '.....', '.....', '.....', '.....']) };
        expect(canPlaceInLine(player, 0, 0)).toBe(false); // 壁に青がある
        expect(canPlaceInLine(player, 0, 1)).toBe(true);
        expect(canPlaceInLine(player, 1, 2)).toBe(true);
        expect(canPlaceInLine(player, 1, 3)).toBe(false);
    });
});

function clearTable(game) {
    game.lid.push(...game.factories.flat(), ...game.center);
    game.factories = game.factories.map(() => []);
    game.center = [];
}

describe('ラウンドの終わり', () => {
    // 工房と中央を空にし、最後の1手で終わる形を作る
    // 場のタイルは箱のふたへ移し、袋から1枚を工房1に置く（総数は変えない）
    function lastTake(game, seat, color, line) {
        clearTable(game);
        const pool = [game.bag, game.lid].find(tiles => tiles.includes(color));
        if (pool) pool.splice(pool.indexOf(color), 1);
        game.factories[0] = [color];
        game.current = seat;
        return game.applyCommand(seat, take(0, color, line));
    }

    it('埋まった段のタイルを壁へ移して得点し、残りは箱のふたへ', () => {
        const game = newGame(2, 11);
        const p = game.players[0];
        p.wall = wallFrom(['.....', '.....', '.....', '.....', '.....']);
        p.lines[1] = { color: 0, count: 1 }; // あと1枚で埋まる
        p.lines[2] = { color: 3, count: 1 }; // 埋まらない
        p.wall[1][0] = true; // 2段目の青は列1。左に1枚
        clearTable(game);
        const lid = game.lid.length;
        lastTake(game, 0, 0, 1);
        expect(p.wall[1][wallColumn(1, 0)]).toBe(true);
        expect(p.score).toBe(2);
        expect(p.lines[1]).toEqual({ color: null, count: 0 });
        expect(p.lines[2]).toEqual({ color: 3, count: 1 }); // 埋まらない段はそのまま
        expect(game.lid.length).toBe(lid + 1); // 2枚のうち1枚は壁へ、1枚はふたへ
        expect(game.round).toBe(2);
        expect(game.roundReports[0].players[0].placements).toEqual([{ row: 1, col: 1, color: 0, points: 2 }]);
    });

    it('上の段から順に置き、同じラウンドで置いたタイルにもつながる', () => {
        const game = newGame(2, 12);
        const p = game.players[0];
        p.lines[0] = { color: 0, count: 1 }; // (0,0)
        p.lines[1] = { color: 4, count: 1 }; // 2段目の水色は (1,0)。最後の1枚で埋まる
        lastTake(game, 0, 4, 1);
        expect(p.wall[0][0] && p.wall[1][0]).toBe(true);
        expect(p.score).toBe(1 + 2);
    });

    it('床の失点を引き、0点より下にはならない', () => {
        const game = newGame(2, 13);
        const p = game.players[0];
        p.score = 3;
        p.floor = game.bag.splice(0, 3);
        lastTake(game, 0, 2, 'floor'); // 床に4枚：-1-1-2-2 = -6
        expect(p.score).toBe(0);
        expect(p.floor).toEqual([]);
        expect(game.roundReports[0].players[0].penalty).toBe(-3);
        expect(countTiles(game)).toBe(100);
    });

    it('先手マーカーを取った人が次のラウンドの先手', () => {
        const game = newGame(2, 14);
        const a = game.current;
        const b = (a + 1) % 2;
        game.factories = game.factories.map(() => []);
        game.factories[0] = [1, 2];
        game.applyCommand(a, take(0, 1, 0)); // 2 が中央へ
        game.applyCommand(b, take('center', 2, 0)); // b が先手マーカーを取る
        expect(game.round).toBe(2);
        expect(game.startSeat).toBe(b);
        expect(game.current).toBe(b);
        expect(game.firstInCenter).toBe(true);
        expect(game.players[b].floor).toEqual([]);
        expect(game.players[b].score).toBe(0); // 1点 - 1点
    });

    it('誰も中央から取らなければ、先手は変わらない', () => {
        const game = newGame(2, 15);
        const a = game.current;
        lastTake(game, a, 1, 0);
        expect(game.startSeat).toBe(a);
    });

    it('袋が空になったら箱のふたから補充する', () => {
        const game = newGame(2, 16);
        // 袋を3枚だけにし、残りはふたへ
        game.lid.push(...game.bag.splice(3));
        const before = countTiles(game);
        lastTake(game, game.current, 0, 'floor');
        expect(game.factories.every(f => f.length === 4)).toBe(true);
        expect(countTiles(game)).toBe(before);
    });

    it('袋も箱のふたも空なら、並べられた分で始める', () => {
        const game = newGame(2, 17);
        const p = game.players[0];
        // 袋に6枚だけ残し、箱のふたは空にする（ほかのタイルは壁にあるものとする）
        clearTable(game);
        p.wall = wallFrom(['.....', 'xxxx.', 'xxxx.', 'xxxx.', 'xxxx.']);
        game.bag = [1, 1, 2, 2, 3, 3];
        game.lid = [];
        lastTake(game, 0, 0, 'floor');
        // 床の1枚がふたに入るので、6 + 1 枚
        expect(game.factories.flat()).toHaveLength(7);
        expect(game.factories[0]).toHaveLength(4);
        expect(game.factories[1]).toHaveLength(3);
        expect(game.factories[2]).toHaveLength(0);
    });
});

describe('ゲームの終わり', () => {
    function finishWith(setup) {
        const game = newGame(3, 21);
        setup(game);
        game.factories = game.factories.map(() => []);
        game.center = [];
        game.factories[0] = [2];
        game.current = 0;
        game.applyCommand(0, take(0, 2, 'floor'));
        return game;
    }

    it('横の列がそろったラウンドの後に終わり、ボーナスを足す', () => {
        const game = finishWith(g => {
            g.players[1].wall = wallFrom(['xxxx.', '.....', '.....', '.....', '.....']);
            g.players[1].lines[0] = { color: 4, count: 1 }; // 1段目の水色は列5
        });
        expect(game.isOver).toBe(true);
        const s = game.result.standings.find(e => e.seat === 1);
        expect(s.rows).toBe(1);
        expect(s.bonus).toBe(2);
        expect(game.result.winners).toEqual([1]);
        expect(game.players[1].score).toBe(5 + 2);
    });

    it('縦の列は7点、色は10点', () => {
        const game = finishWith(g => {
            g.players[0].wall = wallFrom(['xxxxx', 'x....', 'x....', 'x....', 'x....']);
            g.players[2].wall = wallFrom(['x....', '.x...', '..x..', '...x.', '....x']);
        });
        const s0 = game.result.standings.find(e => e.seat === 0);
        const s2 = game.result.standings.find(e => e.seat === 2);
        expect(s0).toMatchObject({ rows: 1, columns: 1, colors: 0, bonus: 9 });
        expect(s2).toMatchObject({ rows: 0, columns: 0, colors: 1, bonus: 10 });
    });

    it('同点なら横の列が多い方が上、それも同じなら同じ順位', () => {
        const tie = newGame(2, 30);
        tie.players[0].wall = wallFrom(['xxxxx', '.....', '.....', '.....', '.....']);
        tie.players[1].wall = wallFrom(['xxxxx', 'xxxxx', '.....', '.....', '.....']);
        tie.players[0].score = 20;
        tie.players[1].score = 16;
        tie.finishGame(); // 0番：20+2=22、1番：16+4=20
        expect(tie.result.standings.map(e => e.score)).toEqual([22, 20]);
        const tie2 = newGame(2, 31);
        tie2.players[0].wall = wallFrom(['xxxxx', '.....', '.....', '.....', '.....']);
        tie2.players[1].wall = wallFrom(['xxxxx', 'xxxxx', '.....', '.....', '.....']);
        tie2.players[0].score = 22;
        tie2.players[1].score = 20;
        tie2.finishGame(); // 24 と 24。横の列が多い1番が勝ち
        expect(tie2.result.winners).toEqual([1]);
        const tie3 = newGame(2, 32);
        tie3.players[0].wall = wallFrom(['xxxxx', '.....', '.....', '.....', '.....']);
        tie3.players[1].wall = wallFrom(['.....', 'xxxxx', '.....', '.....', '.....']);
        tie3.players[0].score = 20;
        tie3.players[1].score = 20;
        tie3.finishGame();
        expect(tie3.result.winners).toEqual([0, 1]);
        expect(tie3.result.standings.map(e => e.rank)).toEqual([1, 1]);
    });
});

describe('試合を通して', () => {
    for (const n of [2, 3, 4]) {
        it(`${n}人：ランダムな手で最後まで進み、タイルは常に100枚、記録から再現できる`, () => {
            for (let seed = 1; seed <= 40; seed++) {
                const game = newGame(n, seed * 101);
                const random = seed * 7;
                const original = game.applyCommand.bind(game);
                game.applyCommand = (seat, command) => {
                    const ok = original(seat, command);
                    expect(countTiles(game)).toBe(100);
                    expect(game.players.every(p => p.floor.length <= 7 && p.score >= 0)).toBe(true);
                    return ok;
                };
                playRandom(game, random);
                expect(game.isOver).toBe(true);
                expect(game.result.standings).toHaveLength(n);
                expect(game.players.some(p => countRows(p.wall) > 0)).toBe(true);
                const replayed = Game.replay(PLAYERS(n), { seed: game.seed }, game.commands);
                expect(snapshot(replayed)).toBe(snapshot(game));
            }
        });
    }

    it('打てる手は必ずあり、どの取り方にも床ラインへ置く手がある', () => {
        const game = newGame(4, 77);
        const original = game.getLegalMoves.bind(game);
        game.getLegalMoves = () => {
            const moves = original();
            expect(moves.length).toBeGreaterThan(0);
            for (const { source, color } of game.getSources()) {
                expect(moves.some(m => m.source === source && m.color === color && m.line === 'floor')).toBe(true);
            }
            return moves;
        };
        playRandom(game, 77);
        expect(game.isOver).toBe(true);
    });
});

describe('ビュー', () => {
    it('袋の並びは入れず、枚数だけ', () => {
        const game = newGame(3, 5);
        const view = createGameView(game, 0);
        expect(view.bag).toBeUndefined();
        expect(view.lid).toBeUndefined();
        expect(view.bagCount).toBe(game.bag.length);
        expect(JSON.stringify(view)).not.toContain('"random"');
        expect(view.players).toHaveLength(3);
        expect(view.factories).toEqual(game.factories);
    });

    it('ビューを書き換えても、ゲームは変わらない', () => {
        const game = newGame(2, 5);
        const view = createGameView(game, 0);
        view.players[0].lines[0].count = 9;
        view.factories[0].push(1);
        expect(game.players[0].lines[0].count).toBe(0);
        expect(game.factories[0]).toHaveLength(4);
    });
});
