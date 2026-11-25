import { describe, it, expect } from 'vitest';
import { TILES } from '../public/js/cards.js';
import { newLayout, keyOf, placeError, placeSpots, removeError, swapError, longestWall, countTypes, isValid, hasHole } from '../public/js/layout.js';
import { rankPoints } from '../public/js/game.js';

// 城壁のないタイル（どこにでも置きやすい）
const OPEN = TILES.filter(t => !t.walls.n && !t.walls.e && !t.walls.s && !t.walls.w).map(t => t.id);
const find = (type, cost, walls) => TILES.find(t => t.type === type && t.cost === cost
    && ['n', 'e', 's', 'w'].every(d => t.walls[d] === walls.includes(d.toUpperCase()))).id;
const layoutOf = (entries) => {
    const layout = newLayout();
    entries.forEach(([x, y, tile]) => { layout[keyOf(x, y)] = tile; });
    return layout;
};

describe('建物タイルのデータ', () => {
    it('54枚で、種類ごとの枚数と値段の幅が公式どおり', () => {
        expect(TILES.length).toBe(54);
        const byType = (type) => TILES.filter(t => t.type === type);
        expect(['pavilion', 'seraglio', 'arcades', 'chambers', 'garden', 'tower'].map(t => byType(t).length)).toEqual([7, 7, 9, 9, 11, 11]);
        expect(['pavilion', 'seraglio', 'arcades', 'chambers', 'garden', 'tower'].map(t => {
            const costs = byType(t).map(x => x.cost);
            return `${Math.min(...costs)}-${Math.max(...costs)}`;
        })).toEqual(['2-8', '3-9', '4-10', '5-11', '6-12', '7-13']);
        // 城壁は3辺まで
        expect(TILES.every(t => Object.values(t.walls).filter(Boolean).length <= 3)).toBe(true);
    });
});

describe('置く決まり', () => {
    it('接する辺の城壁が合えば置ける。合わなければ置けない', () => {
        const eastWall = find('pavilion', 7, 'E');
        expect(placeError(newLayout(), eastWall, 1, 0)).toBe(null);
        expect(placeError(newLayout(), eastWall, -1, 0)).toBe('城壁が合いません');
        const northWall = find('pavilion', 6, 'N');
        expect(placeError(newLayout(), northWall, 0, -1)).toBe(null);
        expect(placeError(newLayout(), northWall, 0, 1)).toBe('城壁が合いません');
    });

    it('角だけでは置けず、建物の上に重ねられない', () => {
        expect(placeError(newLayout(), OPEN[0], 1, 1)).toBe('辺で接する場所に置きます');
        expect(placeError(newLayout(), OPEN[0], 0, 0)).toBe('そこには建物があります');
    });

    it('噴水から歩いて行けない置き方はできない', () => {
        const eastWall = find('pavilion', 7, 'E');
        const westWall = find('seraglio', 7, 'W');
        const layout = layoutOf([[1, 0, eastWall]]);
        expect(placeError(layout, westWall, 2, 0)).toBe('噴水から歩いて行けません');
    });

    it('空きを囲む置き方はできない', () => {
        const ring = [[1, 0], [2, 0], [2, 1], [2, 2], [1, 2], [0, 2]];
        const layout = layoutOf(ring.map(([x, y], i) => [x, y, OPEN[i]]));
        expect(hasHole(layout)).toBe(false);
        expect(placeError(layout, OPEN[6], 0, 1)).toBe('空きを囲んでしまいます');
    });

    it('置ける場所を列挙できる', () => {
        expect(placeSpots(newLayout(), OPEN[0]).length).toBe(4);
        expect(placeSpots(newLayout(), find('pavilion', 7, 'E')).map(s => s.join(',')).sort()).toEqual(['0,-1', '0,1', '1,0']);
    });
});

describe('作り直し', () => {
    it('外すと歩いて行けない建物ができるなら、外せない。噴水は外せない', () => {
        const layout = layoutOf([[1, 0, OPEN[0]], [2, 0, OPEN[1]]]);
        expect(removeError(layout, 1, 0)).toContain('歩いて行けない');
        expect(removeError(layout, 2, 0)).toBe(null);
        expect(removeError(layout, 0, 0)).toBe('噴水は動かせません');
    });

    it('入れ替えは、同じ場所で決まりに合うときだけ', () => {
        const layout = layoutOf([[1, 0, OPEN[0]], [2, 0, OPEN[1]]]);
        expect(swapError(layout, find('pavilion', 7, 'E'), 1, 0)).toContain('決まり');
        expect(swapError(layout, OPEN[2], 1, 0)).toBe(null);
    });
});

describe('城壁と枚数', () => {
    it('外側の城壁の、つながった最も長い長さ', () => {
        const ne = find('seraglio', 4, 'NE');
        expect(longestWall(layoutOf([[1, 0, ne]]))).toBe(2);
        expect(longestWall(newLayout())).toBe(0);
    });

    it('種類ごとに数える（噴水は数えない）', () => {
        const counts = countTypes(layoutOf([[1, 0, find('tower', 12, '')], [2, 0, find('tower', 11, '')]]));
        expect(counts.tower).toBe(2);
        expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(2);
    });

    it('並び全体の決まりを確かめられる', () => {
        expect(isValid(layoutOf([[1, 0, OPEN[0]]]))).toBe(true);
        expect(isValid(layoutOf([[-1, 0, find('pavilion', 7, 'E')]]))).toBe(false);
    });
});

describe('順位の点', () => {
    it('同じ枚数なら、その順位の点を足して等分（切り捨て）。0枚は点なし', () => {
        const entries = [{ id: 'a', count: 3 }, { id: 'b', count: 3 }, { id: 'c', count: 1 }, { id: 'd', count: 0 }];
        const third = rankPoints(entries, [16, 8, 1]);
        expect([third.get('a'), third.get('b'), third.get('c'), third.get('d')]).toEqual([12, 12, 1, undefined]);
        const second = rankPoints(entries, [8, 1]);
        expect([second.get('a'), second.get('b'), second.get('c')]).toEqual([4, 4, undefined]);
        const first = rankPoints([{ id: 'a', count: 2 }, { id: 'b', count: 1 }], [5]);
        expect([first.get('a'), first.get('b')]).toEqual([5, undefined]);
    });
});
