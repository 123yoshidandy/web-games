/**
 * タイル（ダイスの目と特別なタイル）の形・向き・盤の決まり
 * DOM に依存しない。辺は 0=上・1=右・2=下・3=左
 *
 * タイルの形は、辺ごとの種類（road：道・rail：線路・null：何もない）と、
 * 中でつながっている辺のまとまり（groups）で表す。高架だけは、道と線路が別のまとまり（交わるがつながらない）
 * 駅は、道と線路をつなぐ（まとまりが1つ）
 */

export const SIZE = 7;
export const ROUNDS = 7;
export const MAX_SPECIALS = 3;
export const DIR = [[0, -1], [1, 0], [0, 1], [-1, 0]];   // 辺の向き → [dx, dy]
export const opposite = (d) => (d + 2) % 4;

const R = 'road';
const L = 'rail';

// 向き 0 のときの形。edges は [上, 右, 下, 左]
export const TILES = {
    'road-straight': { name: '道（直線）', edges: [R, null, R, null] },
    'road-curve': { name: '道（カーブ）', edges: [R, R, null, null] },
    'road-t': { name: '道（T字）', edges: [null, R, R, R] },
    'rail-straight': { name: '線路（直線）', edges: [L, null, L, null] },
    'rail-curve': { name: '線路（カーブ）', edges: [L, L, null, null] },
    'rail-t': { name: '線路（T字）', edges: [null, L, L, L] },
    overpass: { name: '高架', edges: [R, L, R, L], groups: [[0, 2], [1, 3]] },
    'station-straight': { name: '駅（直線）', edges: [L, null, R, null], station: true },
    'station-curve': { name: '駅（カーブ）', edges: [L, null, null, R], station: true },
    // 特別なタイル（ゲーム全体で3つまで、1ラウンドに1つまで。それぞれ1回だけ）
    's1': { name: '駅（道2・線路2・向かい合う）', edges: [L, R, L, R], station: true, special: true },
    's2': { name: '駅（線路3・道1）', edges: [L, R, L, L], station: true, special: true },
    's3': { name: '道の十字路', edges: [R, R, R, R], special: true },
    's4': { name: '線路の十字路', edges: [L, L, L, L], special: true },
    's5': { name: '駅（道3・線路1）', edges: [L, R, R, R], station: true, special: true },
    's6': { name: '駅（道2・線路2・隣り合う）', edges: [L, L, R, R], station: true, special: true }
};
export const SPECIALS = ['s1', 's2', 's3', 's4', 's5', 's6'];

// ダイスの面。3つは道・線路の6面、1つは高架・直線の駅・カーブの駅が2面ずつ
export const ROUTE_DIE = ['road-straight', 'road-curve', 'road-t', 'rail-straight', 'rail-curve', 'rail-t'];
export const STATION_DIE = ['overpass', 'overpass', 'station-straight', 'station-straight', 'station-curve', 'station-curve'];
export const DICE = [ROUTE_DIE, ROUTE_DIE, ROUTE_DIE, STATION_DIE];

// 外周の出口：上下は 道・線路・道、左右は 線路・道・線路（2・4・6 列目と行目）
// キーは「盤の外のマスの座標」。そのマスに向いた辺が出口
export const EXITS = (() => {
    const list = [];
    [[1, R], [3, L], [5, R]].forEach(([i, type]) => {
        list.push({ x: i, y: -1, dir: 0, type });          // 上（マス (i,0) の上の辺）
        list.push({ x: i, y: SIZE, dir: 2, type });        // 下
    });
    [[1, L], [3, R], [5, L]].forEach(([i, type]) => {
        list.push({ x: -1, y: i, dir: 3, type });          // 左
        list.push({ x: SIZE, y: i, dir: 1, type });        // 右
    });
    return list.map((e, id) => ({ id, ...e }));
})();
const EXIT_AT = new Map(EXITS.map(e => [`${e.x},${e.y}`, e]));
export const exitAt = (x, y) => EXIT_AT.get(`${x},${y}`) ?? null;

export const CENTER = (x, y) => x >= 2 && x <= 4 && y >= 2 && y <= 4;
export const inside = (x, y) => x >= 0 && x < SIZE && y >= 0 && y < SIZE;
export const index = (x, y) => y * SIZE + x;

// 向き o（0〜7）：o % 4 だけ右に回し、o >= 4 なら先に左右を裏返す
function mapDir(d, o) {
    const m = o >= 4 ? (4 - d) % 4 : d;
    return (m + (o % 4)) % 4;
}

// 向きを付けたタイルの形：edges[辺] = 種類、group[辺] = まとまりの番号（なければ -1）
const shapeCache = new Map();
export function shapeOf(kind, o) {
    const key = `${kind}:${o}`;
    if (shapeCache.has(key)) return shapeCache.get(key);
    const tile = TILES[kind];
    const edges = [null, null, null, null];
    const group = [-1, -1, -1, -1];
    const groups = tile.groups ?? [tile.edges.map((t, d) => (t ? d : -1)).filter(d => d >= 0)];
    tile.edges.forEach((t, d) => { edges[mapDir(d, o)] = t; });
    groups.forEach((g, gi) => g.forEach(d => { group[mapDir(d, o)] = gi; }));
    const shape = { kind, o, edges, group, groupCount: groups.length };
    shapeCache.set(key, shape);
    return shape;
}

// 見た目の違う向きだけ（直線は2通り、十字は1通り、など）
const orientCache = new Map();
export function distinctOrientations(kind) {
    if (orientCache.has(kind)) return orientCache.get(kind);
    const seen = new Set();
    const list = [];
    for (let o = 0; o < 8; o++) {
        const s = shapeOf(kind, o);
        const sig = s.edges.join(',') + '|' + s.group.join(',');
        if (seen.has(sig)) continue;
        seen.add(sig);
        list.push(o);
    }
    orientCache.set(kind, list);
    return list;
}

// cells[index] = { kind, o, round } か null
// 置けなければ理由の文、置けるなら null
export function placementError(cells, kind, x, y, o) {
    if (!inside(x, y)) return '盤の外です';
    if (cells[index(x, y)]) return 'もう描いてあるマスです';
    const shape = shapeOf(kind, o);
    let connected = false;
    for (let d = 0; d < 4; d++) {
        const t = shape.edges[d];
        if (!t) continue;
        const nx = x + DIR[d][0];
        const ny = y + DIR[d][1];
        if (inside(nx, ny)) {
            const other = cells[index(nx, ny)];
            if (!other) continue;
            const u = shapeOf(other.kind, other.o).edges[opposite(d)];
            if (!u) continue;
            if (u !== t) return '道と線路は、直接つなげません（駅が要ります）';
            connected = true;
        } else {
            const exit = exitAt(nx, ny);
            if (!exit) continue;
            if (exit.type !== t) return exit.type === 'road' ? 'この出口は道です。線路はつなげません' : 'この出口は線路です。道はつなげません';
            connected = true;
        }
    }
    if (!connected) return '出口か、描いてある道・線路につなげてください';
    return null;
}

// そのタイルを置ける場所と向きがあるか
export function canPlaceAnywhere(cells, kind) {
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (cells[index(x, y)]) continue;
            for (const o of distinctOrientations(kind)) {
                if (!placementError(cells, kind, x, y, o)) return true;
            }
        }
    }
    return false;
}

// 置ける場所と向きの一覧
export function legalPlacements(cells, kind) {
    const list = [];
    for (let y = 0; y < SIZE; y++) {
        for (let x = 0; x < SIZE; x++) {
            if (cells[index(x, y)]) continue;
            for (const o of distinctOrientations(kind)) {
                if (!placementError(cells, kind, x, y, o)) list.push({ x, y, o });
            }
        }
    }
    return list;
}
