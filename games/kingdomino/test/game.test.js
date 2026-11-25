import { describe, it, expect } from 'vitest';
import Game, {
    DOMINOES, SETUP, canPlace, legalPlacements, scoreKingdom, isCentered, playerScore, kingdomBounds, cellKey
} from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { newGame, PLAYERS, gridFrom, playRandom, snapshot } from './helpers.js';

// 最初の並びを全員が選び終えるまで進める（空いている一番上を選ぶ）
function finishInitial(game) {
    while (game.phase === 'initial') {
        const index = game.current.findIndex(s => s.king === null);
        game.applyCommand(game.currentSeat, { type: 'pick', index });
    }
}

describe('ドミノ', () => {
    it('48枚で、地形ごとのマスの数と王冠の数が公式の合計と合う', () => {
        const all = Object.values(DOMINOES);
        expect(all).toHaveLength(48);
        const squares = {};
        const crowns = {};
        for (const d of all) {
            for (const h of d.halves) {
                squares[h.terrain] = (squares[h.terrain] ?? 0) + 1;
                crowns[h.terrain] = (crowns[h.terrain] ?? 0) + h.crowns;
            }
        }
        expect(squares).toEqual({ wheat: 26, forest: 22, lake: 18, grass: 14, swamp: 10, mine: 6 });
        expect(crowns).toEqual({ wheat: 5, forest: 6, lake: 6, grass: 6, swamp: 6, mine: 10 });
    });
});

describe('準備', () => {
    it.each([[2, 24, 4], [3, 36, 3], [4, 48, 4]])('%i人：ドミノ%i枚、並びは%i枚', (n, dominoes, line) => {
        const game = newGame(n, 3);
        expect(SETUP[n].dominoes).toBe(dominoes);
        expect(game.deck.length + game.current.length).toBe(dominoes);
        expect(game.current).toHaveLength(line);
        expect(game.kings).toHaveLength(line);
        expect(game.phase).toBe('initial');
        // 番号の小さい順に並ぶ
        const ids = game.current.map(s => s.domino);
        expect(ids).toEqual([...ids].sort((a, b) => a - b));
    });

    it('2人なら王様は2つずつ、3・4人なら1つずつ', () => {
        const count = (game, seat) => game.kings.filter(k => k.seat === seat).length;
        expect([0, 1].map(s => count(newGame(2), s))).toEqual([2, 2]);
        expect([0, 1, 2].map(s => count(newGame(3), s))).toEqual([1, 1, 1]);
        expect([0, 1, 2, 3].map(s => count(newGame(4), s))).toEqual([1, 1, 1, 1]);
    });

    it('同じシードなら同じ並び', () => {
        expect(snapshot(newGame(3, 42))).toBe(snapshot(newGame(3, 42)));
        expect(snapshot(newGame(3, 42))).not.toBe(snapshot(newGame(3, 43)));
    });

    it('最初は王様をランダムな順に、最初の並びに置く。全員置いたら次の並びが出る', () => {
        const game = newGame(4, 5);
        const order = game.initialOrder.map(id => game.kings[id].seat);
        for (let i = 0; i < 4; i++) {
            expect(game.currentSeat).toBe(order[i]);
            expect(game.applyCommand(game.currentSeat, { type: 'pick', index: 3 - i })).toBe(true);
        }
        expect(game.phase).toBe('play');
        expect(game.next).toHaveLength(4);
        expect(game.step).toBe('pick');
        // 一番上（番号が一番小さい）ドミノの王様から動く
        expect(game.activeKing.id).toBe(game.current[0].king);
    });
});

describe('置き方', () => {
    const wheat = DOMINOES[1]; // 小麦畑・小麦畑
    const wheatForest = DOMINOES[13]; // 小麦畑・森

    it('城に接していれば、どの地形でも置ける', () => {
        const grid = gridFrom(['C']);
        expect(canPlace(grid, DOMINOES[7], 1, 0, 0)).toBe(true);
        expect(canPlace(grid, DOMINOES[7], 0, 1, 1)).toBe(true);
        expect(canPlace(grid, DOMINOES[7], 2, 0, 0)).toBe(false); // 離れている
    });

    it('どちらかのマスが同じ地形に接していれば置ける', () => {
        const grid = gridFrom(['C W W']);
        // 小麦畑の側が (2,0) の小麦畑に接する（森の側はどこにも接しない）
        expect(canPlace(grid, wheatForest, 2, 1, 1)).toBe(true);
        expect(canPlace(grid, wheatForest, 2, 1, 0)).toBe(true);
        // 湖・湖は小麦畑にしか接しないので置けない
        expect(canPlace(grid, DOMINOES[7], 3, 0, 0)).toBe(false);
        // 森の側だけが小麦畑に接する（小麦畑の側は離れている）
        expect(canPlace(grid, wheatForest, 4, 0, 2)).toBe(false);
    });

    it('重ねられない', () => {
        const grid = gridFrom(['C W W']);
        expect(canPlace(grid, wheat, 2, 0, 0)).toBe(false);
        expect(canPlace(grid, wheat, -1, 0, 2)).toBe(true);
        expect(canPlace(grid, wheat, 0, 0, 1)).toBe(false); // 城の上
    });

    it('城を含めて5×5に収める', () => {
        const grid = gridFrom(['C W W W W']);
        expect(canPlace(grid, wheat, 5, 0, 1)).toBe(false); // 横に6マス
        expect(canPlace(grid, wheat, 4, 1, 1)).toBe(true);
        const tall = gridFrom(['C', 'W', 'W', 'W', 'W']);
        expect(canPlace(tall, wheat, 1, 3, 1)).toBe(true); // 縦に5マスまでは置ける
        expect(canPlace(tall, wheat, 1, 4, 1)).toBe(false); // 縦に6マス
        expect(canPlace(tall, wheat, -1, 0, 2)).toBe(true);
    });

    it('置ける場所の一覧は、canPlace と一致する', () => {
        const grid = gridFrom(['W W .', 'F C L', '. G G']);
        const list = legalPlacements(grid, DOMINOES[29]);
        expect(list.length).toBeGreaterThan(0);
        for (const p of list) expect(canPlace(grid, DOMINOES[29], p.x, p.y, p.dir)).toBe(true);
        let count = 0;
        for (let y = -6; y <= 6; y++) for (let x = -6; x <= 6; x++) for (let d = 0; d < 4; d++) if (canPlace(grid, DOMINOES[29], x, y, d)) count++;
        expect(list).toHaveLength(count);
    });

    it('置けないドミノは捨て、置ける場所があれば捨てられない', () => {
        const game = newGame(2, 7);
        finishInitial(game);
        const seat = game.currentSeat;
        game.applyCommand(seat, { type: 'pick', index: game.next.findIndex(s => s.king === null) });
        expect(game.step).toBe('place');
        const before = snapshot(game);
        expect(game.applyCommand(seat, { type: 'discard' })).toBe(false);
        expect(snapshot(game)).toBe(before);
        // 王国を、今のドミノの地形が城以外に接せないように埋める（城の四方を塞ぐ）
        const domino = game.activeDomino;
        const other = ['wheat', 'forest', 'lake', 'grass', 'swamp', 'mine'].find(t => domino.halves.every(h => h.terrain !== t));
        const p = game.players[seat];
        for (let y = -2; y <= 2; y++) for (let x = -2; x <= 2; x++) if (x || y) p.grid[cellKey(x, y)] = { terrain: other, crowns: 0 };
        expect(game.getLegalPlacements()).toEqual([]);
        expect(game.applyCommand(seat, { type: 'discard' })).toBe(true);
        expect(p.discarded).toBe(1);
    });
});

describe('断る操作', () => {
    const cases = [
        ['手番でない', g => g.applyCommand((g.currentSeat + 1) % 2, { type: 'pick', index: 0 })],
        ['選ばれたドミノ', g => { g.applyCommand(g.currentSeat, { type: 'pick', index: 0 }); return g.applyCommand(g.currentSeat, { type: 'pick', index: 0 }); }],
        ['範囲の外', g => g.applyCommand(g.currentSeat, { type: 'pick', index: 9 })],
        ['選ぶ番に置く', g => g.applyCommand(g.currentSeat, { type: 'place', x: 1, y: 0, dir: 0 })],
        ['種類が不正', g => g.applyCommand(g.currentSeat, { type: 'pass' })],
        ['形が不正', g => g.applyCommand(g.currentSeat, null)],
        ['置けない場所', g => {
            finishInitial(g);
            g.applyCommand(g.currentSeat, { type: 'pick', index: g.next.findIndex(s => s.king === null) });
            return g.applyCommand(g.currentSeat, { type: 'place', x: 3, y: 3, dir: 0 });
        }],
        ['向きが不正', g => {
            finishInitial(g);
            g.applyCommand(g.currentSeat, { type: 'pick', index: g.next.findIndex(s => s.king === null) });
            return g.applyCommand(g.currentSeat, { type: 'place', x: 1, y: 0, dir: 7 });
        }]
    ];
    it.each(cases)('%s：断り、状態を変えない', (_, act) => {
        const game = newGame(2, 5);
        let before = null;
        const original = game.applyCommand.bind(game);
        game.applyCommand = (seat, command) => {
            before = snapshot(game);
            return original(seat, command);
        };
        expect(act(game)).toBe(false);
        expect(game.lastError).toBeTruthy();
        expect(snapshot(game)).toBe(before);
    });
});

describe('得点', () => {
    it('領域ごとに マスの数 × 王冠の数', () => {
        const grid = gridFrom([
            'W W1 F .',
            'W  C F1 F',
            'L2 L G .'
        ]);
        const s = scoreKingdom(grid);
        // 小麦畑3マス×1、森3マス×1、湖2マス×2、草原1マス×0
        expect(s.points).toBe(3 + 3 + 4);
        expect(s.largest).toBe(3);
        expect(s.crowns).toBe(4);
    });
    it('離れた同じ地形は別の領域', () => {
        const grid = gridFrom(['W1 C W1']);
        expect(scoreKingdom(grid).points).toBe(2);
    });
    it('王冠のない領域は0点', () => {
        expect(scoreKingdom(gridFrom(['W W C F F'])).points).toBe(0);
    });
    it('中王国：城が5×5の真ん中なら+10', () => {
        const rows = ['W W W W W', 'W W W W W', 'W W C W W', 'W W W W W', 'W W W W W1'];
        const centered = gridFrom(rows);
        expect(isCentered(centered)).toBe(true);
        const off = gridFrom(['C W W W W', 'W W W W W', 'W W W W W', 'W W W W W', 'W W W W W1']);
        expect(isCentered(off)).toBe(false);
        expect(playerScore({ grid: centered, discarded: 0 }, { middleKingdom: true }).total).toBe(24 + 10);
        expect(playerScore({ grid: centered, discarded: 0 }, { middleKingdom: false }).total).toBe(24);
        expect(playerScore({ grid: off, discarded: 0 }, { middleKingdom: true }).total).toBe(24);
    });
    it('調和：1枚も捨てなければ+5', () => {
        const grid = gridFrom(['C W1']);
        expect(playerScore({ grid, discarded: 0 }, { harmony: true }).total).toBe(1 + 5);
        expect(playerScore({ grid, discarded: 1 }, { harmony: true }).total).toBe(1);
        expect(playerScore({ grid, discarded: 0 }, { harmony: false }).total).toBe(1);
    });
});

describe('ゲームの終わりと順位', () => {
    function endWith(grids) {
        const game = newGame(grids.length, 9);
        game.players.forEach((p, i) => { p.grid = gridFrom(grids[i]); });
        game.finish();
        return game.result;
    }
    it('点数が高い方が勝ち', () => {
        expect(endWith([['C W1'], ['C W1 W']]).winners).toEqual([1]);
    });
    it('同点なら最大の領域が広い方', () => {
        // どちらも 4点。0番は 4マス×1、1番は 2マス×2
        const r = endWith([['C W1 W W W'], ['C L1 L1']]);
        expect(r.standings[0].seat).toBe(0);
        expect(r.winners).toEqual([0]);
    });
    it('それも同じなら王冠が多い方、それも同じなら勝ちを分け合う', () => {
        // どちらも 4点・最大の領域 2マス・王冠2つ
        const tie = endWith([['C W2 W'], ['C W2 W F']]);
        expect(tie.winners).toEqual([0, 1]);
        // 0番：湖 1マス×2 + 森 2マス×1 = 4、最大2、王冠3。1番：小麦畑 2マス×2 = 4、最大2、王冠2
        const crowns = endWith([['L2 C F1 F'], ['C W2 W']]);
        expect(crowns.winners).toEqual([0]);
    });
});

describe('試合を通して', () => {
    for (const n of [2, 3, 4]) {
        for (const options of [{}, { middleKingdom: true, harmony: true }]) {
            it(`${n}人${options.harmony ? '・追加ルールあり' : ''}：ランダムな手で最後まで進み、記録から再現できる`, () => {
                for (let seed = 1; seed <= 25; seed++) {
                    const game = newGame(n, seed * 97, options);
                    playRandom(game, seed, g => {
                        for (const p of g.players) {
                            const b = kingdomBounds(p.grid);
                            expect(b.maxX - b.minX).toBeLessThan(5);
                            expect(b.maxY - b.minY).toBeLessThan(5);
                        }
                    });
                    expect(game.isOver).toBe(true);
                    // 全員が12枚ずつ扱う（置いたか捨てたか）
                    for (const p of game.players) {
                        expect(p.placed + p.discarded).toBe(12);
                        expect(Object.keys(p.grid)).toHaveLength(1 + p.placed * 2);
                    }
                    expect(game.round).toBe(SETUP[n].dominoes / game.lineSize);
                    const replayed = Game.replay(PLAYERS(n), { seed: game.seed, ...options }, game.commands);
                    expect(snapshot(replayed)).toBe(snapshot(game));
                }
            });
        }
    }
});

describe('ビュー', () => {
    it('山の並びは入れず、枚数だけ', () => {
        const game = newGame(3, 5);
        const view = createGameView(game, 0);
        expect(view.deck).toBeUndefined();
        expect(view.deckCount).toBe(game.deck.length);
        expect(JSON.stringify(view)).not.toContain(JSON.stringify(game.deck));
    });
    it('置ける場所は、置く番の本人にだけ', () => {
        const game = newGame(2, 11);
        finishInitial(game);
        game.applyCommand(game.currentSeat, { type: 'pick', index: game.next.findIndex(s => s.king === null) });
        const seat = game.currentSeat;
        expect(createGameView(game, seat).placements.length).toBeGreaterThan(0);
        expect(createGameView(game, 1 - seat).placements).toEqual([]);
    });
});
