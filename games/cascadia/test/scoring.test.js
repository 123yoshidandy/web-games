import { describe, it, expect } from 'vitest';
import { scoreAnimal, habitatBonus, scoreGame, scoreEnv } from '../public/js/scoring.js';
import { corridors, largestCorridor } from '../public/js/habitat.js';
import { TILES } from '../public/js/tiles.js';
import { tokens, line } from './helpers.js';

const s = (t, animal, card) => scoreAnimal(t, animal, card);
const tileId = (habitats) => TILES.find(t => !t.starter && t.habitats.join() === habitats.join()).id;
const ALL_A = { bear: 'A', elk: 'A', salmon: 'A', hawk: 'A', fox: 'A' };

describe('クマ', () => {
    it('A：ちょうど2頭の群れの数（4・11・19・27）', () => {
        expect(s(tokens(['bear', [0, 0], [1, 0]]), 'bear', 'A')).toBe(4);
        expect(s(tokens(['bear', [0, 0], [1, 0], [5, 0], [6, 0], [10, 0], [11, 0], [12, 0]]), 'bear', 'A')).toBe(11);
        const five = tokens(['bear', ...[0, 4, 8, 12, 16].flatMap(q => [[q, 0], [q + 1, 0]])]);
        expect(s(five, 'bear', 'A')).toBe(27);
        expect(s(tokens(['bear', [0, 0]]), 'bear', 'A')).toBe(0);
    });
    it('B：ちょうど3頭の群れ1つにつき10', () => {
        expect(s(tokens(['bear', ...line(0, 0, 1, 0, 3)]), 'bear', 'B')).toBe(10);
        expect(s(tokens(['bear', ...line(0, 0, 1, 0, 4)]), 'bear', 'B')).toBe(0);
        expect(s(tokens(['bear', ...line(0, 0, 1, 0, 3), ...line(0, 3, 1, 0, 3)]), 'bear', 'B')).toBe(20);
    });
    it('C：1〜3頭の群れ（2・5・8）と、そろい1組につき3', () => {
        expect(s(tokens(['bear', [0, 0], ...line(3, 0, 1, 0, 2), ...line(0, 3, 1, 0, 3)]), 'bear', 'C')).toBe(18);
        expect(s(tokens(['bear', [0, 0], ...line(3, 0, 1, 0, 2)]), 'bear', 'C')).toBe(7);
        // そろいが2組なら、ボーナスも2回（作者の回答）
        const two = tokens(['bear', [0, 0], [20, 0], ...line(3, 0, 1, 0, 2), ...line(23, 0, 1, 0, 2), ...line(0, 3, 1, 0, 3), ...line(20, 3, 1, 0, 3)]);
        expect(s(two, 'bear', 'C')).toBe(2 * 15 + 6);
        expect(s(tokens(['bear', ...line(0, 0, 1, 0, 4)]), 'bear', 'C')).toBe(0);
    });
    it('D：2〜4頭の群れ（5・8・13）', () => {
        expect(s(tokens(['bear', ...line(0, 0, 1, 0, 2), ...line(0, 3, 1, 0, 3), ...line(0, 6, 1, 0, 4), [10, 0]]), 'bear', 'D')).toBe(26);
        expect(s(tokens(['bear', ...line(0, 0, 1, 0, 5)]), 'bear', 'D')).toBe(0);
    });
});

describe('ヘラジカ', () => {
    it('A：直線（2・5・9・13）。いちばん点が高い分け方で数える', () => {
        expect(s(tokens(['elk', ...line(0, 0, 1, 0, 3)]), 'elk', 'A')).toBe(9);
        expect(s(tokens(['elk', ...line(0, 0, 1, 0, 5)]), 'elk', 'A')).toBe(15); // 4頭の直線＋1頭
        expect(s(tokens(['elk', [0, 0], [1, 0], [0, 1]]), 'elk', 'A')).toBe(7);    // 三角は 2頭の直線＋1頭
        expect(s(tokens(['elk', [1, 0], ...line(0, 0, 0, 1, 3)]), 'elk', 'A')).toBe(11); // 縦3頭9＋1頭2
    });
    it('B：1頭・2頭・三角・ひし形（2・5・9・13）', () => {
        expect(s(tokens(['elk', [0, 0], [1, 0], [0, 1]]), 'elk', 'B')).toBe(9);
        expect(s(tokens(['elk', [0, 0], [1, 0], [1, -1], [0, 1]]), 'elk', 'B')).toBe(13);
        expect(s(tokens(['elk', ...line(0, 0, 1, 0, 3)]), 'elk', 'B')).toBe(7);
        expect(s(tokens(['elk', [5, 5]]), 'elk', 'B')).toBe(2);
    });
    it('C：ひとかたまりの群れ（8頭を超えたら8頭ずつ）', () => {
        expect(s(tokens(['elk', ...line(0, 0, 1, 0, 3)]), 'elk', 'C')).toBe(7);
        expect(s(tokens(['elk', ...line(0, 0, 1, 0, 8)]), 'elk', 'C')).toBe(28);
        expect(s(tokens(['elk', ...line(0, 0, 1, 0, 10)]), 'elk', 'C')).toBe(32);
    });
    it('D：1つのマスを囲む輪（2・5・8・12・16・21）。欠けた輪・間が空いた輪でもよい', () => {
        const ring = [[1, 0], [1, -1], [0, -1], [-1, 0], [-1, 1], [0, 1]];
        expect(s(tokens(['elk', ...ring.slice(0, 3)]), 'elk', 'D')).toBe(8);
        expect(s(tokens(['elk', ...ring]), 'elk', 'D')).toBe(21);
        expect(s(tokens(['elk', ...line(0, 0, 1, 0, 3)]), 'elk', 'D')).toBe(7); // まっすぐは弧ではない：2頭の弧＋1頭
        // 間が空いた輪も形になる（作者の回答）：(0,0) を囲む向かい合う2頭はとなり合わないが 5
        expect(s(tokens(['elk', [1, 0], [-1, 0]]), 'elk', 'D')).toBe(5);
        expect(s(tokens(['elk', ring[0], ring[2], ring[4]]), 'elk', 'D')).toBe(8);
    });
});

describe('サケ', () => {
    const fork = tokens(['salmon', [0, 0], [1, 0], [-1, 0], [0, 1]]); // 真ん中のサケのとなりに3匹（(1,0) と (0,1) はとなり合う）
    it('A：列（2・5・8・12・16・20・25）。3匹と接するサケは外して数える', () => {
        expect(s(tokens(['salmon', ...line(0, 0, 1, 0, 4)]), 'salmon', 'A')).toBe(12);
        expect(s(tokens(['salmon', [0, 0], [1, 0], [0, 1]]), 'salmon', 'A')).toBe(8); // 三角も列
        expect(s(tokens(['salmon', ...line(0, 0, 1, 0, 9)]), 'salmon', 'A')).toBe(25);
        // 3匹と接する真ん中のサケだけを外し、残りを列として数える（作者の回答）：2匹の列5＋1匹2
        expect(s(fork, 'salmon', 'A')).toBe(7);
    });
    it('B：列（2・4・9・11・17）', () => {
        expect(s(tokens(['salmon', ...line(0, 0, 1, 0, 3)]), 'salmon', 'B')).toBe(9);
        expect(s(tokens(['salmon', ...line(0, 0, 1, 0, 6)]), 'salmon', 'B')).toBe(17);
    });
    it('C：3〜5匹の列（10・12・15）', () => {
        expect(s(tokens(['salmon', ...line(0, 0, 1, 0, 2)]), 'salmon', 'C')).toBe(0);
        expect(s(tokens(['salmon', ...line(0, 0, 1, 0, 4)]), 'salmon', 'C')).toBe(12);
        expect(s(tokens(['salmon', ...line(0, 0, 1, 0, 6)]), 'salmon', 'C')).toBe(15);
    });
    it('D：3匹以上の列は、サケの数＋となりのトークンの数', () => {
        const t = tokens(['salmon', ...line(0, 0, 1, 0, 3)], ['bear', [0, 1]], ['fox', [1, -1], [5, 5]]);
        expect(s(t, 'salmon', 'D')).toBe(5);
        expect(s(tokens(['salmon', ...line(0, 0, 1, 0, 2)], ['bear', [0, 1]]), 'salmon', 'D')).toBe(0);
    });
});

describe('タカ', () => {
    it('A：ほかのタカのとなりにいないタカの数（2・5・8・11…）', () => {
        expect(s(tokens(['hawk', [0, 0], [4, 0], [0, 4], [10, 0], [11, 0]]), 'hawk', 'A')).toBe(8);
        expect(s(tokens(['hawk', ...[0, 3, 6, 9].map(q => [q, 5])]), 'hawk', 'A')).toBe(11);
    });
    it('B：となりにいなくて、視線が通るタカの数（0・5・9・12…）', () => {
        expect(s(tokens(['hawk', [0, 0], [3, 0], [10, -3]]), 'hawk', 'B')).toBe(5);
        expect(s(tokens(['hawk', [0, 0], [10, -3]]), 'hawk', 'B')).toBe(0);
    });
    it('C：視線1本につき3（あいだのタカでさえぎられる。となりどうしは数えない）', () => {
        expect(s(tokens(['hawk', [0, 0], [3, 0], [6, 0], [20, 3], [21, 3]]), 'hawk', 'C')).toBe(6);
    });
    it('D：視線の通る組の、あいだの動物の種類（4・7・9）。1羽は1組だけで、いちばん点が高い組み方', () => {
        expect(s(tokens(['hawk', [0, 0], [3, 0]], ['bear', [1, 0]], ['fox', [2, 0]]), 'hawk', 'D')).toBe(7);
        expect(s(tokens(['hawk', [0, 0], [3, 0]]), 'hawk', 'D')).toBe(0);
        const t = tokens(['hawk', [0, 0], [2, 0], [6, 0]], ['bear', [1, 0], [3, 0]], ['fox', [4, 0]], ['elk', [5, 0]]);
        expect(s(t, 'hawk', 'D')).toBe(9);
    });
});

describe('キツネ', () => {
    it('A：となりの動物の種類の数（キツネも数える）', () => {
        const t = tokens(['fox', [0, 0], [0, -1]], ['bear', [1, 0], [0, 1]], ['elk', [-1, 0]]);
        expect(s(t, 'fox', 'A')).toBe(5);
    });
    it('B：となりに2つ以上いる動物の種類（3・5・7）', () => {
        const t = tokens(['fox', [0, 0]], ['bear', [1, 0], [0, 1]], ['elk', [-1, 0], [-1, 1]], ['salmon', [1, -1]]);
        expect(s(t, 'fox', 'B')).toBe(5);
        expect(s(tokens(['fox', [0, 0], [1, 0]]), 'fox', 'B')).toBe(0);
    });
    it('C：となりのいちばん多い動物の数（キツネを除く）', () => {
        const t = tokens(['fox', [0, 0], [0, -1]], ['bear', [1, 0], [0, 1], [1, -1]], ['elk', [-1, 0]]);
        expect(s(t, 'fox', 'C')).toBe(3 + 1);
    });
    it('D：となり合う2匹の組のまわりの、2つ以上いる動物の種類（5・7・9・11）', () => {
        const t = tokens(['fox', [0, 0], [1, 0]], ['bear', [0, -1], [2, 0]], ['elk', [-1, 0], [1, 1]], ['salmon', [0, 1]]);
        expect(s(t, 'fox', 'D')).toBe(7);
        expect(s(tokens(['fox', [0, 0], [3, 0]], ['bear', [1, 0], [2, 0]]), 'fox', 'D')).toBe(0);
    });
});

describe('地形のつながり', () => {
    it('向かい合う辺の地形が同じときだけつながる', () => {
        const forest = tileId(['forest']);
        const fp = tileId(['forest', 'prairie']);
        const env = { '0,0': { tile: forest, rot: 0, token: null }, '1,0': { tile: fp, rot: 0, token: null } };
        // 回転0：辺0〜2が森。西（辺3）は草原なので、森どうしはつながらない
        expect(largestCorridor(env, 'forest')).toBe(1);
        env['1,0'].rot = 3; // 辺3〜5が森
        expect(largestCorridor(env, 'forest')).toBe(2);
        expect(largestCorridor(env, 'prairie')).toBe(1);
        expect(corridors(env, 'river')).toEqual([]);
    });

    it('地の点は、動物の点と地形ごとのいちばん大きいつながりの和', () => {
        const forest = tileId(['forest']);
        const env = { '0,0': { tile: forest, rot: 0, token: 'bear' }, '1,0': { tile: forest, rot: 0, token: 'bear' } };
        const r = scoreEnv(env, ALL_A);
        expect(r.wildlife.bear).toBe(4);
        expect(r.habitat.forest).toBe(2);
        expect(r.total).toBe(6);
    });
});

describe('最大のつながりのボーナス', () => {
    it('1人：7以上で2', () => {
        expect(habitatBonus([7], 1)).toEqual([2]);
        expect(habitatBonus([6], 1)).toEqual([0]);
    });
    it('2人：大きい方に2、同じなら1ずつ', () => {
        expect(habitatBonus([5, 4])).toEqual([2, 0]);
        expect(habitatBonus([4, 4])).toEqual([1, 1]);
    });
    it('3〜4人：3と1。いちばんが2人なら2ずつ、3人以上なら1ずつで2番目なし。2番目が並べば0', () => {
        expect(habitatBonus([6, 5, 4])).toEqual([3, 1, 0]);
        expect(habitatBonus([5, 5, 3])).toEqual([2, 2, 0]);
        expect(habitatBonus([5, 5, 5])).toEqual([1, 1, 1]);
        expect(habitatBonus([5, 5, 5, 5])).toEqual([1, 1, 1, 1]);
        expect(habitatBonus([6, 5, 5, 2])).toEqual([3, 0, 0, 0]);
    });
    it('全員の点に、ボーナスと自然トークンを足す', () => {
        const forest = tileId(['forest']);
        const big = { '0,0': { tile: forest, rot: 0, token: null }, '1,0': { tile: forest, rot: 0, token: null } };
        const small = { '0,0': { tile: forest, rot: 0, token: null } };
        const r = scoreGame([big, small], ALL_A, [1, 3]);
        expect(r.players[0].bonus.forest).toBe(2);
        expect(r.players.map(p => p.total)).toEqual([2 + 2 + 1, 1 + 3]);
    });
});
