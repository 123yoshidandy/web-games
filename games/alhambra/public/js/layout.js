/**
 * アルハンブラ（各自の建物の並び）の道具：置ける場所・外せるタイル・入れ替え・最長の城壁
 * 並びは { "x,y": タイルの id か 'F'（噴水） } の形。x は右へ、y は下へ増える。噴水は (0, 0)
 *
 * 置く決まり
 * - 向きは変えない。接する辺は、両方に城壁があるか、両方にないか
 * - 噴水から、城壁を越えずにタイルの上だけを歩いて行ける
 * - 少なくとも1辺で接する（角だけで接してはいけない）
 * - 四方をタイルに囲まれた空き（何マスでも）を作らない
 */

import { TILES, FOUNTAIN } from './cards.js';

const DIRS = [
    { side: 'n', opposite: 's', dx: 0, dy: -1 },
    { side: 'e', opposite: 'w', dx: 1, dy: 0 },
    { side: 's', opposite: 'n', dx: 0, dy: 1 },
    { side: 'w', opposite: 'e', dx: -1, dy: 0 }
];
const NO_WALLS = { n: false, e: false, s: false, w: false };

export const keyOf = (x, y) => `${x},${y}`;
export const parseKey = (key) => key.split(',').map(Number);
export const wallsOf = (tile) => (tile === FOUNTAIN ? NO_WALLS : TILES[tile].walls);

export const newLayout = () => ({ [keyOf(0, 0)]: FOUNTAIN });

// 噴水から歩いて行けるタイルの場所
function reachable(layout) {
    const seen = new Set([keyOf(0, 0)]);
    const stack = [[0, 0]];
    while (stack.length) {
        const [x, y] = stack.pop();
        const walls = wallsOf(layout[keyOf(x, y)]);
        for (const d of DIRS) {
            const key = keyOf(x + d.dx, y + d.dy);
            if (seen.has(key) || layout[key] === undefined) continue;
            if (walls[d.side] || wallsOf(layout[key])[d.opposite]) continue;
            seen.add(key);
            stack.push([x + d.dx, y + d.dy]);
        }
    }
    return seen;
}

// 四方を囲まれた空きがあるか（並びを囲む枠の外から空きをたどり、届かない空きがあれば囲まれている）
export function hasHole(layout) {
    const keys = Object.keys(layout).map(parseKey);
    const minX = Math.min(...keys.map(([x]) => x)) - 1, maxX = Math.max(...keys.map(([x]) => x)) + 1;
    const minY = Math.min(...keys.map(([, y]) => y)) - 1, maxY = Math.max(...keys.map(([, y]) => y)) + 1;
    const seen = new Set([keyOf(minX, minY)]);
    const stack = [[minX, minY]];
    while (stack.length) {
        const [x, y] = stack.pop();
        for (const d of DIRS) {
            const nx = x + d.dx, ny = y + d.dy;
            if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
            const key = keyOf(nx, ny);
            if (seen.has(key) || layout[key] !== undefined) continue;
            seen.add(key);
            stack.push([nx, ny]);
        }
    }
    const empty = (maxX - minX + 1) * (maxY - minY + 1) - keys.length;
    return seen.size < empty;
}

// 並び全体が決まりを満たすか（歩いて行ける・囲まれた空きがない・接する辺の城壁が合う）
export function isValid(layout) {
    if (layout[keyOf(0, 0)] !== FOUNTAIN) return false;
    for (const [key, tile] of Object.entries(layout)) {
        const [x, y] = parseKey(key);
        for (const d of DIRS) {
            const other = layout[keyOf(x + d.dx, y + d.dy)];
            if (other !== undefined && wallsOf(tile)[d.side] !== wallsOf(other)[d.opposite]) return false;
        }
    }
    return reachable(layout).size === Object.keys(layout).length && !hasHole(layout);
}

// タイルを (x, y) に置けない理由（置けるなら null）
export function placeError(layout, tile, x, y) {
    if (layout[keyOf(x, y)] !== undefined) return 'そこには建物があります';
    const walls = wallsOf(tile);
    let touching = false, path = false;
    for (const d of DIRS) {
        const other = layout[keyOf(x + d.dx, y + d.dy)];
        if (other === undefined) continue;
        touching = true;
        if (walls[d.side] !== wallsOf(other)[d.opposite]) return '城壁が合いません';
        if (!walls[d.side]) path = true;
    }
    if (!touching) return '辺で接する場所に置きます';
    if (!path) return '噴水から歩いて行けません';
    if (hasHole({ ...layout, [keyOf(x, y)]: tile })) return '空きを囲んでしまいます';
    return null;
}

// 置ける場所の一覧（[x, y]）
export function placeSpots(layout, tile) {
    const spots = new Map();
    Object.keys(layout).map(parseKey).forEach(([x, y]) => DIRS.forEach(d => {
        const key = keyOf(x + d.dx, y + d.dy);
        if (layout[key] === undefined && !spots.has(key)) spots.set(key, [x + d.dx, y + d.dy]);
    }));
    return [...spots.values()].filter(([x, y]) => placeError(layout, tile, x, y) === null);
}

// (x, y) のタイルを外せない理由（外せるなら null）
export function removeError(layout, x, y) {
    const key = keyOf(x, y);
    if (layout[key] === undefined) return 'そこに建物はありません';
    if (layout[key] === FOUNTAIN) return '噴水は動かせません';
    const after = { ...layout };
    delete after[key];
    if (reachable(after).size !== Object.keys(after).length) return '外すと、歩いて行けない建物ができます';
    if (hasHole(after)) return '外すと、空きが囲まれます';
    return null;
}

// (x, y) のタイルを、予備のタイルと入れ替えられない理由
export function swapError(layout, tile, x, y) {
    const key = keyOf(x, y);
    if (layout[key] === undefined) return 'そこに建物はありません';
    if (layout[key] === FOUNTAIN) return '噴水は入れ替えられません';
    const after = { ...layout, [key]: tile };
    if (!isValid(after)) return '入れ替えると、決まりに合いません';
    return null;
}

// 外側に出ている城壁（隣が空き）の、つながった最も長い長さ
export function longestWall(layout) {
    // 城壁の1区画を、格子の点どうしを結ぶ辺として、点でつながるものを数える
    const parent = new Map();
    const find = (p) => {
        while (parent.get(p) !== p) {
            parent.set(p, parent.get(parent.get(p)));
            p = parent.get(p);
        }
        return p;
    };
    const add = (p) => { if (!parent.has(p)) parent.set(p, p); };
    const segments = [];
    for (const [key, tile] of Object.entries(layout)) {
        const [x, y] = parseKey(key);
        const walls = wallsOf(tile);
        for (const d of DIRS) {
            if (!walls[d.side] || layout[keyOf(x + d.dx, y + d.dy)] !== undefined) continue;
            const ends = {
                n: [[x, y], [x + 1, y]], s: [[x, y + 1], [x + 1, y + 1]],
                w: [[x, y], [x, y + 1]], e: [[x + 1, y], [x + 1, y + 1]]
            }[d.side].map(([px, py]) => `${px}:${py}`);
            ends.forEach(add);
            parent.set(find(ends[0]), find(ends[1]));
            segments.push(ends[0]);
        }
    }
    const sizes = new Map();
    segments.forEach(p => { const root = find(p); sizes.set(root, (sizes.get(root) ?? 0) + 1); });
    return Math.max(0, ...sizes.values());
}

// 種類ごとの枚数
export function countTypes(layout) {
    const counts = { pavilion: 0, seraglio: 0, arcades: 0, chambers: 0, garden: 0, tower: 0 };
    Object.values(layout).forEach(tile => { if (tile !== FOUNTAIN) counts[TILES[tile].type]++; });
    return counts;
}
