/**
 * ナンバーリンクのロジック。DOM に触れない（サーバーとテストでもそのまま動く）
 *
 * ルール：同じ数字どうしを、たて・よこの線でつなぐ。線は交わらず、枝分かれせず、すべてのマスを通る
 * 問題：{ width, height, ends: [[マス, マス]…] }（ends[p] が数字 p+1 の2つのマス。マスは左上から行ごとの番号）
 * 状態：{ paths: [[マス…]…] }（paths[p] は数字 p+1 の線。片方の数字のマスから始まる。引いていなければ []）
 * 入力：{ type: 'path', pair, cells }（数字 pair+1 の線を cells に引き直す。重なったほかの線は、そこで切れる）
 *       { type: 'clear', pair }（数字 pair+1 の線を消す）
 */

import { createRandom, randomInt, shuffle } from '../../random.js';

export const SIZES = { easy: 5, normal: 7, hard: 9 };
// 数字の組の数の目安（多いほど線が短く、解が1つに決まりやすい）
const PAIR_RANGE = { easy: [4, 5], normal: [6, 8], hard: [8, 11] };

// ---------- 盤面の道具 ----------

const neighborCache = new Map();
export function neighborsOf(width, height) {
    const key = `${width}x${height}`;
    if (!neighborCache.has(key)) {
        const list = [];
        for (let i = 0; i < width * height; i++) {
            const r = Math.floor(i / width);
            const c = i % width;
            const n = [];
            if (r > 0) n.push(i - width);
            if (c < width - 1) n.push(i + 1);
            if (r < height - 1) n.push(i + width);
            if (c > 0) n.push(i - 1);
            list.push(n);
        }
        neighborCache.set(key, list);
    }
    return neighborCache.get(key);
}

export const isAdjacent = (width, a, b) => (Math.abs(a - b) === width) || (Math.abs(a - b) === 1 && Math.floor(a / width) === Math.floor(b / width));

// マスごとの数字（-1 なし、それ以外は組の番号）
export function endGrid(puzzle) {
    const grid = new Int8Array(puzzle.width * puzzle.height).fill(-1);
    puzzle.ends.forEach(([a, b], p) => { grid[a] = p; grid[b] = p; });
    return grid;
}

// ---------- 解く（解の数を limit まで数える） ----------

export function countSolutions(puzzle, limit = 2, { maxNodes = 2_000_000, keep = false } = {}) {
    const { width, height, ends } = puzzle;
    const size = width * height;
    const nbrs = neighborsOf(width, height);
    const color = new Int8Array(size).fill(-1);
    const head = ends.map(([a]) => a);
    const target = ends.map(([, b]) => b);
    const done = ends.map(() => false);
    const trail = ends.map(([a]) => [a]);
    ends.forEach(([a, b], p) => { color[a] = p; color[b] = p; });
    let count = 0;
    let first = null;
    const solutions = [];
    let nodes = 0;

    // 開いた口（伸ばしている先・まだつながっていない相手の数字）か
    const isOpenEnd = (cell) => {
        const p = color[cell];
        return p >= 0 && !done[p] && (head[p] === cell || target[p] === cell);
    };

    // 空いたマスが、2本の線を受けられるか（空いたマスか開いた口が2つ以上となりにある）
    const cellAlive = (cell) => {
        let free = 0;
        for (const n of nbrs[cell]) if (color[n] < 0 || isOpenEnd(n)) free++;
        return free >= 2;
    };

    // 空いたマスの島ごとに、つなげる組があるか・組の両端が同じ島に面しているか
    const region = new Int16Array(size);
    const regionsOk = () => {
        region.fill(-1);
        let regions = 0;
        const stack = [];
        for (let s = 0; s < size; s++) {
            if (color[s] >= 0 || region[s] >= 0) continue;
            region[s] = regions;
            stack.push(s);
            while (stack.length) {
                const cell = stack.pop();
                for (const n of nbrs[cell]) {
                    if (color[n] < 0 && region[n] < 0) {
                        region[n] = regions;
                        stack.push(n);
                    }
                }
            }
            regions++;
        }
        const served = new Uint8Array(regions);
        for (let p = 0; p < ends.length; p++) {
            if (done[p]) continue;
            const h = head[p];
            const t = target[p];
            if (nbrs[h].includes(t)) {
                // となりどうしなら、そのままつなげる。島に寄り道もできる
                for (const n of nbrs[h]) if (color[n] < 0) for (const m of nbrs[t]) if (color[m] < 0 && region[m] === region[n]) served[region[n]] = 1;
                continue;
            }
            let met = false;
            for (const n of nbrs[h]) {
                if (color[n] >= 0) continue;
                for (const m of nbrs[t]) {
                    if (color[m] >= 0 || region[m] !== region[n]) continue;
                    served[region[n]] = 1;
                    met = true;
                }
            }
            if (!met) return false;
        }
        for (let r = 0; r < regions; r++) if (!served[r]) return false;
        return true;
    };

    const search = () => {
        if (count >= limit || ++nodes > maxNodes) return;
        // いちばん選び方の少ない口から伸ばす
        let best = -1;
        let bestOptions = null;
        for (let p = 0; p < ends.length; p++) {
            if (done[p]) continue;
            const options = nbrs[head[p]].filter(n => color[n] < 0 || n === target[p]);
            if (!options.length) return;
            if (!bestOptions || options.length < bestOptions.length) {
                best = p;
                bestOptions = options;
                if (options.length === 1) break;
            }
        }
        if (best < 0) {
            if (color.includes(-1)) return;
            count++;
            if (!first) first = trail.map(path => path.slice());
            if (keep) solutions.push(trail.map(path => path.slice()));
            return;
        }
        const p = best;
        const from = head[p];
        for (const next of bestOptions) {
            if (next === target[p]) {
                done[p] = true;
                trail[p].push(next);
                if (regionsOk() && nbrs[from].every(n => color[n] >= 0 || cellAlive(n))) search();
                trail[p].pop();
                done[p] = false;
            } else {
                color[next] = p;
                head[p] = next;
                trail[p].push(next);
                const touched = [...nbrs[from], ...nbrs[next]];
                if (touched.every(n => color[n] >= 0 || cellAlive(n)) && regionsOk()) search();
                trail[p].pop();
                head[p] = from;
                color[next] = -1;
            }
            if (count >= limit) return;
        }
    };

    search();
    return { count, paths: first, solutions, complete: nodes <= maxNodes };
}

// ---------- 生成 ----------

// 盤面を道で敷き詰める：1マスずつの道から始め、となりあう道の端どうしをつないでいく
// 道が自分自身に触れる（つながっていないマスどうしがとなりあう）つなぎ方はしない（遠回りの別解ができやすいため）
function randomCover(width, height, random, pairTarget) {
    const size = width * height;
    const nbrs = neighborsOf(width, height);
    let paths = Array.from({ length: size }, (_, i) => [i]);
    const owner = Array.from({ length: size }, (_, i) => i);
    const maxLen = Math.max(4, Math.round(size / pairTarget * 1.8));

    const touchesSelf = (a, b, link) => {
        const set = new Set(b);
        for (const cell of a) {
            for (const n of nbrs[cell]) {
                if (!set.has(n)) continue;
                if (cell === link[0] && n === link[1]) continue;
                return true;
            }
        }
        return false;
    };

    while (paths.filter(Boolean).length > pairTarget) {
        const candidates = [];
        paths.forEach((path, id) => {
            if (!path) return;
            for (const end of new Set([path[0], path[path.length - 1]])) {
                for (const n of nbrs[end]) {
                    const other = owner[n];
                    if (other === id) continue;
                    const q = paths[other];
                    if (q[0] !== n && q[q.length - 1] !== n) continue;
                    if (path.length + q.length > maxLen) continue;
                    if (id < other) candidates.push([id, end, other, n]);
                }
            }
        });
        if (!candidates.length) break;
        // 短い道どうしを先につなぐ（1マスの道を残さない）
        candidates.sort((x, y) => (paths[x[0]].length + paths[x[2]].length) - (paths[y[0]].length + paths[y[2]].length));
        const pool = candidates.slice(0, Math.max(1, Math.ceil(candidates.length / 3)));
        shuffle(pool, random);
        // 自分に触れないつなぎ方を先に探し、なければ（行き詰まったら）触れるつなぎ方も使う
        const choice = pool.find(([id, end, other, n]) => !touchesSelf(paths[id], paths[other], [end, n]))
            ?? candidates.find(([id, end, other, n]) => !touchesSelf(paths[id], paths[other], [end, n]))
            ?? pool[0];
        const [id, end, other, n] = choice;
        const a = paths[id];
        const b = paths[other];
        const left = a[0] === end ? a.slice().reverse() : a;
        const right = b[0] === n ? b : b.slice().reverse();
        const joined = [...left, ...right];
        paths[id] = joined;
        paths[other] = null;
        joined.forEach(cell => { owner[cell] = id; });
    }
    return paths.filter(Boolean);
}

// 別解があれば、元の答えと別解で通る線が違うマスで、元の道を2つに切る（数字の組が1つ増える）
function splitAtDifference(paths, other) {
    // 別解で、となりあうマスどうしの線（つながり）を集める
    const links = new Set();
    other.forEach(path => path.forEach((cell, i) => { if (i) links.add(Math.min(cell, path[i - 1]) + ':' + Math.max(cell, path[i - 1])); }));
    // 元の答えで、別解にないつながりのうち、切っても両側が3マス以上残るところ
    const cuts = [];
    paths.forEach((path, p) => {
        for (let i = 3; i <= path.length - 3; i++) {
            const a = path[i - 1];
            const b = path[i];
            if (!links.has(Math.min(a, b) + ':' + Math.max(a, b))) cuts.push([p, i]);
        }
    });
    if (!cuts.length) return null;
    // 真ん中に近い切り方を選ぶ（短い道ばかりにしない）
    cuts.sort((x, y) => Math.abs(x[1] - paths[x[0]].length / 2) - Math.abs(y[1] - paths[y[0]].length / 2));
    const [p, i] = cuts[0];
    return [...paths.slice(0, p), paths[p].slice(0, i), paths[p].slice(i), ...paths.slice(p + 1)];
}

const toPuzzle = (size, paths) => ({
    width: size,
    height: size,
    // 数字の番号は左上から順に付ける
    ends: paths.map(path => [path[0], path[path.length - 1]].sort((a, b) => a - b)).sort((x, y) => x[0] - y[0])
});

// 同じシードと難しさからは、同じ問題になる
export function generate(seed, difficulty = 'normal') {
    const size = SIZES[difficulty] ?? SIZES.normal;
    const [low, high] = PAIR_RANGE[difficulty] ?? PAIR_RANGE.normal;
    const random = createRandom(seed);
    for (let attempt = 0; attempt < 500; attempt++) {
        const pairTarget = low + randomInt(random, high - low + 1);
        let paths = randomCover(size, size, random, pairTarget);
        if (paths.some(path => path.length < 3)) continue;
        while (paths && paths.length <= high + 2) {
            const puzzle = toPuzzle(size, paths);
            const { count, complete, solutions } = countSolutions(puzzle, 2, { maxNodes: 100_000, keep: true });
            if (!complete) break;
            if (count === 1) return puzzle;
            if (count < 2) break;
            paths = splitAtDifference(paths, solutions.find(sol => !samePaths(sol, paths)) ?? solutions[1]);
        }
    }
    throw new Error('ナンバーリンクの問題を作れませんでした');
}

// 2つの答えが同じ線か（向きは問わない）
function samePaths(a, b) {
    const key = (list) => list.map(path => { const e = [path[0], path[path.length - 1]].sort((x, y) => x - y); return e.join(',') + ':' + [...path].sort((x, y) => x - y).join(','); }).sort().join('|');
    return key(a) === key(b);
}
