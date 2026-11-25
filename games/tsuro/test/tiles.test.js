import { describe, it, expect } from 'vitest';
import { allMatchings, TILES, TILE_COUNT, DISTINCT_ROTATIONS, partnerOf, pathsOf, START_MARKS, pointKey, across, simulate } from '../public/js/tiles.js';

const rotate = (m, k) => {
    const out = Array(8);
    m.forEach((q, p) => { out[(p + 2 * k) % 8] = (q + 2 * k) % 8; });
    return out.join('');
};

describe('道のタイル', () => {
    it('8つの端点を4組に分ける方法は105通りで、回転で重なるものをまとめると35枚（ゲームの枚数と一致）', () => {
        expect(allMatchings()).toHaveLength(105);
        expect(TILE_COUNT).toBe(35);
    });

    it('どの分け方も、ちょうど1枚のタイルを回したものになる', () => {
        const owners = allMatchings().map(m => TILES.filter(t => [0, 1, 2, 3].some(k => rotate(t, k) === m.join(''))).length);
        expect(owners.every(n => n === 1)).toBe(true);
    });

    it('各タイルは4本の道で、8つの端点をすべて使う。回して同じ形になる向きの数は 1:5枚・2:10枚・4:20枚', () => {
        TILES.forEach(t => {
            t.forEach((q, p) => {
                expect(q).not.toBe(p);
                expect(t[q]).toBe(p);
            });
            [0, 1, 2, 3].forEach(rot => expect(pathsOf(TILES.indexOf(t), rot)).toHaveLength(4));
        });
        const counts = {};
        DISTINCT_ROTATIONS.forEach(d => { counts[d] = (counts[d] ?? 0) + 1; });
        expect(counts).toEqual({ 1: 5, 2: 10, 4: 20 });
    });

    it('90度回すと、端点 p は p+2 に移る', () => {
        const tile = TILES.findIndex((_, i) => DISTINCT_ROTATIONS[i] === 4);
        for (let p = 0; p < 8; p++) {
            expect(partnerOf({ tile, rot: 1 }, (p + 2) % 8)).toBe((partnerOf({ tile, rot: 0 }, p) + 2) % 8);
        }
    });
});

describe('盤', () => {
    it('縁の印は48か所で、すべて盤の縁にある', () => {
        expect(START_MARKS).toHaveLength(48);
        expect(new Set(START_MARKS.map(m => pointKey(m.cell, m.p))).size).toBe(48);
        START_MARKS.forEach(m => expect(across(m.cell, m.p)).toBe(null));
    });

    it('隣り合うマスの境目の点は、どちらのマスから見ても同じ点', () => {
        for (let cell = 0; cell < 36; cell++) {
            for (let p = 0; p < 8; p++) {
                const next = across(cell, p);
                if (next) expect(pointKey(next.cell, next.p)).toBe(pointKey(cell, p));
            }
        }
    });

    it('同じ道の両側から進んだ2つの駒は出会って脱落し、出会った点で止まる', () => {
        const board = Array(36).fill(null);
        const t = TILES.findIndex(m => m[0] === 7);
        const moves = simulate(board, [{ seat: 0, pos: { cell: 0, p: 0 } }, { seat: 1, pos: { cell: 0, p: 7 } }], 0, { tile: t, rot: 0 });
        expect(moves.map(m => m.out)).toEqual(['collision', 'collision']);
        expect(board[0]).toBe(null);  // 盤は変えない
    });
});
