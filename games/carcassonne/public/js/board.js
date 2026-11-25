/**
 * 盤面：置いたタイルと、つながった要素（道・都市・草原・修道院）の領域
 * DOM に依存しない。ゲーム・CPU・テスト・画面が同じものを使う
 */

import { rotatedTile, oppositeSide, oppositeHalf, SIDE_DELTA, UNIQUE_ROTATIONS } from './tiles.js';

export const cellKey = (x, y) => `${x},${y}`;

const NEIGHBORS_8 = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

export class Board {
    constructor() {
        this.cells = new Map();
    }

    get(x, y) {
        return this.cells.get(cellKey(x, y)) ?? null;
    }

    // タイルを置く（判定はしない）。meeple: { seat, feature } か null
    place(x, y, type, rot, meeple = null) {
        const cell = { x, y, key: cellKey(x, y), type, rot, shape: rotatedTile(type, rot), meeple };
        this.cells.set(cell.key, cell);
        return cell;
    }

    remove(x, y) {
        this.cells.delete(cellKey(x, y));
    }

    neighbor(x, y, side) {
        const [dx, dy] = SIDE_DELTA[side];
        return this.get(x + dx, y + dy);
    }

    // タイルに接している空きマス（置ける場所の候補）
    frontier() {
        const result = new Map();
        for (const cell of this.cells.values()) {
            SIDE_DELTA.forEach(([dx, dy]) => {
                const key = cellKey(cell.x + dx, cell.y + dy);
                if (!this.cells.has(key) && !result.has(key)) result.set(key, { x: cell.x + dx, y: cell.y + dy });
            });
        }
        return [...result.values()];
    }

    // 空きマスに、その向きで置けるか（隣のタイルと辺の種類がすべてそろい、少なくとも 1 枚に接する）
    canPlace(type, rot, x, y) {
        if (this.get(x, y)) return false;
        const shape = rotatedTile(type, rot);
        let touching = 0;
        for (let side = 0; side < 4; side++) {
            const n = this.neighbor(x, y, side);
            if (!n) continue;
            touching++;
            if (n.shape.edges[oppositeSide(side)] !== shape.edges[side]) return false;
        }
        return touching > 0;
    }

    // そのタイルを置ける場所と向きの一覧（同じ形になる向きは 1 つにまとめる）
    placements(type) {
        const result = [];
        this.frontier().forEach(({ x, y }) => {
            UNIQUE_ROTATIONS[type].forEach(rot => {
                if (this.canPlace(type, rot, x, y)) result.push({ x, y, rot });
            });
        });
        return result;
    }

    hasPlacement(type) {
        return this.frontier().some(({ x, y }) => UNIQUE_ROTATIONS[type].some(rot => this.canPlace(type, rot, x, y)));
    }

    // 置いたばかりのタイルで、コマを置ける要素の番号（つながった先に、誰のコマもないもの）
    // 盤面を一時的に変えるが、必ず元に戻す
    meepleOptions(type, rot, x, y) {
        const placed = !this.get(x, y);
        if (placed) this.place(x, y, type, rot);
        try {
            return rotatedTile(type, rot).features
                .map((f, i) => i)
                .filter(i => this.region(x, y, i).meeples.length === 0);
        } finally {
            if (placed) this.remove(x, y);
        }
    }

    // 周りの 8 マスのうち、タイルがある数
    surroundCount(x, y) {
        return NEIGHBORS_8.filter(([dx, dy]) => this.get(x + dx, y + dy)).length;
    }

    /**
     * (x, y) のタイルの要素 feature とつながった領域
     * 戻り値：{ id, kind, cells: Set<key>, nodes: [{ cell, feature }], open, shields, meeples: [{ seat, x, y }], complete, cityNodes }
     *   open：まだタイルが来ていない辺の数（道・都市）。0 なら完成
     *   cityNodes：草原が接している都市（{ cell, feature }。草原の得点に使う）
     */
    region(x, y, feature) {
        const start = this.get(x, y);
        const kind = start.shape.features[feature].kind;
        if (kind === 'monastery') return this.monasteryRegion(start, feature);
        const seen = new Set();
        const stack = [[start, feature]];
        const nodes = [];
        const cells = new Set();
        const meeples = [];
        const cityNodes = [];
        let open = 0;
        let shields = 0;
        while (stack.length > 0) {
            const [cell, fi] = stack.pop();
            const nodeKey = `${cell.key}/${fi}`;
            if (seen.has(nodeKey)) continue;
            seen.add(nodeKey);
            nodes.push({ cell, feature: fi, key: nodeKey });
            cells.add(cell.key);
            const f = cell.shape.features[fi];
            if (f.shield) shields++;
            if (cell.meeple && cell.meeple.feature === fi) meeples.push({ seat: cell.meeple.seat, x: cell.x, y: cell.y });
            if (kind === 'field') {
                f.cities.forEach(ci => cityNodes.push({ cell, feature: ci }));
                f.halves.forEach(h => {
                    const n = this.neighbor(cell.x, cell.y, h >> 1);
                    if (n) stack.push([n, n.shape.halfFeature[oppositeHalf(h)]]);
                });
            } else {
                f.sides.forEach(s => {
                    const n = this.neighbor(cell.x, cell.y, s);
                    if (n) stack.push([n, n.shape.sideFeature[oppositeSide(s)]]);
                    else open++;
                });
            }
        }
        const id = nodes.map(n => n.key).sort()[0];
        return { id, kind, cells, nodes, open, shields, meeples, complete: kind !== 'field' && open === 0, cityNodes };
    }

    monasteryRegion(cell, feature) {
        const count = this.surroundCount(cell.x, cell.y);
        const cells = new Set([cell.key]);
        NEIGHBORS_8.forEach(([dx, dy]) => {
            const n = this.get(cell.x + dx, cell.y + dy);
            if (n) cells.add(n.key);
        });
        const meeples = cell.meeple && cell.meeple.feature === feature ? [{ seat: cell.meeple.seat, x: cell.x, y: cell.y }] : [];
        return {
            id: `${cell.key}/${feature}`, kind: 'monastery', cells, nodes: [{ cell, feature, key: `${cell.key}/${feature}` }],
            open: 8 - count, shields: 0, meeples, complete: count === 8, cityNodes: [], surround: count
        };
    }

    // 草原に接している、完成した都市の数（同じ都市は 1 回だけ数える）
    completedCitiesOf(fieldRegion, cache = new Map()) {
        const ids = new Set();
        fieldRegion.cityNodes.forEach(({ cell, feature }) => {
            const nodeKey = `${cell.key}/${feature}`;
            let city = cache.get(nodeKey);
            if (!city) {
                city = this.region(cell.x, cell.y, feature);
                city.nodes.forEach(n => cache.set(n.key, city));
            }
            if (city.complete) ids.add(city.id);
        });
        return ids.size;
    }

    // 盤面の全要素の領域（同じ領域は 1 回だけ）
    allRegions() {
        const seen = new Set();
        const regions = [];
        for (const cell of this.cells.values()) {
            cell.shape.features.forEach((f, fi) => {
                if (seen.has(`${cell.key}/${fi}`)) return;
                const region = this.region(cell.x, cell.y, fi);
                region.nodes.forEach(n => seen.add(n.key));
                regions.push(region);
            });
        }
        return regions;
    }
}

// 領域の得点（完成していれば完成の得点、していなければ終了時の得点）。草原は、接している完成した都市の数を渡す
export function regionPoints(region, { completedCities = 0 } = {}) {
    switch (region.kind) {
        case 'road':
            return region.cells.size;
        case 'city':
            // 完成した都市は 1 枚・紋章 1 つにつき 2 点、未完成（終了時）は 1 点。第2版では、2 枚だけの都市も 1 枚 2 点
            return (region.complete ? 2 : 1) * (region.cells.size + region.shields);
        case 'monastery':
            return region.complete ? 9 : 1 + region.surround;
        case 'field':
            return 3 * completedCities;
        default:
            return 0;
    }
}

// コマが一番多い席（同数なら全員）
export function majority(meeples) {
    const counts = new Map();
    meeples.forEach(m => counts.set(m.seat, (counts.get(m.seat) ?? 0) + 1));
    const max = Math.max(0, ...counts.values());
    if (max === 0) return [];
    return [...counts.entries()].filter(([, n]) => n === max).map(([seat]) => seat).sort((a, b) => a - b);
}
