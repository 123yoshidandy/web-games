/**
 * 盤面のデータ（このゲームのために描いた間取り。原作の盤面は写さない）
 * 盤面は 8行×10列。いちばん外の1周は建物の外（行 0・7、列 0・9）で、中の 6行×8列 が建物
 * マスの番号は 行×10＋列。赤のダイス（1〜6）が行、黒のダイス（1〜8）が列を決める
 * 辺（となりのマスとの境目）は「小さい番号-大きい番号」の名前で持つ。壁・扉のない辺は通れる
 */

export const ROWS = 8;
export const COLS = 10;
export const CELL_COUNT = ROWS * COLS;

export const cellOf = (r, c) => r * COLS + c;
export const rowOf = (cell) => Math.floor(cell / COLS);
export const colOf = (cell) => cell % COLS;
export const isInside = (cell) => {
    const r = rowOf(cell);
    const c = colOf(cell);
    return r >= 1 && r <= 6 && c >= 1 && c <= 8;
};
export const isCell = (v) => Number.isInteger(v) && v >= 0 && v < CELL_COUNT;
export const isOutside = (cell) => isCell(cell) && !isInside(cell);
export const edgeKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);

// 上下左右のとなり（盤面の中だけ）
export const NEIGHBORS = Array.from({ length: CELL_COUNT }, (_, cell) => {
    const r = rowOf(cell);
    const c = colOf(cell);
    const list = [];
    if (r > 0) list.push(cell - COLS);
    if (c < COLS - 1) list.push(cell + 1);
    if (r < ROWS - 1) list.push(cell + COLS);
    if (c > 0) list.push(cell - 1);
    return list;
});
// 向き（0：上・1：右・2：下・3：左）に1つ進んだマス。盤面の外なら -1
export const STEP = [[-1, 0], [0, 1], [1, 0], [0, -1]];
export function stepFrom(cell, dir) {
    const r = rowOf(cell) + STEP[dir][0];
    const c = colOf(cell) + STEP[dir][1];
    return r < 0 || r >= ROWS || c < 0 || c >= COLS ? -1 : cellOf(r, c);
}

export const INSIDE_CELLS = Array.from({ length: CELL_COUNT }, (_, i) => i).filter(isInside);
export const OUTSIDE_CELLS = Array.from({ length: CELL_COUNT }, (_, i) => i).filter(i => !isInside(i));

// 部屋の割り当て（建物の中の 6行×8列）。同じ文字のマスは同じ部屋で、部屋どうしの境目は壁
// A 書斎・B 寝室・C 子ども部屋・H 廊下・D 浴室・E 台所・G 物置・F 居間
const ROOM_MAP = [
    'AAABBBCC',
    'AAABBBCC',
    'HHHHHHCC',
    'HHHHHHFF',
    'DDEEEGFF',
    'DDEEEGFF'
];
export const ROOM_NAMES = { A: '書斎', B: '寝室', C: '子ども部屋', H: '廊下', D: '浴室', E: '台所', G: '物置', F: '居間' };
export const roomOf = (cell) => (isInside(cell) ? ROOM_MAP[rowOf(cell) - 1][colOf(cell) - 1] : null);

// 壁のない出入り口（部屋どうし・外との境目）
const OPENINGS = [
    [cellOf(2, 5), cellOf(3, 5)],   // 寝室〜廊下
    [cellOf(4, 6), cellOf(4, 7)],   // 廊下〜居間
    [cellOf(4, 1), cellOf(5, 1)],   // 廊下〜浴室
    [cellOf(4, 6), cellOf(5, 6)],   // 廊下〜物置
    [cellOf(4, 8), cellOf(4, 9)],   // 居間〜外（右）
    [cellOf(3, 0), cellOf(3, 1)]    // 外〜廊下（左）
];
// 扉（はじめは閉じている）
const DOORS = [
    [cellOf(2, 2), cellOf(3, 2)],   // 書斎〜廊下
    [cellOf(1, 3), cellOf(1, 4)],   // 書斎〜寝室
    [cellOf(3, 6), cellOf(3, 7)],   // 廊下〜子ども部屋
    [cellOf(3, 8), cellOf(4, 8)],   // 子ども部屋〜居間
    [cellOf(4, 4), cellOf(5, 4)],   // 廊下〜台所
    [cellOf(6, 5), cellOf(6, 6)],   // 台所〜物置
    [cellOf(5, 2), cellOf(5, 3)],   // 浴室〜台所
    [cellOf(0, 5), cellOf(1, 5)],   // 外（上）〜寝室
    [cellOf(6, 3), cellOf(7, 3)]    // 台所〜外（下）
];

// はじめの辺：{ 'a-b': { t: 'wall', d: 0 } | { t: 'door', s: 'closed' } }。書いていない辺は通れる
export function initialEdges() {
    const open = new Set(OPENINGS.map(([a, b]) => edgeKey(a, b)));
    const doors = new Set(DOORS.map(([a, b]) => edgeKey(a, b)));
    const edges = {};
    for (let cell = 0; cell < CELL_COUNT; cell++) {
        NEIGHBORS[cell].forEach(n => {
            if (n < cell) return;
            const key = edgeKey(cell, n);
            if (doors.has(key)) {
                edges[key] = { t: 'door', s: 'closed' };
                return;
            }
            if (open.has(key)) return;
            const a = roomOf(cell);
            const b = roomOf(n);
            if (a === b) return;          // 同じ部屋の中・外どうし
            edges[key] = { t: 'wall', d: 0 };
        });
    }
    return edges;
}

// 建物が崩れるダメージの数（ダメージの印がなくなったら崩れる）
export const DAMAGE_LIMIT = 24;
export const WIN_RESCUED = 7;
export const LOSE_LOST = 4;
export const POI_ON_BOARD = 3;
export const POI_VICTIMS = 12;
export const POI_FALSE = 6;
export const HOTSPOT_SUPPLY = 12;
export const SAVE_LIMIT = 4;          // 次の手番へ持ち越せる AP

// 駐車場（建物の外の2マス）。向き 0：上・1：右・2：下・3：左
// 消防車は、それぞれの向きで決まった区画（建物の4分の1）に放水できる
export const ENGINE_SPOTS = [
    [cellOf(0, 2), cellOf(0, 3)],
    [cellOf(2, 9), cellOf(3, 9)],
    [cellOf(7, 6), cellOf(7, 7)],
    [cellOf(4, 0), cellOf(5, 0)]
];
export const AMBULANCE_SPOTS = [
    [cellOf(0, 6), cellOf(0, 7)],
    [cellOf(5, 9), cellOf(6, 9)],
    [cellOf(7, 2), cellOf(7, 3)],
    [cellOf(1, 0), cellOf(2, 0)]
];
export const SIDE_NAMES = ['上', '右', '下', '左'];
// 区画：0 左上・1 右上・2 右下・3 左下（行・列の範囲）
export const QUADRANTS = [
    { rows: [1, 3], cols: [1, 4], name: '左上' },
    { rows: [1, 3], cols: [5, 8], name: '右上' },
    { rows: [4, 6], cols: [5, 8], name: '右下' },
    { rows: [4, 6], cols: [1, 4], name: '左下' }
];
// 消防車の向きごとの区画（上は左上、右は右上、下は右下、左は左下）
export const ENGINE_QUADRANT = [0, 1, 2, 3];
export const inQuadrant = (cell, q) => {
    const { rows, cols } = QUADRANTS[q];
    const r = rowOf(cell);
    const c = colOf(cell);
    return r >= rows[0] && r <= rows[1] && c >= cols[0] && c <= cols[1];
};
// 向きどうしの距離（となりは1、向かいは2）
export const sideDistance = (a, b) => Math.min((a - b + 4) % 4, (b - a + 4) % 4);

// 家族向けの始まり：火の出ているマスと、要救助者の印
export const FAMILY_FIRES = [
    cellOf(2, 2), cellOf(2, 3), cellOf(3, 4), cellOf(3, 5), cellOf(4, 4),
    cellOf(4, 5), cellOf(5, 7), cellOf(6, 7), cellOf(6, 8), cellOf(1, 6)
];
export const FAMILY_POI = [cellOf(1, 1), cellOf(4, 8), cellOf(6, 1)];

// 上級の難しさ：はじめの爆発の数・危険物の数・足すホットスポットの数
export const LEVELS = {
    recruit: { name: '新人', explosions: 3, hazmat: 3, hotspots: 0 },
    veteran: { name: 'ベテラン', explosions: 3, hazmat: 4, hotspots: 3 },
    heroic: { name: 'ヒーロー', explosions: 4, hazmat: 5, hotspots: 3 }
};
export const MODES = { family: '家族向け', experienced: '上級' };

// 上級の専門職。ap：毎手番の AP、ext：消火だけに使える AP、mv：移動だけに使える AP、cp：指揮の点
export const ROLES = [
    { key: 'paramedic', name: '救急隊員', ap: 4, text: '要救助者を手当てできる（1AP）。手当てした人は1APで連れて歩ける。消火は2倍のAP' },
    { key: 'captain', name: '隊長', ap: 4, cp: 2, text: '毎手番2点の指揮で、ほかの隊員を動かせる' },
    { key: 'imaging', name: '探査隊員', ap: 4, text: 'どこにある要救助者の印でも、1APで正体を調べられる' },
    { key: 'cafs', name: '泡消火隊員', ap: 3, ext: 3, text: 'AP は3。ほかに毎手番、消火だけに使える3AP' },
    { key: 'hazmat', name: '危険物処理員', ap: 4, text: '自分のマスの危険物を2APで処理できる' },
    { key: 'generalist', name: '万能隊員', ap: 5, text: '毎手番5AP' },
    { key: 'rescue', name: '救助専門員', ap: 4, mv: 3, text: '毎手番、移動だけに使える3AP。壁の破壊は1AP。消火は2倍のAP' },
    { key: 'driver', name: '機関員', ap: 4, text: '放水は2AP。外れた目は1回振り直す' }
];
export const ROLE = Object.fromEntries(ROLES.map(r => [r.key, r]));
export const FAMILY_ROLE = { key: null, name: '消防士', ap: 4, text: '' };
export const roleOf = (key) => (key ? ROLE[key] : FAMILY_ROLE);
