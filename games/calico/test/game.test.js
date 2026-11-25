import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import { TILES, PATTERNS, GOAL_IDS, BEGINNER_GOALS, BEGINNER_CATS, CATS, CAT_TILES } from '../public/js/data.js';
import { OPEN_CELLS, BORDER, GOAL_CELLS } from '../public/js/board.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { players, newGame, snapshot, totalTiles } from './helpers.js';

// 席 seat に、手札の0枚目を空きマスに置かせ、市場の0枚目を取らせる
const turn = (game, seat = game.current) => {
    const cell = OPEN_CELLS.find(c => game.players[seat].quilt[c] == null);
    expect(game.applyCommand(seat, { type: 'place', hand: 0, cell }), game.lastError).toBe(true);
    expect(game.applyCommand(seat, { type: 'take', market: 0 }), game.lastError).toBe(true);
};

describe('部品と盤', () => {
    it('パッチは108枚（6色×6模様×3枚）', () => {
        expect(TILES.length).toBe(108);
        const counts = {};
        TILES.forEach(t => { counts[`${t.color}/${t.pattern}`] = (counts[`${t.color}/${t.pattern}`] ?? 0) + 1; });
        expect(Object.keys(counts).length).toBe(36);
        expect(Object.values(counts).every(n => n === 3)).toBe(true);
    });

    it('盤は7×7の六角。縁24マス・目標の置き場3・パッチを置くマス22', () => {
        expect(BORDER.length).toBe(24);
        expect(new Set(BORDER).size).toBe(24);
        expect(GOAL_CELLS.length).toBe(3);
        expect(OPEN_CELLS.length).toBe(22);
    });

    it('目標タイルは6種、猫は10匹（点は 3・5・7・9・11 が2匹ずつ）', () => {
        expect(GOAL_IDS.length).toBe(6);
        const points = Object.values(CATS).map(c => c.points).sort((a, b) => a - b);
        expect(points).toEqual([3, 3, 5, 5, 7, 7, 9, 9, 11, 11]);
        // 札の表と裏は同じ点
        Object.entries(CATS).forEach(([id, c]) => {
            expect(CATS[c.back].back).toBe(id);
            expect(CATS[c.back].points).toBe(c.points);
        });
    });
});

describe('準備', () => {
    it('各自2枚の手札・市場3枚・残りは袋。盤は全員違う', () => {
        for (const n of [1, 2, 3, 4]) {
            const game = new Game(players(n), { seed: n });
            expect(game.players.every(p => p.hand.length === 2)).toBe(true);
            expect(game.market.length).toBe(3);
            expect(game.tileCount).toBe(108);
            expect(game.bag.length).toBe(108 - 2 * n - 3);
            expect(totalTiles(game)).toBe(108);
            expect(new Set(game.players.map(p => p.board)).size).toBe(n);
        }
    });

    it('猫は3匹で、6つの模様を2つずつ重ならずに受け持つ', () => {
        for (let seed = 1; seed <= 20; seed++) {
            const game = new Game(players(2), { seed });
            expect(game.cats.length).toBe(3);
            expect(game.cats.flatMap(c => c.patterns).sort()).toEqual([...PATTERNS].sort());
        }
    });

    it('ふつうの準備：猫は札の・の数（1・2・3）ごとに1匹ずつ。表と裏のどちらも出る', () => {
        const seen = new Set();
        for (let seed = 1; seed <= 60; seed++) {
            const game = new Game(players(2), { seed });
            game.cats.forEach((c, i) => {
                expect(CATS[c.id].dots).toBe(i + 1);
                seen.add(c.id);
            });
        }
        expect(seen.size).toBe(10);
        expect(Object.values(CAT_TILES).flat().length).toBe(5);
    });

    it('ふつうの準備：各自に違う目標タイル4枚が配られ、全員が3枚を選んでから始まる', () => {
        const game = new Game(players(3), { seed: 4, startPlayer: 1 });
        expect(game.phase).toBe('goals');
        game.players.forEach(p => {
            expect(p.offered.length).toBe(4);
            expect(new Set(p.offered).size).toBe(4);
        });
        expect(game.actors()).toEqual([0, 1, 2]);
        // 選ぶのは順不同。置く操作はまだできない
        expect(game.applyCommand(1, { type: 'place', hand: 0, cell: OPEN_CELLS[0] })).toBe(false);
        expect(game.applyCommand(2, { type: 'goals', pick: [3, 0, 1] })).toBe(true);
        expect(game.players[2].goals).toEqual([3, 0, 1].map(i => game.players[2].offered[i]));
        expect(game.applyCommand(2, { type: 'goals', pick: [0, 1, 2] })).toBe(false);
        expect(game.applyCommand(0, { type: 'goals', pick: [0, 0, 1] })).toBe(false);
        expect(game.applyCommand(0, { type: 'goals', pick: [0, 1] })).toBe(false);
        expect(game.applyCommand(0, { type: 'goals', pick: [0, 1, 4] })).toBe(false);
        expect(game.applyCommand(0, { type: 'goals', pick: [0, 1, 2] })).toBe(true);
        expect(game.phase).toBe('goals');
        expect(game.applyCommand(1, { type: 'goals', pick: [2, 1, 0] })).toBe(true);
        expect(game.phase).toBe('place');
        expect(game.actors()).toEqual([1]);
    });

    it('はじめての準備：猫はミリー・ティビット・ココナッツ、目標は ≠・AA-BB-CC・AAA-BBB で、すぐ置ける', () => {
        const game = newGame(2, 3);
        expect(game.cats.map(c => c.id)).toEqual(BEGINNER_CATS);
        expect(game.players.every(p => JSON.stringify(p.goals) === JSON.stringify(BEGINNER_GOALS))).toBe(true);
        expect(game.phase).toBe('place');
    });
});

describe('手番', () => {
    it('置く → 市場から1枚取る → 袋から補う → 次の人', () => {
        const game = newGame(3, 2);
        const p = game.players[0];
        const [a, b] = p.hand;
        const cell = OPEN_CELLS[5];
        expect(game.applyCommand(0, { type: 'place', hand: 1, cell })).toBe(true);
        expect(p.quilt[cell]).toBe(b);
        expect(p.hand).toEqual([a]);
        expect(game.phase).toBe('take');
        const picked = game.market[2];
        const next = game.bag[0];
        expect(game.applyCommand(0, { type: 'take', market: 2 })).toBe(true);
        expect(p.hand).toEqual([a, picked]);
        expect(game.market[2]).toBe(next);
        expect(game.current).toBe(1);
        expect(game.phase).toBe('place');
    });

    it('縁・目標の置き場・埋まったマス・盤の外には置けず、番でない人は操作できない。断っても状態は変わらない', () => {
        const game = newGame(2, 5);
        const before = snapshot(game);
        [BORDER[0], GOAL_CELLS[1], -1, 49, 3.5, '10'].forEach(cell => {
            expect(game.applyCommand(0, { type: 'place', hand: 0, cell })).toBe(false);
        });
        expect(game.applyCommand(0, { type: 'place', hand: 2, cell: OPEN_CELLS[0] })).toBe(false);
        expect(game.applyCommand(1, { type: 'place', hand: 0, cell: OPEN_CELLS[0] })).toBe(false);
        expect(game.applyCommand(0, { type: 'take', market: 0 })).toBe(false); // 置く前には取れない
        expect(snapshot(game)).toBe(before);
        expect(game.applyCommand(0, { type: 'place', hand: 0, cell: OPEN_CELLS[0] })).toBe(true);
        expect(game.applyCommand(0, { type: 'place', hand: 0, cell: OPEN_CELLS[1] })).toBe(false); // 1手番に1枚
        expect(game.applyCommand(0, { type: 'take', market: 3 })).toBe(false);
        game.applyCommand(0, { type: 'take', market: 0 });
        game.applyCommand(1, { type: 'place', hand: 0, cell: OPEN_CELLS[0] });
        game.applyCommand(1, { type: 'take', market: 0 });
        expect(game.applyCommand(0, { type: 'place', hand: 0, cell: OPEN_CELLS[0] })).toBe(false); // 埋まったマス
    });

    it('各自22手番でキルトが埋まり、終わる。点は scorePlayer の合計', () => {
        const game = newGame(2, 9);
        let guard = 0;
        while (!game.isOver() && guard++ < 100) turn(game);
        expect(game.isOver()).toBe(true);
        expect(game.players.every(p => p.placed === 22)).toBe(true);
        expect(game.players.every(p => OPEN_CELLS.every(c => p.quilt[c] != null))).toBe(true);
        expect(game.result.players.length).toBe(2);
        expect(game.applyCommand(0, { type: 'place', hand: 0, cell: OPEN_CELLS[0] })).toBe(false);
        expect(totalTiles(game)).toBe(game.tileCount);
    });

    it('置いてボタンや猫が来たら、その場で取る（記録にも残る）', () => {
        const game = newGame(2, 12);
        let gained = 0;
        let guard = 0;
        while (!game.isOver() && guard++ < 200) {
            runCpuStep(game, game.current, 'normal');
            gained = game.players.reduce((s, p) => s + p.buttons.length + p.cats.length, 0);
        }
        expect(gained).toBeGreaterThan(0);
    });
});

describe('同点', () => {
    const finishWith = (a, b) => {
        const game = newGame(2, 4);
        Object.assign(game.players[0], a);
        Object.assign(game.players[1], b);
        game.finish();
        return game;
    };
    it('点が同じなら、猫が多い人の勝ち', () => {
        // 3点ずつ：席0はボタン1つ、席1はミリー1匹
        const game = finishWith({ buttons: [{ color: 'pink', cell: 8 }] }, { cats: [{ cat: 'millie', cell: 8 }] });
        expect(game.result.players[0].total).toBe(game.result.players[1].total);
        expect(game.winners).toEqual([1]);
    });
    it('虹のボタンもボタンの数に入れる（ボタン2つと、ボタン1つ＋虹は同じ）', () => {
        // 6点ずつ・猫0：席0はボタン2つ、席1はボタン1つと虹（点は 3＋3）
        const game = finishWith({ buttons: [{ color: 'pink', cell: 8 }, { color: 'navy', cell: 9 }] }, { buttons: [{ color: 'pink', cell: 8 }], rainbow: true });
        expect(game.result.players[0].total).toBe(game.result.players[1].total);
        expect(game.winners).toEqual([0, 1]);
    });
    it('ボタンも猫も同じなら、勝ちを分ける', () => {
        const game = finishWith({ buttons: [{ color: 'pink', cell: 8 }] }, { buttons: [{ color: 'navy', cell: 9 }] });
        expect(game.winners).toEqual([0, 1]);
    });
});

describe('1人用', () => {
    it('取ったあと、山からいちばん遠い残りを捨て、残りを遠い側へ寄せて、山の側から補う', () => {
        const game = new Game(players(1), { seed: 3, setup: 'beginner' });
        const [m0, m1, m2] = game.market;
        game.applyCommand(0, { type: 'place', hand: 0, cell: OPEN_CELLS[0] });
        const [b0, b1] = game.bag;
        expect(game.applyCommand(0, { type: 'take', market: 0 })).toBe(true);
        expect(game.discarded).toEqual([m2]);
        // m1 を遠い側（右端）へ寄せ、空いた2つを山の側（右から）補う
        expect(game.market[2]).toBe(m1);
        expect(game.market.slice(0, 2).sort()).toEqual([b0, b1].sort());
        expect(game.players[0].hand).toContain(m0);
        expect(totalTiles(game)).toBe(game.tileCount);
    });

    it('22手番で終わる', () => {
        const game = new Game(players(1), { seed: 8, setup: 'beginner' });
        let guard = 0;
        while (!game.isOver() && guard++ < 50) turn(game, 0);
        expect(game.isOver()).toBe(true);
        expect(game.winners).toEqual([0]);
    });
});
