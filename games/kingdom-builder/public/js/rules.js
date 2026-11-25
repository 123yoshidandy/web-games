/**
 * 置けるマスと得点の計算（状態を変えない関数だけ）
 * ゲーム（game.js）とビュー（game-view.js）は同じ形の項目を持つので、CPU はビューを渡して同じ関数で考えられる
 *   terrain：400文字の地形 / owner：マスごとの家の持ち主（いなければ -1）/ locations：[{ cell, type, tiles }]
 *   players：[{ supply, card, tiles: [{ type, loc, fresh, used }] }] / cards：王のカード3枚
 *
 * 建てるときの決まり（家1軒ごとに）：
 * - 建てられるのは、空いている草原・花畑・森・峡谷・砂漠（港で動かすときだけ水）
 * - 自分の家に隣接するマスがあれば、必ずそこから選ぶ。なければ、条件に合うどこでもよい（馬小屋と酒場は除く）
 * - 家を動かすとき（納屋・港）は、動かす家を先に取り除いてから、隣接を判定する（README に書いた決め方）
 */

import { CELLS, NEIGHBORS, NEIGHBORS_BY_DIR, isEdge, rowOf, sectorOf, step } from './hex.js';
import { BUILDABLE, LOCATIONS, CASTLE_POINTS } from './boards.js';

const BUILDABLE_SET = new Set(BUILDABLE);

// 地形から決まる情報は、地形の文字列ごとに一度だけ作る
const staticCache = new Map();
export function staticInfo(terrain) {
    let info = staticCache.get(terrain);
    if (info) return info;
    const cellsOf = {};
    const special = new Uint8Array(CELLS);     // 場所か城
    const adjWater = new Uint8Array(CELLS);
    const adjMountain = new Uint8Array(CELLS);
    const adjSpecial = new Uint8Array(CELLS);
    const castles = [];
    const specials = [];
    for (let cell = 0; cell < CELLS; cell++) {
        const t = terrain[cell];
        (cellsOf[t] ??= []).push(cell);
        if (t === 'K') castles.push(cell);
        if (t === 'K' || t === 'L') { special[cell] = 1; specials.push(cell); }
    }
    for (let cell = 0; cell < CELLS; cell++) {
        for (const n of NEIGHBORS[cell]) {
            if (terrain[n] === 'W') adjWater[cell] = 1;
            if (terrain[n] === 'M') adjMountain[cell] = 1;
            if (special[n]) adjSpecial[cell] = 1;
        }
    }
    const edge = [];
    for (let cell = 0; cell < CELLS; cell++) if (isEdge(cell) && BUILDABLE_SET.has(terrain[cell])) edge.push(cell);
    info = { cellsOf, special, adjWater, adjMountain, adjSpecial, castles, specials, edge };
    if (staticCache.size > 50) staticCache.clear();
    staticCache.set(terrain, info);
    return info;
}

export const isBuildable = (s, cell) => cell >= 0 && s.owner[cell] === -1 && BUILDABLE_SET.has(s.terrain[cell]);

export function housesOf(s, seat) {
    const list = [];
    for (let cell = 0; cell < CELLS; cell++) if (s.owner[cell] === seat) list.push(cell);
    return list;
}

// 自分の家（without を除く）に隣接するものがあれば、それだけに絞る
export function keepAdjacent(s, seat, cells, without = -1) {
    const near = cells.filter(cell => NEIGHBORS[cell].some(n => n !== without && s.owner[n] === seat));
    return near.length ? near : cells;
}

// 地形 terrain の空いたマスのうち、建ててよいマス（W なら水）
export function terrainTargets(s, seat, terrain, without = -1) {
    const cells = (staticInfo(s.terrain).cellsOf[terrain] ?? []).filter(cell => s.owner[cell] === -1);
    return keepAdjacent(s, seat, cells, without);
}

// 必須の行動（手札の地形に1軒）で建てられるマス
export function buildTargets(s, seat) {
    const card = s.players[seat].card;
    if (!card || s.players[seat].supply <= 0) return [];
    return terrainTargets(s, seat, card);
}

// 酒場：自分の家が3軒以上まっすぐ並んだ列の、どちらかの端の隣
function tavernTargets(s, seat) {
    const out = new Set();
    for (let cell = 0; cell < CELLS; cell++) {
        if (s.owner[cell] !== seat) continue;
        for (let dir = 0; dir < 6; dir++) {
            const b = NEIGHBORS_BY_DIR[cell][dir];
            if (b < 0 || s.owner[b] !== seat) continue;
            const c = NEIGHBORS_BY_DIR[b][dir];
            if (c < 0 || s.owner[c] !== seat) continue;
            const end = NEIGHBORS_BY_DIR[c][dir];
            if (isBuildable(s, end)) out.add(end);
        }
    }
    return [...out].sort((a, b) => a - b);
}

// 馬小屋：まっすぐ2マス先（間は何でもよい。隣接の決まりはない）
function paddockTargets(s, from) {
    const out = [];
    for (let dir = 0; dir < 6; dir++) {
        const to = step(step(from, dir), dir);
        if (isBuildable(s, to)) out.push(to);
    }
    return out.sort((a, b) => a - b);
}

/**
 * 場所タイルを使ったときに、家を置けるマス
 * 建てるタイルは from を使わない。動かすタイルは from（動かす自分の家）が要る
 */
export function tileTargets(s, seat, type, from = -1) {
    const player = s.players[seat];
    switch (type) {
        case 'oracle': return player.supply > 0 && player.card ? terrainTargets(s, seat, player.card) : [];
        case 'farm': return player.supply > 0 ? terrainTargets(s, seat, 'G') : [];
        case 'oasis': return player.supply > 0 ? terrainTargets(s, seat, 'D') : [];
        case 'tower': return player.supply > 0 ? keepAdjacent(s, seat, staticInfo(s.terrain).edge.filter(cell => s.owner[cell] === -1)) : [];
        case 'tavern': return player.supply > 0 ? tavernTargets(s, seat) : [];
        case 'barn': return s.owner[from] === seat && player.card ? terrainTargets(s, seat, player.card, from) : [];
        case 'harbor': return s.owner[from] === seat ? terrainTargets(s, seat, 'W', from) : [];
        case 'paddock': return s.owner[from] === seat ? paddockTargets(s, from) : [];
        default: return [];
    }
}

// 動かすタイルで、動かせる自分の家（行き先が1つ以上あるもの）
export function moveSources(s, seat, type) {
    return housesOf(s, seat).filter(from => tileTargets(s, seat, type, from).length > 0);
}

// 必須の行動の途中（1軒目を建てて、まだ3軒目を建てていない）か
export const inMandatory = (s) => s.built > 0 && !s.mandatoryDone;

// 今使える場所タイルの種類（同じ種類を2枚持っていれば、2回使える）
export function usableTiles(s, seat) {
    if (s.phase !== 'play' || s.active !== seat || inMandatory(s)) return [];
    const types = [...new Set(s.players[seat].tiles.filter(t => !t.fresh && !t.used).map(t => t.type))];
    return types.filter(type => (LOCATIONS[type].kind === 'move'
        ? moveSources(s, seat, type).length > 0
        : tileTargets(s, seat, type).length > 0));
}

// ---- 得点 ----

// 自分の家の集落（隣り合う家のかたまり）。cells の各マスに集落の番号を付ける
function settlements(s, seat, houses) {
    const id = new Map();
    const sizes = [];
    for (const start of houses) {
        if (id.has(start)) continue;
        const k = sizes.length;
        let size = 0;
        const stack = [start];
        id.set(start, k);
        while (stack.length) {
            const cell = stack.pop();
            size++;
            for (const n of NEIGHBORS[cell]) {
                if (s.owner[n] === seat && !id.has(n)) { id.set(n, k); stack.push(n); }
            }
        }
        sizes.push(size);
    }
    return { id, sizes };
}

// 商人：場所・城のマスを、自分の家でつないだかたまりで数える（場所どうしが直接隣り合っていても、家がなければつながらない）
function merchantsPoints(s, seat, info, houses, groups) {
    const linked = new Set();
    const bySettlement = groups.sizes.map(() => new Set());
    for (const cell of houses) {
        for (const n of NEIGHBORS[cell]) if (info.special[n]) bySettlement[groups.id.get(cell)].add(n);
    }
    // 1つの場所を通して2つの集落がつながる。場所と集落の間で、つながりをまとめる
    const parent = new Map();
    const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
    const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent.set(ra, rb); };
    bySettlement.forEach((set, k) => {
        const key = `s${k}`;
        parent.set(key, key);
        set.forEach(cell => { if (!parent.has(cell)) parent.set(cell, cell); union(key, cell); });
    });
    const count = new Map();
    for (const cell of parent.keys()) if (typeof cell === 'number') count.set(find(cell), (count.get(find(cell)) ?? 0) + 1);
    for (const cell of parent.keys()) if (typeof cell === 'number' && count.get(find(cell)) >= 2) linked.add(cell);
    return linked.size * 4;
}

// 盤面ごとの家の数 [席][区画]
export function sectorCounts(s) {
    const counts = s.players.map(() => [0, 0, 0, 0]);
    for (let cell = 0; cell < CELLS; cell++) if (s.owner[cell] >= 0) counts[s.owner[cell]][sectorOf(cell)]++;
    return counts;
}

function lordsPoints(seat, counts) {
    let points = 0;
    for (let k = 0; k < 4; k++) {
        const mine = counts[seat][k];
        if (mine === 0) continue;
        const values = [...new Set(counts.map(c => c[k]).filter(v => v > 0))].sort((a, b) => b - a);
        if (mine === values[0]) points += 12;
        else if (mine === values[1]) points += 6;
    }
    return points;
}

// 1人分の得点の内訳。counts（sectorCounts）を渡すと、作り直さずに使う
export function scorePlayer(s, seat, counts = sectorCounts(s)) {
    const info = staticInfo(s.terrain);
    const houses = housesOf(s, seat);
    const groups = settlements(s, seat, houses);
    const rows = new Map();
    houses.forEach(cell => rows.set(rowOf(cell), (rows.get(rowOf(cell)) ?? 0) + 1));
    const castles = info.castles.filter(c => NEIGHBORS[c].some(n => s.owner[n] === seat)).length * CASTLE_POINTS;
    const card = (id) => {
        switch (id) {
            case 'fishermen': return houses.filter(c => s.terrain[c] !== 'W' && info.adjWater[c]).length;
            case 'merchants': return merchantsPoints(s, seat, info, houses, groups);
            case 'discoverers': return rows.size;
            case 'hermits': return groups.sizes.length;
            case 'citizens': return Math.floor(Math.max(0, ...groups.sizes) / 2);
            case 'knights': return 2 * Math.max(0, ...rows.values());
            case 'lords': return lordsPoints(seat, counts);
            case 'farmers': return 3 * Math.min(...counts[seat]);
            case 'workers': return houses.filter(c => info.adjSpecial[c]).length;
            case 'miners': return houses.filter(c => info.adjMountain[c]).length;
            default: return 0;
        }
    };
    const cards = s.cards.map(id => card(id));
    return { castles, cards, total: castles + cards.reduce((a, b) => a + b, 0) };
}

export function scoreAll(s) {
    const counts = sectorCounts(s);
    return s.players.map((_, seat) => scorePlayer(s, seat, counts));
}
