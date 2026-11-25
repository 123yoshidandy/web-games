/**
 * 地図：小さな六角マスを集めて領域を作る（尖った頭の六角形、奇数行を半マス右にずらす）
 * 人数ごとに決まった地図を1つずつ使う。地図は決まったシードから作るので、毎回同じ形になる
 * - 領域の数：2人 23、3人 30、4人 39、5人 48（原作の地図と同じ数）
 * - 地図の縁に海、内側に湖を1つ。山・農地・森・丘・沼を散らし、魔法の源・鉱山・洞窟と、失われた部族を置く
 */

import { createRandom, shuffle } from './random.js';
import { isWater } from './data.js';

export const MAP_SPECS = {
    2: { regions: 23, cols: 11, rows: 14, seas: 2, mountains: 4, specials: 3, lost: 6 },
    3: { regions: 30, cols: 13, rows: 15, seas: 2, mountains: 5, specials: 4, lost: 8 },
    4: { regions: 39, cols: 15, rows: 17, seas: 3, mountains: 6, specials: 5, lost: 11 },
    5: { regions: 48, cols: 16, rows: 19, seas: 3, mountains: 8, specials: 6, lost: 13 }
};

// 隣のマス（方向は 0 右上・1 右・2 右下・3 左下・4 左・5 左上。六角形の頂点 k と k+1 の間の辺に対応する）
export function cellNeighbor(cols, rows, cell, dir) {
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    const odd = r % 2 === 1;
    const [dr, dc] = [
        [-1, odd ? 1 : 0], [0, 1], [1, odd ? 1 : 0], [1, odd ? 0 : -1], [0, -1], [-1, odd ? 0 : -1]
    ][dir];
    const nr = r + dr;
    const nc = c + dc;
    if (nr < 0 || nr >= rows || nc < 0 || nc >= cols) return -1;
    return nr * cols + nc;
}

function cube(cols, cell) {
    const r = Math.floor(cell / cols);
    const c = cell % cols;
    const x = c - (r - (r & 1)) / 2;
    return [x, r, -x - r];
}

const hexDistance = (cols, a, b) => {
    const [ax, ay, az] = cube(cols, a);
    const [bx, by, bz] = cube(cols, b);
    return Math.max(Math.abs(ax - bx), Math.abs(ay - by), Math.abs(az - bz));
};

// マスを領域に分ける。種を散らしてから、小さい領域から順に1マスずつ育てる
function growRegions(spec, random) {
    const { cols, rows, regions: count } = spec;
    const total = cols * rows;
    const neighbors = Array.from({ length: total }, (_, cell) => [0, 1, 2, 3, 4, 5].map(d => cellNeighbor(cols, rows, cell, d)).filter(n => n >= 0));
    const owner = Array(total).fill(-1);
    const seeds = [Math.floor(random() * total)];
    while (seeds.length < count) {
        const dist = Array.from({ length: total }, (_, cell) => Math.min(...seeds.map(s => hexDistance(cols, s, cell))));
        const best = Math.max(...dist);
        const pool = dist.map((d, cell) => (d >= best - 1 && d > 0 ? cell : -1)).filter(cell => cell >= 0);
        seeds.push(pool[Math.floor(random() * pool.length)]);
    }
    seeds.forEach((cell, id) => { owner[cell] = id; });
    const cells = seeds.map(cell => [cell]);
    let left = total - count;
    while (left > 0) {
        const growable = cells.map((list, id) => ({ id, size: list.length, frontier: [...new Set(list.flatMap(c => neighbors[c]).filter(n => owner[n] < 0))] }))
            .filter(g => g.frontier.length > 0);
        const smallest = Math.min(...growable.map(g => g.size));
        const pick = growable.filter(g => g.size === smallest);
        const g = pick[Math.floor(random() * pick.length)];
        const touch = (cell) => neighbors[cell].filter(n => owner[n] === g.id).length;
        const most = Math.max(...g.frontier.map(touch));
        const options = g.frontier.filter(cell => touch(cell) === most);
        const cell = options[Math.floor(random() * options.length)];
        owner[cell] = g.id;
        cells[g.id].push(cell);
        left--;
    }
    return { owner, cells, neighbors };
}

function generate(n, seed) {
    const spec = MAP_SPECS[n];
    const { cols, rows } = spec;
    const random = createRandom(seed);
    const { owner, cells, neighbors } = growRegions(spec, random);
    const count = spec.regions;
    const adj = cells.map((list, id) => [...new Set(list.flatMap(c => neighbors[c]).map(m => owner[m]).filter(o => o !== id))].sort((a, b) => a - b));
    const edge = cells.map(list => list.some(cell => neighbors[cell].length < 6));
    const center = cells.map(list => {
        const pts = list.map(cell => cube(cols, cell));
        return [0, 1].map(k => pts.reduce((s, p) => s + p[k], 0) / pts.length);
    });
    const far = (a, b) => Math.hypot(center[a][0] - center[b][0] + (center[a][1] - center[b][1]) / 2, (center[a][1] - center[b][1]) * 0.87);
    const terrain = Array(count).fill(null);

    // 海：縁の領域から、互いに離れたものを選ぶ
    const edgeIds = shuffle(cells.map((_, id) => id).filter(id => edge[id]), random);
    const seas = [edgeIds[0]];
    while (seas.length < spec.seas) {
        const next = edgeIds.filter(id => !seas.includes(id)).map(id => ({ id, d: Math.min(...seas.map(s => far(s, id))) }))
            .sort((a, b) => b.d - a.d)[0];
        seas.push(next.id);
    }
    seas.forEach(id => { terrain[id] = 'sea'; });
    // 湖：内側の領域のうち、真ん中に近いもの
    const mid = [(cols - 1) / 2 - (rows - 1) / 4, (rows - 1) / 2];
    const inner = cells.map((_, id) => id).filter(id => !edge[id] && adj[id].every(a => !terrain[a]));
    inner.sort((a, b) => Math.hypot(center[a][0] - mid[0], center[a][1] - mid[1]) - Math.hypot(center[b][0] - mid[0], center[b][1] - mid[1]));
    terrain[inner[Math.floor(random() * Math.min(3, inner.length))]] = 'lake';

    // 山：互いと水に隣り合わないように散らす
    const land = () => shuffle(cells.map((_, id) => id).filter(id => !terrain[id]), random);
    let mountains = 0;
    for (const id of land()) {
        if (mountains >= spec.mountains) break;
        if (adj[id].some(a => terrain[a] === 'mountain')) continue;
        terrain[id] = 'mountain';
        mountains++;
    }
    // 残りは4つの地形を同じくらいずつ。隣と同じ地形をなるべく避ける
    const kinds = ['farm', 'forest', 'hill', 'swamp'];
    const used = { farm: 0, forest: 0, hill: 0, swamp: 0 };
    for (const id of land()) {
        const options = kinds.map(k => ({ k, n: used[k], same: adj[id].filter(a => terrain[a] === k).length, r: random() }))
            .sort((a, b) => a.same - b.same || a.n - b.n || a.r - b.r);
        terrain[id] = options[0].k;
        used[options[0].k]++;
    }

    // 魔法の源・鉱山・洞窟（1つの領域に1つまで）
    const special = Array(count).fill(null);
    const place = (kind, prefer) => {
        const pool = shuffle(cells.map((_, id) => id).filter(id => !isWater(terrain[id]) && !special[id]), random)
            .sort((a, b) => (prefer.includes(terrain[b]) ? 1 : 0) - (prefer.includes(terrain[a]) ? 1 : 0));
        pool.slice(0, spec.specials).forEach(id => { special[id] = kind; });
    };
    place('mine', ['mountain', 'hill']);
    place('cavern', ['mountain', 'hill', 'forest']);
    place('magic', ['swamp', 'forest', 'farm']);

    // 失われた部族（山と水にはいない）
    const lost = Array(count).fill(false);
    shuffle(cells.map((_, id) => id).filter(id => !isWater(terrain[id]) && terrain[id] !== 'mountain'), random)
        .slice(0, spec.lost).forEach(id => { lost[id] = true; });

    // 地図に入れる領域：縁に触れるか、縁の海に隣り合う
    const border = cells.map((_, id) => edge[id] || adj[id].some(a => terrain[a] === 'sea' && edge[a]));
    const coastal = adj.map(list => list.some(a => isWater(terrain[a])));

    // 印を置くマス：縁から一番遠いマス（同じなら真ん中に近いもの）と、そこから離れた2つめのマス
    const depth = Array(cols * rows).fill(0);
    {
        let frontier = [];
        for (let cell = 0; cell < cols * rows; cell++) {
            if (neighbors[cell].length < 6 || neighbors[cell].some(m => owner[m] !== owner[cell])) {
                depth[cell] = 1;
                frontier.push(cell);
            }
        }
        let d = 1;
        while (frontier.length) {
            const next = [];
            for (const cell of frontier) {
                for (const m of neighbors[cell]) {
                    if (depth[m] === 0) {
                        depth[m] = d + 1;
                        next.push(m);
                    }
                }
            }
            frontier = next;
            d++;
        }
    }
    const anchors = cells.map((list, id) => {
        const near = (cell) => {
            const [x, y] = cube(cols, cell);
            return Math.hypot(x - center[id][0], y - center[id][1]);
        };
        const sorted = [...list].sort((a, b) => depth[b] - depth[a] || near(a) - near(b) || a - b);
        const a1 = sorted[0];
        const rest = list.filter(cell => cell !== a1).sort((a, b) => hexDistance(cols, b, a1) - hexDistance(cols, a, a1) || depth[b] - depth[a] || a - b);
        const a2 = rest[0] ?? a1;
        const a3 = list.filter(cell => cell !== a1 && cell !== a2).sort((a, b) =>
            Math.min(hexDistance(cols, b, a1), hexDistance(cols, b, a2)) - Math.min(hexDistance(cols, a, a1), hexDistance(cols, a, a2)) || a - b)[0] ?? a2;
        return [a1, a2, a3];
    });

    return {
        players: n, cols, rows, seed, owner,
        regions: cells.map((list, id) => ({
            id, cells: [...list].sort((a, b) => a - b), adj: adj[id], terrain: terrain[id], special: special[id],
            lost: lost[id], edge: edge[id], border: border[id], coastal: coastal[id], anchors: anchors[id]
        }))
    };
}

// 地図として使えるか：大きさがそろい、陸がひとつながりで、どの陸からも海の外へ出られる
export function validateMap(map) {
    const { regions } = map;
    if (regions.some(r => r.cells.length < 4 || r.cells.length > 10)) return false;
    const landIds = regions.filter(r => !isWater(r.terrain)).map(r => r.id);
    const seen = new Set([landIds[0]]);
    const queue = [landIds[0]];
    while (queue.length) {
        const id = queue.shift();
        for (const a of regions[id].adj) {
            if (!seen.has(a) && !isWater(regions[a].terrain)) {
                seen.add(a);
                queue.push(a);
            }
        }
    }
    if (seen.size !== landIds.length) return false;
    // 縁の陸地が少なすぎない（どこからでも入れるほど広くはなく、入る場所に困らない）
    const borderLand = regions.filter(r => r.border && !isWater(r.terrain)).length;
    return borderLand >= Math.ceil(regions.length * 0.4);
}

const cache = new Map();

// 人数ごとの地図。決まったシードから順に試し、最初に使える地図にする
export function getMap(n) {
    if (!MAP_SPECS[n]) throw new Error('人数は2〜5人です');
    if (!cache.has(n)) {
        let map = null;
        for (let k = 0; k < 200 && !map; k++) {
            const candidate = generate(n, n * 7919 + k * 104729);
            if (validateMap(candidate)) map = candidate;
        }
        if (!map) throw new Error('地図を作れませんでした');
        cache.set(n, map);
    }
    return cache.get(n);
}
