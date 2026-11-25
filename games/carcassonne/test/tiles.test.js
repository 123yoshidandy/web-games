import { describe, it, expect } from 'vitest';
import { TILE_DEFS, TILE_TYPES, UNIQUE_ROTATIONS, bagTiles, rotatedTile, rotatePoint, oppositeHalf, oppositeSide } from '../public/js/tiles.js';

describe('タイルの構成', () => {
    it('基本セットは 72 枚（開始タイルを除いて袋に 71 枚）', () => {
        const total = TILE_TYPES.reduce((sum, t) => sum + TILE_DEFS[t].count, 0);
        expect(total).toBe(72);
        expect(bagTiles()).toHaveLength(71);
    });

    it('種類ごとの枚数', () => {
        const counts = Object.fromEntries(TILE_TYPES.map(t => [t, TILE_DEFS[t].count]));
        expect(counts).toEqual({
            A: 2, B: 4, C: 1, D: 4, E: 5, F: 2, G: 1, H: 3, I: 2, J: 3, K: 3, L: 3,
            M: 2, N: 3, O: 2, P: 3, Q: 1, R: 3, S: 2, T: 1, U: 8, V: 9, W: 4, X: 1
        });
    });

    it('紋章は 10 個、修道院は 6 つ', () => {
        let shields = 0;
        let monasteries = 0;
        TILE_TYPES.forEach(t => TILE_DEFS[t].features.forEach(f => {
            if (f.shield) shields += TILE_DEFS[t].count;
            if (f.kind === 'monastery') monasteries += TILE_DEFS[t].count;
        }));
        expect(shields).toBe(10);
        expect(monasteries).toBe(6);
    });

    it('どのタイルも、辺と半辺の割り当てに抜けや重なりがない', () => {
        TILE_TYPES.forEach(type => {
            const features = TILE_DEFS[type].features;
            const sideOwner = [0, 0, 0, 0];
            const halfOwner = new Array(8).fill(0);
            features.forEach(f => {
                f.sides?.forEach(s => sideOwner[s]++);
                f.halves?.forEach(h => halfOwner[h]++);
                if (f.kind === 'field') f.cities.forEach(ci => expect(features[ci].kind, `${type}`).toBe('city'));
            });
            for (let s = 0; s < 4; s++) {
                expect(sideOwner[s], `${type} 辺${s}`).toBeLessThanOrEqual(1);
                const kind = features.find(f => f.sides?.includes(s))?.kind ?? 'field';
                const halves = [2 * s, 2 * s + 1].map(h => halfOwner[h]);
                // 都市の辺には草原がない。道と草原の辺は、両側の半辺が草原
                expect(halves, `${type} 辺${s}`).toEqual(kind === 'city' ? [0, 0] : [1, 1]);
            }
        });
    });

    it('同じ形になる向きは 1 つにまとめる', () => {
        expect(UNIQUE_ROTATIONS.B).toEqual([0]);
        expect(UNIQUE_ROTATIONS.C).toEqual([0]);
        expect(UNIQUE_ROTATIONS.X).toEqual([0]);
        expect(UNIQUE_ROTATIONS.U).toEqual([0, 1]);
        expect(UNIQUE_ROTATIONS.F).toEqual([0, 1]);
        expect(UNIQUE_ROTATIONS.H).toEqual([0, 1]);
        expect(UNIQUE_ROTATIONS.D).toEqual([0, 1, 2, 3]);
        expect(UNIQUE_ROTATIONS.V).toEqual([0, 1, 2, 3]);
    });

    it('回すと、辺・半辺・コマの位置が時計回りに動く', () => {
        const d1 = rotatedTile('D', 1);
        expect(d1.edges).toEqual(['road', 'city', 'road', 'field']);
        expect(rotatePoint([50, 0], 1)).toEqual([100, 50]);
        expect(rotatePoint([50, 0], 2)).toEqual([50, 100]);
        // D の上の草原（東の北寄り・西の北寄り）は、1 回まわすと南の東寄り・北の東寄りになる
        const topField = d1.features[2];
        expect([...topField.halves].sort()).toEqual([1, 4]);
    });

    it('向かい側の辺と半辺', () => {
        expect([0, 1, 2, 3].map(oppositeSide)).toEqual([2, 3, 0, 1]);
        expect([0, 1, 2, 3, 4, 5, 6, 7].map(oppositeHalf)).toEqual([5, 4, 7, 6, 1, 0, 3, 2]);
    });
});
