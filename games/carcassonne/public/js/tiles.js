/**
 * タイルの定義（基本セット 72 枚。開始タイル 1 枚を含む）
 *
 * 辺の番号：0=北 1=東 2=南 3=西
 * 草原は、辺を半分に分けた「半辺」でつながりを持つ（北西の角から時計回り）
 *   0=北の西寄り 1=北の東寄り 2=東の北寄り 3=東の南寄り 4=南の東寄り 5=南の西寄り 6=西の南寄り 7=西の北寄り
 * 向き（rot）は、時計回りに 90° ずつ回した回数（0〜3）
 *
 * 各タイルの要素（features）：
 *   city      都市。sides：接する辺、shield：紋章
 *   road      道。sides：道が出ている辺（交差点・修道院・都市で止まる道は 1 辺だけ）
 *   field     草原。halves：接する半辺、cities：このタイルの上で接している都市（features の番号）
 *   monastery 修道院
 *   spot      コマを置いたときの位置（タイルを 100×100 としたときの座標）
 */

const city = (sides, spot, shield = false) => ({ kind: 'city', sides, shield, spot });
const road = (sides, spot) => ({ kind: 'road', sides, spot });
const field = (halves, cities, spot) => ({ kind: 'field', halves, cities, spot });
const monastery = spot => ({ kind: 'monastery', spot });

const ALL_HALVES = [0, 1, 2, 3, 4, 5, 6, 7];

// 文字は、広く使われている基本セットのタイルの呼び名（A〜X）に合わせた
export const TILE_DEFS = {
    // 修道院と、南へ出る道
    A: { count: 2, features: [monastery([50, 44]), road([2], [50, 86]), field(ALL_HALVES, [], [17, 17])] },
    // 修道院
    B: { count: 4, features: [monastery([50, 48]), field(ALL_HALVES, [], [17, 17])] },
    // 4 辺すべてが都市（紋章つき）
    C: { count: 1, features: [city([0, 1, 2, 3], [50, 50], true)] },
    // 北に都市、東西に道（開始タイルと同じ形。開始タイルを含めて 4 枚）
    D: { count: 4, features: [city([0], [50, 11]), road([1, 3], [74, 50]), field([2, 7], [0], [24, 33]), field([3, 4, 5, 6], [], [50, 78])] },
    // 北に都市
    E: { count: 5, features: [city([0], [50, 11]), field([2, 3, 4, 5, 6, 7], [0], [50, 62])] },
    // 東西をつなぐ都市（紋章つき）
    F: { count: 2, features: [city([1, 3], [50, 50], true), field([0, 1], [0], [50, 9]), field([4, 5], [0], [50, 91])] },
    // 南北をつなぐ都市
    G: { count: 1, features: [city([0, 2], [50, 50]), field([2, 3], [0], [91, 50]), field([6, 7], [0], [9, 50])] },
    // 東と西に、別々の都市
    H: { count: 3, features: [city([1], [89, 50]), city([3], [11, 50]), field([0, 1, 4, 5], [0, 1], [50, 50])] },
    // 北と西に、別々の都市
    I: { count: 2, features: [city([0], [50, 10]), city([3], [10, 50]), field([2, 3, 4, 5], [0, 1], [62, 62])] },
    // 北に都市、東から南へ曲がる道
    J: { count: 3, features: [city([0], [50, 11]), road([1, 2], [64, 64]), field([2, 5, 6, 7], [0], [27, 58]), field([3, 4], [], [87, 87])] },
    // 北に都市、西から南へ曲がる道
    K: { count: 3, features: [city([0], [50, 11]), road([2, 3], [36, 64]), field([2, 3, 4, 7], [0], [73, 58]), field([5, 6], [], [13, 87])] },
    // 北に都市、東・南・西の道が交差点で止まる
    L: { count: 3, features: [city([0], [50, 10]), road([1], [83, 50]), road([2], [50, 83]), road([3], [17, 50]), field([2, 7], [0], [30, 34]), field([3, 4], [], [83, 83]), field([5, 6], [], [17, 83])] },
    // 北と西がつながった都市（紋章つき）
    M: { count: 2, features: [city([0, 3], [30, 30], true), field([2, 3, 4, 5], [0], [72, 72])] },
    // 北と西がつながった都市
    N: { count: 3, features: [city([0, 3], [30, 30]), field([2, 3, 4, 5], [0], [72, 72])] },
    // 北と西がつながった都市（紋章つき）と、東から南へ曲がる道
    O: { count: 2, features: [city([0, 3], [28, 28], true), road([1, 2], [64, 64]), field([2, 5], [0], [87, 22]), field([3, 4], [], [87, 87])] },
    // 北と西がつながった都市と、東から南へ曲がる道
    P: { count: 3, features: [city([0, 3], [28, 28]), road([1, 2], [64, 64]), field([2, 5], [0], [87, 22]), field([3, 4], [], [87, 87])] },
    // 北・東・西の都市（紋章つき）
    Q: { count: 1, features: [city([0, 1, 3], [50, 36], true), field([4, 5], [0], [50, 89])] },
    // 北・東・西の都市
    R: { count: 3, features: [city([0, 1, 3], [50, 36]), field([4, 5], [0], [50, 89])] },
    // 北・東・西の都市（紋章つき）と、南へ出る道
    S: { count: 2, features: [city([0, 1, 3], [50, 34], true), road([2], [50, 89]), field([4], [0], [81, 89]), field([5], [0], [19, 89])] },
    // 北・東・西の都市と、南へ出る道
    T: { count: 1, features: [city([0, 1, 3], [50, 34]), road([2], [50, 89]), field([4], [0], [81, 89]), field([5], [0], [19, 89])] },
    // 南北にまっすぐな道
    U: { count: 8, features: [road([0, 2], [50, 50]), field([1, 2, 3, 4], [], [80, 50]), field([5, 6, 7, 0], [], [20, 50])] },
    // 南から西へ曲がる道
    V: { count: 9, features: [road([2, 3], [36, 64]), field([0, 1, 2, 3, 4, 7], [], [68, 32]), field([5, 6], [], [13, 87])] },
    // 東・南・西の三叉路
    W: { count: 4, features: [road([1], [83, 50]), road([2], [50, 83]), road([3], [17, 50]), field([7, 0, 1, 2], [], [50, 24]), field([3, 4], [], [83, 83]), field([5, 6], [], [17, 83])] },
    // 十字路
    X: { count: 1, features: [road([0], [50, 17]), road([1], [83, 50]), road([2], [50, 83]), road([3], [17, 50]), field([7, 0], [], [17, 17]), field([1, 2], [], [83, 17]), field([3, 4], [], [83, 83]), field([5, 6], [], [17, 83])] }
};

export const TILE_TYPES = Object.keys(TILE_DEFS);
export const START_TILE = 'D';
export const MEEPLES_PER_PLAYER = 7;

// 辺の向かい側の辺と、半辺の向かい側の半辺（隣のタイルの、接している側）
export const oppositeSide = side => (side + 2) % 4;
export const oppositeHalf = half => ((half ^ 1) + 4) % 8;
// 辺の方向にある隣のマス
export const SIDE_DELTA = [[0, -1], [1, 0], [0, 1], [-1, 0]];

// タイルを rot 回（時計回りに 90° ずつ）回した点の座標
export function rotatePoint([x, y], rot) {
    let p = [x, y];
    for (let i = 0; i < rot; i++) p = [100 - p[1], p[0]];
    return p;
}

// 回したあとのタイルの形：辺の種類・辺ごとの要素・半辺ごとの草原
function buildRotated(type, rot) {
    const features = TILE_DEFS[type].features.map(f => ({
        ...f,
        sides: f.sides?.map(s => (s + rot) % 4),
        halves: f.halves?.map(h => (h + 2 * rot) % 8),
        spot: rotatePoint(f.spot, rot)
    }));
    const sideFeature = [null, null, null, null];
    const halfFeature = new Array(8).fill(null);
    features.forEach((f, i) => {
        f.sides?.forEach(s => { sideFeature[s] = i; });
        f.halves?.forEach(h => { halfFeature[h] = i; });
    });
    const edges = sideFeature.map(i => (i === null ? 'field' : features[i].kind));
    return { type, rot, features, sideFeature, halfFeature, edges };
}

const ROTATED = Object.fromEntries(TILE_TYPES.map(type => [type, [0, 1, 2, 3].map(rot => buildRotated(type, rot))]));

export function rotatedTile(type, rot) {
    return ROTATED[type][rot];
}

// 見た目も中身も同じになる向きを除いた、向きの一覧（C・B・X は 1 通り、U・F・G・H は 2 通り）
function signature(shape) {
    return shape.features.map(f => `${f.kind}:${[...(f.sides ?? [])].sort().join('')}:${[...(f.halves ?? [])].sort().join('')}`).sort().join('|');
}
export const UNIQUE_ROTATIONS = Object.fromEntries(TILE_TYPES.map(type => {
    const seen = new Set();
    const rots = [];
    for (let rot = 0; rot < 4; rot++) {
        const sig = signature(ROTATED[type][rot]);
        if (seen.has(sig)) continue;
        seen.add(sig);
        rots.push(rot);
    }
    return [type, rots];
}));

// 袋に入れるタイル（開始タイルを 1 枚除く 71 枚）
export function bagTiles() {
    const tiles = [];
    TILE_TYPES.forEach(type => {
        const n = TILE_DEFS[type].count - (type === START_TILE ? 1 : 0);
        for (let i = 0; i < n; i++) tiles.push(type);
    });
    return tiles;
}

export const KIND_NAMES = { city: '都市', road: '道', field: '草原', monastery: '修道院' };
