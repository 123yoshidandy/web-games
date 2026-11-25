import { describe, it, expect } from 'vitest';
import Game from '../public/js/game.js';
import {
    TILES, EXITS, DICE, shapeOf, distinctOrientations, placementError, canPlaceAnywhere, SIZE
} from '../public/js/tiles.js';
import { scoreBoard, NETWORK_POINTS } from '../public/js/scoring.js';
import { makeGame, players, board, setDice, snapshot } from './helpers.js';

describe('タイルと盤', () => {
    it('ダイスは、道・線路の6面が3つと、高架・直線の駅・カーブの駅が2面ずつのものが1つ', () => {
        expect(DICE.length).toBe(4);
        [0, 1, 2].forEach(i => expect([...DICE[i]].sort()).toEqual(['rail-curve', 'rail-straight', 'rail-t', 'road-curve', 'road-straight', 'road-t']));
        expect([...DICE[3]].sort()).toEqual(['overpass', 'overpass', 'station-curve', 'station-curve', 'station-straight', 'station-straight']);
    });

    it('出口は12。上下は 道・線路・道、左右は 線路・道・線路', () => {
        expect(EXITS.length).toBe(12);
        const top = EXITS.filter(e => e.y === -1).sort((a, b) => a.x - b.x).map(e => [e.x, e.type]);
        expect(top).toEqual([[1, 'road'], [3, 'rail'], [5, 'road']]);
        const left = EXITS.filter(e => e.x === -1).sort((a, b) => a.y - b.y).map(e => [e.y, e.type]);
        expect(left).toEqual([[1, 'rail'], [3, 'road'], [5, 'rail']]);
        expect(EXITS.filter(e => e.type === 'road').length).toBe(6);
    });

    it('回すと裏返すで、見た目の違う向きの数', () => {
        const count = (k) => distinctOrientations(k).length;
        expect(count('road-straight')).toBe(2);
        expect(count('road-curve')).toBe(4);
        expect(count('road-t')).toBe(4);
        expect(count('overpass')).toBe(2);
        expect(count('station-straight')).toBe(4);
        expect(count('station-curve')).toBe(8);
        expect(count('s3')).toBe(1);
        expect(count('s4')).toBe(1);
        expect(count('s6')).toBe(4);
    });

    it('向き：右に回すと上の辺が右へ、裏返すと左右が入れ替わる', () => {
        expect(shapeOf('station-curve', 0).edges).toEqual(['rail', null, null, 'road']);
        expect(shapeOf('station-curve', 1).edges).toEqual(['road', 'rail', null, null]);
        expect(shapeOf('station-curve', 4).edges).toEqual(['rail', 'road', null, null]);
        // 高架は、道と線路が別のまとまり
        const o = shapeOf('overpass', 0);
        expect(o.group[0]).toBe(o.group[2]);
        expect(o.group[0]).not.toBe(o.group[1]);
    });

    it('特別なタイルは6つ', () => {
        expect(Object.values(TILES).filter(t => t.special).length).toBe(6);
    });

    it('出口か描いてある道・線路につながらなければ描けない', () => {
        const empty = board([]);
        expect(placementError(empty, 'road-straight', 1, 0, 0)).toBe(null);           // 上の道の出口につながる
        expect(placementError(empty, 'road-straight', 2, 2, 0)).toContain('つなげて');
        expect(placementError(empty, 'road-straight', 1, 0, 1)).toContain('つなげて');  // 横向きでは出口に向かない
    });

    it('道と線路は直接つなげない。出口とも、種類が違えばつなげない', () => {
        expect(placementError(board([]), 'rail-straight', 1, 0, 0)).toContain('出口は道');
        const cells = board([[1, 0, 'road-straight', 0]]);
        expect(placementError(cells, 'rail-straight', 1, 1, 0)).toContain('直接');
        // 駅ならつなげる
        expect(placementError(cells, 'station-straight', 1, 1, 0)).toContain('直接');
        expect(placementError(cells, 'station-straight', 1, 1, 2)).toBe(null);
        // もう描いてあるマス
        expect(placementError(cells, 'road-straight', 1, 0, 0)).toContain('もう描いて');
    });

    it('つながっていない辺どうしが向き合っていても描ける（空いた辺は道・線路のどちらとも合う）', () => {
        const cells = board([[1, 0, 'road-curve', 0]]);   // 上と右が道
        expect(placementError(cells, 'rail-straight', 0, 0, 0)).toContain('つなげて');
        expect(placementError(cells, 'road-straight', 1, 1, 0)).toContain('つなげて');
    });
});

describe('得点', () => {
    it('出口のつながりの表', () => {
        expect(NETWORK_POINTS.slice(2)).toEqual([4, 8, 12, 16, 20, 24, 28, 32, 36, 40, 45]);
    });

    it('上下の出口を道でつなぐ：出口2つで4点、一番長い道7', () => {
        const cells = board(Array.from({ length: 7 }, (_, y) => [1, y, 'road-straight', 0]));
        expect(scoreBoard(cells)).toMatchObject({ network: 4, road: 7, rail: 0, center: 0, errors: 0, total: 11 });
    });

    it('高架では道と線路がつながらない。駅ならつながる', () => {
        const cross = (center) => board([
            ...Array.from({ length: 7 }, (_, x) => [x, 3, 'road-straight', 1]).filter(([x]) => x !== 3),
            ...Array.from({ length: 7 }, (_, y) => [3, y, 'rail-straight', 0]).filter(([, y]) => y !== 3),
            [3, 3, ...center]
        ]);
        expect(scoreBoard(cross(['overpass', 1]))).toMatchObject({ network: 8, road: 7, rail: 7, center: 5, errors: 0, total: 27 });
        expect(scoreBoard(cross(['s1', 0]))).toMatchObject({ network: 12, road: 7, rail: 7, center: 5, errors: 0, total: 31 });
    });

    it('一番長い道は、枝分かれを含まない一本の流れ', () => {
        // 縦の道（7マス）の途中から、右へ2マスの枝
        const cells = board([
            ...Array.from({ length: 7 }, (_, y) => [1, y, y === 3 ? 'road-t' : 'road-straight', y === 3 ? 3 : 0]),
            [2, 3, 'road-straight', 1], [3, 3, 'road-straight', 1]
        ]);
        const s = scoreBoard(cells);
        expect(s.road).toBe(7);
        expect(s.errors).toBe(1);   // 枝の先が空いたマスに向いている
    });

    it('減点：空いたマスや、描いたマスの空いた辺に向いた端。外周に向いた端は減点しない', () => {
        expect(scoreBoard(board([[1, 0, 'road-curve', 0]])).errors).toBe(1);       // 右が空いたマス
        expect(scoreBoard(board([[0, 0, 'road-curve', 3]])).errors).toBe(0);       // 上と左は外周
        // 道の右の端が、隣の線路のマスの空いた辺に向いている（1）＋線路の下の端が空いたマス（1）
        expect(scoreBoard(board([[1, 0, 'road-curve', 0], [2, 0, 'rail-straight', 0]])).errors).toBe(2);
    });

    it('中央の9マスは、描いたマスごとに1点', () => {
        expect(scoreBoard(board([[2, 2, 'road-straight', 0], [4, 4, 'road-straight', 0], [5, 5, 'road-straight', 0]])).center).toBe(2);
    });
});

describe('ゲームの進行', () => {
    const DICE1 = ['road-straight', 'road-curve', 'rail-straight', 'station-straight'];

    it('7ラウンド。毎ラウンド4つの目を振る。同じシードなら同じ目', () => {
        const a = makeGame(2, 9);
        const b = makeGame(2, 9);
        expect(a.round).toBe(1);
        expect(a.dice.length).toBe(4);
        expect(a.dice).toEqual(b.dice);
        a.dice.forEach((k, i) => expect(DICE[i]).toContain(k));
    });

    it('ダイスの目は1回ずつ描く。描ける目が残っていればラウンドを終えられない', () => {
        const game = makeGame(1);
        setDice(game, DICE1);
        expect(game.applyCommand(0, { type: 'place', source: 'd0', x: 1, y: 0, o: 0 })).toBe(true);
        expect(game.applyCommand(0, { type: 'place', source: 'd0', x: 1, y: 1, o: 0 })).toBe(false);
        expect(game.lastError).toContain('もう描きました');
        expect(game.applyCommand(0, { type: 'end' })).toBe(false);
        expect(game.lastError).toContain('まだ描ける');
        expect(game.applyCommand(0, { type: 'place', source: 'd1', x: 1, y: 1, o: 0 })).toBe(true);    // 上と右
        expect(game.applyCommand(0, { type: 'place', source: 'd2', x: 3, y: 0, o: 0 })).toBe(true);    // 上の線路の出口
        expect(game.applyCommand(0, { type: 'place', source: 'd3', x: 3, y: 1, o: 0 })).toBe(true);    // 駅：上が線路、下が道
        expect(game.applyCommand(0, { type: 'end' })).toBe(true);
        expect(game.round).toBe(2);
        expect(game.players[0].cells.filter(Boolean).length).toBe(4);
    });

    it('描けない目は飛ばしてラウンドを終えられる', () => {
        const game = makeGame(1);
        // 出口の前をすべてふさぐ代わりに、盤を全部埋める
        game.players[0].cells = game.players[0].cells.map(() => ({ kind: 's3', o: 0, round: 0 }));
        expect(canPlaceAnywhere(game.players[0].cells, game.dice[0])).toBe(false);
        expect(game.applyCommand(0, { type: 'end' })).toBe(true);
    });

    it('取り消しは、このラウンドに描いたものだけ', () => {
        const game = makeGame(1);
        setDice(game, DICE1);
        expect(game.applyCommand(0, { type: 'undo' })).toBe(false);
        game.applyCommand(0, { type: 'place', source: 'd0', x: 1, y: 0, o: 0 });
        expect(game.applyCommand(0, { type: 'undo' })).toBe(true);
        expect(game.players[0].cells.every(c => c === null)).toBe(true);
        expect(game.applyCommand(0, { type: 'place', source: 'd0', x: 1, y: 0, o: 0 })).toBe(true);
    });

    it('特別なタイル：1ラウンドに1つまで、ゲーム全体で3つまで、それぞれ1回だけ', () => {
        const game = makeGame(1);
        const p = game.players[0];
        expect(game.applyCommand(0, { type: 'place', source: 's3', x: 3, y: 6, o: 0 })).toBe(false);   // 下の中央は線路の出口
        expect(game.applyCommand(0, { type: 'place', source: 's3', x: 0, y: 3, o: 0 })).toBe(true);    // 左の中央は道の出口
        expect(game.applyCommand(0, { type: 'place', source: 's4', x: 3, y: 0, o: 0 })).toBe(false);
        expect(game.lastError).toContain('1ラウンドに1つ');
        // ほかの目を描けるだけ描いて、ラウンドを終える
        for (let i = 0; i < 20 && game.round === 1; i++) {
            const placed = [0, 1, 2, 3].some(d => {
                for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) for (let o = 0; o < 8; o++) {
                    if (game.applyCommand(0, { type: 'place', source: `d${d}`, x, y, o })) return true;
                }
                return false;
            });
            if (!placed) game.applyCommand(0, { type: 'end' });
        }
        expect(game.round).toBe(2);
        expect(game.applyCommand(0, { type: 'place', source: 's3', x: 0, y: 1, o: 0 })).toBe(false);
        expect(game.lastError).toContain('もう使いました');
        p.specialsUsed = ['s3', 's1', 's2'];
        expect(game.applyCommand(0, { type: 'place', source: 's4', x: 3, y: 0, o: 0 })).toBe(false);
        expect(game.lastError).toContain('3つまで');
    });

    it('全員が描き終えたら次のラウンド。描き終えた人はもう描けない', () => {
        const game = makeGame(2);
        setDice(game, DICE1);
        game.players[0].cells = game.players[0].cells.map(() => ({ kind: 's3', o: 0, round: 0 }));
        expect(game.applyCommand(0, { type: 'end' })).toBe(true);
        expect(game.applyCommand(0, { type: 'undo' })).toBe(false);
        expect(game.round).toBe(1);
        expect(game.actors()).toEqual([1]);
    });

    it('断る操作は状態を変えない', () => {
        const game = makeGame(2);
        const before = snapshot(game);
        [
            { type: 'place', source: 'd9', x: 0, y: 0, o: 0 }, { type: 'place', source: 'd0', x: 9, y: 0, o: 0 },
            { type: 'place', source: 'd0', x: 3, y: 3, o: 0 }, { type: 'place', source: 'd0', x: 1, y: 0, o: 8 },
            { type: 'place', source: 's7', x: 1, y: 0, o: 0 }, { type: 'undo' }, { type: 'proxy' }, null
        ].forEach(c => expect(game.applyCommand(0, c)).toBe(false));
        expect(snapshot(game)).toBe(before);
    });

    it('人数は1〜6人', () => {
        expect(() => new Game(players(0))).toThrow();
        expect(() => new Game(players(7))).toThrow();
        expect(() => new Game(players(6))).not.toThrow();
    });
});
