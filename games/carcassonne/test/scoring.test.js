import { describe, it, expect } from 'vitest';
import { setupGame, snapshot, scores } from './helpers.js';

const play = (game, seat, x, y, rot, meeple = null) => {
    const ok = game.applyCommand(seat, { type: 'play', x, y, rot, meeple });
    if (!ok) throw new Error(game.lastError);
};

describe('道', () => {
    it('両端が止まると完成し、1 枚 1 点。コマは戻る', () => {
        // 東の三叉路から道が始まり、開始タイルを通って、西の三叉路で止まる
        const game = setupGame({ tiles: [[0, 0, 'D', 0], [1, 0, 'W', 0, [0, 2]]], tile: 'W', current: 1 });
        expect(game.players[0].meeples).toBe(6);
        play(game, 1, -1, 0, 0);
        expect(scores(game)).toEqual([3, 0]);
        expect(game.players[0].meeples).toBe(7);
        expect(game.board.get(1, 0).meeple).toBeNull();
        expect(game.players[0].breakdown.road).toBe(3);
    });

    it('置いたその番に完成すれば、コマはすぐ戻る', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0], [-1, 0, 'W', 0]], tile: 'W' });
        play(game, 0, 1, 0, 0, 2);
        expect(scores(game)).toEqual([3, 0]);
        expect(game.players[0].meeples).toBe(7);
    });

    it('輪になった道も完成する', () => {
        // 2×2 の曲がり道で輪を作る
        const game = setupGame({ tiles: [[0, 0, 'V', 3, [0, 0]], [1, 0, 'V', 0], [1, 1, 'V', 1]], tile: 'V' });
        play(game, 0, 0, 1, 2);
        expect(scores(game)).toEqual([4, 0]);
    });
});

describe('都市', () => {
    it('2 枚の都市も 1 枚 2 点（第2版）', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0]], tile: 'E' });
        play(game, 0, 0, -1, 2, 0);
        expect(scores(game)).toEqual([4, 0]);
        expect(game.players[0].breakdown.city).toBe(4);
    });

    it('紋章は 1 つ 2 点', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0], [0, -1, 'F', 1, [1, 0]]], tile: 'E' });
        play(game, 0, 0, -2, 2);
        // 3 枚 + 紋章 1 = 8 点
        expect(scores(game)).toEqual([0, 8]);
        expect(game.players[1].meeples).toBe(7);
    });

    it('4 辺の都市を囲み切ると完成する', () => {
        // C（4 辺が都市・紋章）の周りを 4 枚の都市の端で閉じる
        const game = setupGame({
            tiles: [[0, 0, 'C', 0, [0, 0]], [0, -1, 'E', 2], [1, 0, 'E', 3], [-1, 0, 'E', 1]],
            tile: 'E'
        });
        play(game, 0, 0, 1, 0);
        // 5 枚 + 紋章 1 = 12 点
        expect(scores(game)).toEqual([12, 0]);
    });

    it('同数のときは、どちらも満点', () => {
        const game = setupGame({ tiles: [[0, 0, 'E', 1, [0, 0]], [2, 0, 'E', 3, [1, 0]]], tile: 'G' });
        play(game, 0, 1, 0, 1);
        expect(scores(game)).toEqual([6, 6]);
        expect(game.players.map(p => p.meeples)).toEqual([7, 7]);
    });

    it('コマが多い人だけが得点し、少ない人のコマも戻る', () => {
        const game = setupGame({
            tiles: [[0, -1, 'E', 2, [0, 0]], [1, 0, 'E', 3, [0, 0]], [-1, 0, 'E', 1, [1, 0]]],
            tile: 'R', current: 1
        });
        play(game, 1, 0, 0, 0);
        expect(scores(game)).toEqual([8, 0]);
        expect(game.players.map(p => p.meeples)).toEqual([7, 7]);
    });

    it('完成した都市のイベントに、タイルと勝った人が入る', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0]], tile: 'E' });
        play(game, 0, 0, -1, 2, 0);
        const event = game.events.find(e => e.type === 'score');
        expect(event).toMatchObject({ kind: 'city', points: 4, winners: [0], final: false, returned: true });
        expect(event.cells).toHaveLength(2);
    });
});

describe('修道院', () => {
    const ring = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]].map(([x, y]) => [x, y, 'B', 0]);

    it('周りの 8 マスが埋まると 9 点', () => {
        const game = setupGame({ tiles: [[0, 0, 'B', 0, [0, 0]], ...ring], tile: 'B', current: 1 });
        play(game, 1, 1, 1, 0);
        expect(scores(game)).toEqual([9, 0]);
        expect(game.players[0].meeples).toBe(7);
        expect(game.players[0].breakdown.monastery).toBe(9);
    });

    it('囲まれた場所に置いた修道院は、その場で 9 点', () => {
        const game = setupGame({ tiles: [...ring, [1, 1, 'B', 0]], tile: 'B' });
        play(game, 0, 0, 0, 0, 0);
        expect(scores(game)).toEqual([9, 0]);
    });

    it('コマのない修道院は数えない', () => {
        const game = setupGame({ tiles: [[0, 0, 'B', 0], ...ring], tile: 'B' });
        play(game, 0, 1, 1, 0);
        expect(scores(game)).toEqual([0, 0]);
    });
});

describe('コマを置ける場所', () => {
    it('誰かのコマがいる道につながる道には置けない。断っても状態は変わらない', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0, [0, 1]]], tile: 'U', current: 1 });
        const before = snapshot(game);
        expect(game.applyCommand(1, { type: 'play', x: 1, y: 0, rot: 1, meeple: 0 })).toBe(false);
        expect(game.lastError).toMatch(/ほかのコマ/);
        expect(snapshot(game)).toBe(before);
        expect(game.board.meepleOptions('U', 1, 1, 0)).toEqual([1, 2]);
    });

    it('草原も、つながった先にコマがいれば置けない（道の反対側には置ける）', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0, [0, 2]]], tile: 'U', current: 1 });
        // U を横向きに置くと、北の草原は D の上の草原とつながる
        expect(game.board.meepleOptions('U', 1, 1, 0)).toEqual([0, 1]);
    });

    it('コマが残っていなければ置けない', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0]], tile: 'U' });
        game.players[0].meeples = 0;
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'play', x: 1, y: 0, rot: 1, meeple: 0 })).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.placementOptions().every(p => p.meeples.length === 0)).toBe(true);
    });

    it('辺が合わない場所・離れた場所・手番でない人の操作は断る', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0]], tile: 'U' });
        const before = snapshot(game);
        expect(game.applyCommand(0, { type: 'play', x: 1, y: 0, rot: 0, meeple: null })).toBe(false); // 道と草原
        expect(game.applyCommand(0, { type: 'play', x: 3, y: 0, rot: 1, meeple: null })).toBe(false); // 離れている
        expect(game.applyCommand(0, { type: 'play', x: 0, y: 0, rot: 1, meeple: null })).toBe(false); // 置いてある
        expect(game.applyCommand(1, { type: 'play', x: 1, y: 0, rot: 1, meeple: null })).toBe(false); // 手番でない
        expect(game.applyCommand(0, { type: 'play', x: 1, y: 0, rot: 5, meeple: null })).toBe(false); // 向き
        expect(game.applyCommand(0, { type: 'play', x: 1, y: 0, rot: 1, meeple: 9 })).toBe(false); // 要素の番号
        expect(game.applyCommand(0, { type: 'pass' })).toBe(false);
        expect(game.applyCommand(0, null)).toBe(false);
        expect(snapshot(game)).toBe(before);
        expect(game.commands).toHaveLength(0);
    });
});

describe('ゲーム終了時の得点', () => {
    it('未完成の都市は 1 枚 1 点・紋章 1 点、道は 1 枚 1 点、修道院は 1 点＋周りのタイルの数', () => {
        const game = setupGame({
            tiles: [[0, 0, 'D', 0, [1, 1]], [0, -1, 'F', 1, [0, 0]], [0, 1, 'B', 0, [0, 0]], [1, 1, 'U', 0]],
            tile: null
        });
        game.finish();
        // 赤：都市 2 枚 + 紋章 1 = 3、修道院 1 + 周り 2（D と U） = 3 / 青：道 1 枚 = 1
        expect(scores(game)).toEqual([6, 1]);
        expect(game.players[0].breakdown).toEqual({ road: 0, city: 3, monastery: 3, field: 0 });
        expect(game.phase).toBe('end');
    });

    it('草原は、接している完成した都市 1 つにつき 3 点', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0, [0, 2]], [0, -1, 'E', 2]], tile: null });
        game.finish();
        expect(scores(game)).toEqual([3, 0]);
        expect(game.players[0].breakdown.field).toBe(3);
    });

    it('未完成の都市は草原の得点にならない', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0, [0, 2]]], tile: null });
        game.finish();
        expect(scores(game)).toEqual([0, 0]);
    });

    it('道の反対側の草原は別の草原', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0, [0, 3]], [0, -1, 'E', 2]], tile: null });
        game.finish();
        expect(scores(game)).toEqual([0, 0]);
    });

    it('完成した都市を 2 つ接していれば 6 点', () => {
        // H（東と西に別々の都市）の両方を閉じる
        const game = setupGame({ tiles: [[0, 0, 'H', 0, [1, 2]], [1, 0, 'E', 3], [-1, 0, 'E', 1]], tile: null });
        game.finish();
        expect(scores(game)).toEqual([0, 6]);
    });

    it('片方だけ閉じていれば 3 点', () => {
        const game = setupGame({ tiles: [[0, 0, 'H', 0, [1, 2]], [1, 0, 'E', 3]], tile: null });
        game.finish();
        expect(scores(game)).toEqual([0, 3]);
    });

    // 2 枚の D の上の草原がつながり、上の 2 枚の角の都市で 2 つの都市の端が 1 つの都市になる
    const bigCity = [[0, -1, 'N', 2], [1, -1, 'N', 3]];

    it('同じ都市に何か所で接していても 1 回だけ数える', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0, [0, 2]], [1, 0, 'D', 0], ...bigCity], tile: null });
        game.finish();
        expect(scores(game)).toEqual([3, 0]);
    });

    it('草原のコマが同数なら、どちらも満点', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0, [0, 2]], [1, 0, 'D', 0, [1, 2]], ...bigCity], tile: null });
        game.finish();
        expect(scores(game)).toEqual([3, 3]);
    });

    it('草原のコマが多い人だけが得点する', () => {
        const game = setupGame({
            tiles: [[0, 0, 'D', 0, [0, 2]], [1, 0, 'D', 0, [1, 2]], [2, 0, 'D', 0, [0, 2]], ...bigCity],
            tile: null
        });
        game.finish();
        // (2, 0) の都市は閉じていないので数えない
        expect(scores(game)).toEqual([3, 0]);
    });

    it('草原の得点は、試合中に完成した都市も数える（3 人・紋章のある大きな都市）', () => {
        // 開始タイルの都市を、紋章の都市 F でのばして閉じる。草原は D の上の草原
        const game = setupGame({
            n: 3,
            tiles: [[0, 0, 'D', 0, [2, 2]], [0, -1, 'F', 1, [0, 0]]],
            tile: 'E', current: 1
        });
        play(game, 1, 0, -2, 2);
        expect(scores(game)).toEqual([8, 0, 0]);
        game.finish();
        expect(scores(game)).toEqual([8, 0, 3]);
    });
});

describe('置けないタイル', () => {
    it('どこにも置けないタイルは取り除き、引き直す', () => {
        const game = setupGame({ tiles: [[0, 0, 'U', 0]], tile: null, bag: ['E', 'C'] });
        game.drawTile();
        expect(game.tile).toBe('E');
        expect(game.discarded).toEqual(['C']);
        expect(game.events.find(e => e.type === 'discard')).toMatchObject({ tile: 'C' });
    });

    it('引き直して袋が空になれば、ゲームが終わる', () => {
        const game = setupGame({ tiles: [[0, 0, 'U', 0]], tile: null, bag: ['C'] });
        game.drawTile();
        expect(game.phase).toBe('end');
    });

    it('最後のタイルを置いたらゲームが終わる', () => {
        const game = setupGame({ tiles: [[0, 0, 'D', 0]], tile: 'E', bag: [] });
        play(game, 0, 0, -1, 2, 0);
        expect(game.phase).toBe('end');
        expect(game.applyCommand(1, { type: 'play', x: 1, y: 0, rot: 1, meeple: null })).toBe(false);
        expect(game.events.at(-1)).toMatchObject({ type: 'end' });
    });
});
