import { describe, it, expect } from 'vitest';
import { createState, pawnMoves, legalWalls, wallReason, applyAction, legalActions, shortestPath, cellOf, canStep, SLOTS } from '../public/js/rules.js';
import Game, { wallMessage } from '../public/js/game.js';

// 盤を組み立てる：pawns は [[x, y], ...]、walls は 'h3,4' のような文字列
function board({ players = 2, pawns, walls = [], current = 0, left } = {}) {
    const s = createState({ players, first: current });
    if (pawns) s.pawns = pawns.map(([x, y]) => cellOf(x, y));
    walls.forEach(w => {
        const o = w[0];
        const [x, y] = w.slice(1).split(',').map(Number);
        (o === 'h' ? s.h : s.v)[y * SLOTS + x] = 1;
        s.placed.push({ x, y, o, seat: 0 });
    });
    if (left) s.walls = left;
    return s;
}
const cells = (list) => list.map(([x, y]) => cellOf(x, y)).sort((a, b) => a - b);
const sorted = (list) => [...list].sort((a, b) => a - b);

describe('始まり', () => {
    it('2人は下と上の中央から、壁10枚ずつ。4人は4辺の中央から、壁5枚ずつ', () => {
        const two = createState({ players: 2 });
        expect(two.pawns).toEqual([cellOf(4, 8), cellOf(4, 0)]);
        expect(two.walls).toEqual([10, 10]);
        const four = createState({ players: 4 });
        expect(four.pawns).toEqual([cellOf(4, 8), cellOf(0, 4), cellOf(4, 0), cellOf(8, 4)]);
        expect(four.walls).toEqual([5, 5, 5, 5]);
    });

    it('3人では作れない', () => {
        expect(() => createState({ players: 3 })).toThrow();
        expect(() => new Game([{}, {}, {}])).toThrow();
    });

    it('最初の手は、駒の3方向と壁128か所', () => {
        const s = createState({ players: 2 });
        const acts = legalActions(s);
        expect(acts.filter(a => a.type === 'move')).toHaveLength(3);
        expect(acts.filter(a => a.type === 'wall')).toHaveLength(128);
    });
});

describe('駒の動き', () => {
    it('壁の向こうへは進めない', () => {
        const s = board({ pawns: [[4, 4], [0, 0]], walls: ['h4,3', 'v3,4'] });
        // h4,3 は (4,3)-(4,4) の間をふさぐ。v3,4 は (3,4)-(4,4) の間をふさぐ
        expect(sorted(pawnMoves(s, 0))).toEqual(cells([[5, 4], [4, 5]]));
    });

    it('壁は2マス分をふさぐ', () => {
        const s = board({ walls: ['h3,3'] });
        expect(canStep(s.h, s.v, cellOf(3, 3), 2)).toBe(false);
        expect(canStep(s.h, s.v, cellOf(4, 3), 2)).toBe(false);
        expect(canStep(s.h, s.v, cellOf(5, 3), 2)).toBe(true);
        expect(canStep(s.h, s.v, cellOf(4, 4), 0)).toBe(false);
    });

    it('向かい合ったら飛び越える', () => {
        const s = board({ pawns: [[4, 5], [4, 4]] });
        expect(sorted(pawnMoves(s, 0))).toEqual(cells([[4, 3], [3, 5], [5, 5], [4, 6]]));
    });

    it('相手の後ろが壁なら、相手の左右（斜め）へ進める', () => {
        const s = board({ pawns: [[4, 5], [4, 4]], walls: ['h4,3'] });
        expect(sorted(pawnMoves(s, 0))).toEqual(cells([[3, 4], [5, 4], [3, 5], [5, 5], [4, 6]]));
    });

    it('相手の後ろが盤の端なら、斜めへ進める', () => {
        const s = board({ pawns: [[4, 1], [4, 0]] });
        expect(sorted(pawnMoves(s, 0))).toEqual(cells([[3, 0], [5, 0], [3, 1], [5, 1], [4, 2]]));
    });

    it('斜めの先に壁があれば、その向きへは進めない', () => {
        const s = board({ pawns: [[4, 5], [4, 4]], walls: ['h4,3', 'v4,3'] });
        // v4,3 は (4,4)-(5,4) の間をふさぐ
        expect(sorted(pawnMoves(s, 0))).toEqual(cells([[3, 4], [3, 5], [5, 5], [4, 6]]));
    });

    it('自分と相手の間に壁があれば、飛び越えられない', () => {
        const s = board({ pawns: [[4, 5], [4, 4]], walls: ['h4,4'] });
        expect(sorted(pawnMoves(s, 0))).toEqual(cells([[3, 5], [5, 5], [4, 6]]));
    });

    it('4人で、相手の後ろに別の駒がいれば、2つは飛び越えず斜めへ進む', () => {
        const s = board({ players: 4, pawns: [[4, 6], [4, 5], [4, 4], [0, 0]] });
        expect(sorted(pawnMoves(s, 0))).toEqual(cells([[3, 5], [5, 5], [3, 6], [5, 6], [4, 7]]));
    });

    it('斜めの先に別の駒がいれば、そこへは進めない', () => {
        const s = board({ players: 4, pawns: [[4, 6], [4, 5], [4, 4], [3, 5]] });
        expect(sorted(pawnMoves(s, 0))).toEqual(cells([[5, 5], [3, 6], [5, 6], [4, 7]]));
    });
});

describe('壁', () => {
    it('重なる壁・交差する壁は置けない', () => {
        const s = board({ walls: ['h3,3'] });
        expect(wallReason(s, { x: 3, y: 3, o: 'h' })).toEqual({ code: 'overlap' });
        expect(wallReason(s, { x: 2, y: 3, o: 'h' })).toEqual({ code: 'overlap' });
        expect(wallReason(s, { x: 4, y: 3, o: 'h' })).toEqual({ code: 'overlap' });
        expect(wallReason(s, { x: 3, y: 3, o: 'v' })).toEqual({ code: 'cross' });
        // 端どうしが接するのは置ける
        expect(wallReason(s, { x: 5, y: 3, o: 'h' })).toBe(null);
        expect(wallReason(s, { x: 2, y: 3, o: 'v' })).toBe(null);
        expect(wallReason(s, { x: 3, y: 2, o: 'v' })).toBe(null);
    });

    it('縦の壁も上下に重なれない', () => {
        const s = board({ walls: ['v3,3'] });
        expect(wallReason(s, { x: 3, y: 2, o: 'v' })).toEqual({ code: 'overlap' });
        expect(wallReason(s, { x: 3, y: 4, o: 'v' })).toEqual({ code: 'overlap' });
        expect(wallReason(s, { x: 3, y: 5, o: 'v' })).toBe(null);
    });

    it('誰かのゴールへの道を完全にふさぐ壁は置けない（駒は道をふさがない）', () => {
        // 上の端の駒（席1）を、横の壁で囲いかける：(0,0)〜(3,0) の下をふさぎ、(3,0) の右をふさぐと、(0..3,0) から出られない
        const s = board({ pawns: [[4, 8], [1, 0]], walls: ['h0,0', 'h2,0'] });
        expect(wallReason(s, { x: 3, y: 0, o: 'v' })).toEqual({ code: 'block', seat: 1 });
        expect(legalWalls(s).some(w => w.x === 3 && w.y === 0 && w.o === 'v')).toBe(false);
        // 自分の道でも同じ
        const t = board({ pawns: [[1, 8], [4, 0]], walls: ['h0,7', 'h2,7'] });
        expect(wallReason(t, { x: 3, y: 7, o: 'v' })).toEqual({ code: 'block', seat: 0 });
    });

    it('駒が道の上にいても、壁の判定では道をふさがない', () => {
        // 1列の通路に相手の駒がいても、道はあるとみなす
        const s = board({ pawns: [[4, 8], [4, 7]] });
        expect(shortestPath(s.h, s.v, s.pawns[0], 0)).toBe(8);
    });

    it('壁が残っていなければ置けない', () => {
        const s = board({ left: [0, 10] });
        expect(wallReason(s, { x: 0, y: 0, o: 'h' })).toEqual({ code: 'none' });
        expect(legalActions(s).every(a => a.type === 'move')).toBe(true);
    });

    it('盤の外の壁は置けない', () => {
        const s = board();
        expect(wallReason(s, { x: 8, y: 0, o: 'h' })).toEqual({ code: 'range' });
        expect(wallReason(s, { x: 0, y: -1, o: 'v' })).toEqual({ code: 'range' });
        expect(wallReason(s, { x: 0, y: 0, o: 'x' })).toEqual({ code: 'range' });
    });

    it('壁を置くと残りが減り、最短の歩数が延びる', () => {
        const s = board();
        const next = applyAction(s, { type: 'wall', x: 3, y: 7, o: 'h' });
        expect(next.walls).toEqual([9, 10]);
        expect(next.current).toBe(1);
        expect(shortestPath(next.h, next.v, next.pawns[0], 0)).toBe(9);
        expect(s.walls).toEqual([10, 10]); // 元の状態は変えない
    });

    it('理由の文', () => {
        const players = [{ name: 'あなた' }, { name: 'CPU' }];
        expect(wallMessage({ code: 'block', seat: 1 }, players, 0)).toBe('CPUのゴールへの道がふさがります');
        expect(wallMessage({ code: 'block', seat: 0 }, players, 0)).toBe('あなたのゴールへの道がふさがります');
        expect(wallMessage({ code: 'cross' }, players)).toBe('ほかの壁と交差します');
        expect(wallMessage(null, players)).toBe(null);
    });
});

describe('勝ち負けと進行', () => {
    it('向かいの辺に着いたら勝ち', () => {
        const s = board({ pawns: [[4, 1], [0, 8]] });
        const next = applyAction(s, { type: 'move', x: 4, y: 0 });
        expect(next.result).toEqual({ winner: 0 });
        expect(legalActions(next)).toEqual([]);
    });

    it('4人では左の人は右の辺がゴール。手番は 下→左→上→右', () => {
        let s = board({ players: 4, pawns: [[4, 8], [7, 4], [4, 0], [8, 0]], current: 1 });
        s = applyAction(s, { type: 'move', x: 8, y: 4 });
        expect(s.result).toEqual({ winner: 1 });
        let t = createState({ players: 4, first: 3 });
        t = applyAction(t, { type: 'move', x: 7, y: 4 });
        expect(t.current).toBe(0);
    });

    it('動かす手も壁もなければパスだけ', () => {
        // 4人で、隅の駒を壁と駒で囲む（上の駒は後ろが壁で飛び越せず、斜めも壁。右は壁）
        // ルールの上では作れない形（道がない）だが、パスの判定だけを確かめる
        const s = board({ players: 4, pawns: [[0, 8], [5, 5], [0, 7], [8, 0]], walls: ['h0,6', 'v0,7'], left: [0, 5, 5, 5] });
        expect(pawnMoves(s, 0)).toEqual([]);
        expect(legalActions(s)).toEqual([{ type: 'pass' }]);
    });

    it('操作を記録し、同じ結果を再現できる。断った操作は状態を変えない', () => {
        const players = [{ name: 'A' }, { name: 'B', isCPU: true }];
        const game = new Game(players, { seed: 3 });
        let steps = 0;
        while (!game.isOver() && steps++ < 60) {
            const before = JSON.stringify(game.state);
            const seat = game.current;
            expect(game.applyCommand(seat, { type: 'wall', x: 9, y: 9, o: 'h' })).toBe(false);
            expect(game.applyCommand(1 - seat, game.legalActions()[0])).toBe(false);
            expect(game.applyCommand(seat, { type: 'move', x: 0, y: 0 })).toBe(false);
            expect(JSON.stringify(game.state)).toBe(before);
            const acts = game.legalActions();
            expect(game.applyCommand(seat, acts[(steps * 37) % acts.length])).toBe(true);
        }
        const again = Game.replay(players, game.options, game.commands);
        expect(JSON.stringify(again.state)).toBe(JSON.stringify(game.state));
    });

    it('同じシードなら最初の手番も同じ', () => {
        const players = [{}, {}, {}, {}];
        expect(new Game(players, { seed: 9 }).first).toBe(new Game(players, { seed: 9 }).first);
        const firsts = new Set(Array.from({ length: 20 }, (_, i) => new Game(players, { seed: i }).first));
        expect(firsts.size).toBeGreaterThan(2);
    });

    it('置けない壁を送ると、理由が入る', () => {
        const game = new Game([{ name: 'あなた' }, { name: 'CPU' }], { seed: 1 });
        const seat = game.current;
        game.applyCommand(seat, { type: 'wall', x: 3, y: 3, o: 'h' });
        expect(game.applyCommand(1 - seat, { type: 'wall', x: 3, y: 3, o: 'v' })).toBe(false);
        expect(game.lastError).toBe('ほかの壁と交差します');
    });
});
