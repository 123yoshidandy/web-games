/**
 * 地図の形（DOM に依存しない）
 * - マスの番号は、上の行から左から順に振る（川のマスも含む）
 * - 偶数の行は13マス、奇数の行は12マスで半マス右にずれる（terra.snellman.net と同じ並び）
 * - 隣接・川を渡る距離（航海）・まっすぐの距離（トンネル・じゅうたん）・橋を架けられる組を最初に計算する
 */

import { MAP_ROWS } from './data.js';

const ROW_LABELS = 'ABCDEFGHI';

export const HEXES = [];
const grid = MAP_ROWS.map(() => []);
{
    MAP_ROWS.forEach((row, r) => {
        let landCol = 1;
        row.forEach((terrain, c) => {
            const id = HEXES.length;
            const land = terrain !== 'river';
            HEXES.push({ id, r, c, terrain, land, label: land ? `${ROW_LABELS[r]}${landCol++}` : '' });
            grid[r][c] = id;
        });
    });
}
const at = (r, c) => (grid[r] && grid[r][c] !== undefined ? grid[r][c] : undefined);

// 隣のマス
export const ADJ = HEXES.map(h => {
    const list = [];
    const add = (id) => { if (id !== undefined) list.push(id); };
    add(at(h.r, h.c - 1));
    add(at(h.r, h.c + 1));
    const base = h.r % 2 === 0 ? h.c - 1 : h.c;
    [h.r - 1, h.r + 1].forEach(r => { add(at(r, base)); add(at(r, base + 1)); });
    return list;
});

export const LAND = HEXES.filter(h => h.land).map(h => h.id);

// 地図の端（最後の得点の変種では使わないが、表示の参考に持つ）
export const isEdge = (id) => {
    const h = HEXES[id];
    return h.r === 0 || h.r === MAP_ROWS.length - 1 || h.c === 0 || h.c === MAP_ROWS[h.r].length - 1;
};

// 川を渡る距離：途中が川のマスだけの道で、渡る川のマスの数（隣どうしは 0、届かなければ入れない）
export const RIVER_DIST = HEXES.map(h => {
    const dist = new Map();
    if (!h.land) return dist;
    let frontier = ADJ[h.id].filter(id => !HEXES[id].land);
    const seen = new Set([h.id, ...frontier]);
    let step = 1;
    while (frontier.length > 0 && step <= 6) {
        const next = [];
        frontier.forEach(river => {
            ADJ[river].forEach(id => {
                if (HEXES[id].land) {
                    if (id !== h.id && !dist.has(id)) dist.set(id, step);
                } else if (!seen.has(id)) {
                    seen.add(id);
                    next.push(id);
                }
            });
        });
        frontier = next;
        step++;
    }
    return dist;
});

// 六角の距離（川も土地も数える）
function cube(id) {
    const h = HEXES[id];
    // 偶数の行が左に半マス出ている形を、斜めの座標に直す
    const x = 2 * h.c + (h.r % 2);
    const q = (x - h.r) / 2;
    return { q, r: h.r, s: -q - h.r };
}
export function hexDistance(a, b) {
    const p = cube(a);
    const o = cube(b);
    return Math.max(Math.abs(p.q - o.q), Math.abs(p.r - o.r), Math.abs(p.s - o.s));
}

// 橋を架けられる土地の組（川1つをはさむ組。terra.snellman.net の決め方と同じ）
export const BRIDGE_PAIRS = (() => {
    const pairs = new Map();
    const isRiver = (id) => id !== undefined && !HEXES[id].land;
    const record = (a, b) => {
        if (b === undefined || !HEXES[b].land) return;
        if (RIVER_DIST[a].get(b) !== 1) return;
        const key = a < b ? `${a}-${b}` : `${b}-${a}`;
        if (!pairs.has(key)) pairs.set(key, [Math.min(a, b), Math.max(a, b)]);
    };
    HEXES.filter(h => h.land).forEach(h => {
        const { r, c } = h;
        const off = c - (r % 2 === 0 ? 1 : 0);
        const sw = at(r + 1, off);
        const se = at(r + 1, off + 1);
        if ((isRiver(sw) && isRiver(se)) || (isRiver(sw) && se === undefined) || (isRiver(se) && sw === undefined)) {
            record(h.id, at(r + 2, c));
        }
        if (isRiver(at(r, c - 1)) && isRiver(at(r + 1, off))) record(h.id, at(r + 1, off - 1));
        if (isRiver(at(r, c + 1)) && isRiver(at(r + 1, off + 1))) record(h.id, at(r + 1, off + 2));
    });
    return [...pairs.values()];
})();

export const bridgeKey = (a, b) => (a < b ? `${a}-${b}` : `${b}-${a}`);
export const BRIDGE_KEYS = new Set(BRIDGE_PAIRS.map(([a, b]) => bridgeKey(a, b)));

// 変換の輪での距離（0〜3）
export function wheelDistance(from, to, terrains) {
    const d = Math.abs(terrains.indexOf(from) - terrains.indexOf(to));
    return Math.min(d, 7 - d);
}

// from から home へ、輪を近い向きに n 歩進めた地形
export function stepToward(from, home, n, terrains) {
    const i = terrains.indexOf(from);
    const j = terrains.indexOf(home);
    let d = (j - i + 7) % 7;
    const dir = d <= 3 ? 1 : -1;
    d = Math.min(d, 7 - d);
    const steps = Math.min(n, d);
    return terrains[((i + dir * steps) % 7 + 7) % 7];
}
