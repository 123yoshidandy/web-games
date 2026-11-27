/**
 * 四角に切れのロジック。DOM に触れない（サーバーとテストでもそのまま動く）
 *
 * ルール：盤面を、たて・よこの線にそって長方形（正方形も）に切り分ける。どの長方形にも数字がちょうど1つ入り、
 *         その数字は長方形のマスの数
 * 問題：{ width, height, clues: [[マス, 数字]…] }（マスは左上から行ごとの番号。マスの順に並ぶ）
 * 状態：{ rects: [[上, 左, 下, 右]…] }（描いた長方形。行・列の番号で、下と右も含む。左上のマスの順に並ぶ）
 * 入力：{ type: 'rect', top, left, bottom, right }（長方形を描く。重なっていた長方形は消える）
 *       { type: 'erase', cell }（そのマスを含む長方形を消す）
 */

import { createRandom, randomInt, shuffle } from '../../random.js';

export const SIZES = { easy: 6, normal: 8, hard: 10 };
// 長方形の大きさ（マスの数）の上限
const MAX_AREA = { easy: 6, normal: 9, hard: 12 };

export const areaOf = ([top, left, bottom, right]) => (bottom - top + 1) * (right - left + 1);
export const containsCell = ([top, left, bottom, right], width, cell) => {
    const r = Math.floor(cell / width);
    const c = cell % width;
    return r >= top && r <= bottom && c >= left && c <= right;
};
export const cellsOf = ([top, left, bottom, right], width) => {
    const cells = [];
    for (let r = top; r <= bottom; r++) for (let c = left; c <= right; c++) cells.push(r * width + c);
    return cells;
};
export const sameRect = (x, y) => x.length === 4 && y.length === 4 && x.every((v, i) => v === y[i]);

// ---------- 候補 ----------

// 数字ごとの、置ける長方形（数字のマスを含み、面積が数字で、ほかの数字を含まない）
function buildCandidates(puzzle) {
    const { width: w, height: h, clues } = puzzle;
    const clueAt = new Int16Array(w * h).fill(-1);
    clues.forEach(([cell], k) => { clueAt[cell] = k; });
    return clues.map(([cell, n], k) => {
        const r = Math.floor(cell / w);
        const c = cell % w;
        const list = [];
        for (let rows = 1; rows <= n; rows++) {
            if (n % rows) continue;
            const cols = n / rows;
            if (rows > h || cols > w) continue;
            for (let top = Math.max(0, r - rows + 1); top <= r && top + rows <= h; top++) {
                for (let left = Math.max(0, c - cols + 1); left <= c && left + cols <= w; left++) {
                    const rect = [top, left, top + rows - 1, left + cols - 1];
                    const cells = cellsOf(rect, w);
                    if (cells.every(x => clueAt[x] < 0 || clueAt[x] === k)) list.push({ rect, cells });
                }
            }
        }
        return list;
    });
}

const candidateCache = new Map();
export function candidatesOf(puzzle) {
    const key = JSON.stringify(puzzle);
    if (!candidateCache.has(key)) {
        if (candidateCache.size > 20) candidateCache.delete(candidateCache.keys().next().value);
        candidateCache.set(key, buildCandidates(puzzle));
    }
    return candidateCache.get(key);
}

// 埋まったマス（covered）と重ならない候補
export const openCandidates = (list, covered) => list.filter(({ cells }) => cells.every(x => !covered[x]));

// ---------- 解く ----------

// 解を limit 個まで数える。solutions は見つけた解（長方形の並び。数字の順）
export function countSolutions(puzzle, limit = 2, candidates = buildCandidates(puzzle)) {
    const { width: w, height: h, clues } = puzzle;
    const covered = new Uint8Array(w * h);
    const chosen = new Array(clues.length).fill(null);
    const solutions = [];
    let nodes = 0;
    const search = (left) => {
        if (solutions.length >= limit || nodes++ > 300000) return;
        if (!left) {
            solutions.push(chosen.map(rect => rect.slice()));
            return;
        }
        // 置ける候補がいちばん少ない数字から決める。どの候補も届かないマスが残ったら行き止まり
        let best = -1;
        let bestList = null;
        const reach = new Uint8Array(w * h);
        for (let k = 0; k < clues.length; k++) {
            if (chosen[k]) continue;
            const list = openCandidates(candidates[k], covered);
            if (!list.length) return;
            list.forEach(({ cells }) => cells.forEach(x => { reach[x] = 1; }));
            if (!bestList || list.length < bestList.length) {
                best = k;
                bestList = list;
            }
        }
        for (let x = 0; x < w * h; x++) if (!covered[x] && !reach[x]) return;
        for (const { rect, cells } of bestList) {
            cells.forEach(x => { covered[x] = 1; });
            chosen[best] = rect;
            search(left - 1);
            chosen[best] = null;
            cells.forEach(x => { covered[x] = 0; });
            if (solutions.length >= limit) return;
        }
    };
    search(clues.length);
    // 探しきれなかったら、解が1つとは言えないので2つとみなす
    const count = nodes > 300000 && solutions.length < limit ? limit : solutions.length;
    return { count, solutions };
}

// ---------- 作る ----------

// 盤面を長方形に切り分ける（左上から、まだのマスを角にして、入る大きさから選ぶ）
function partition(width, height, maxArea, random) {
    const owner = new Int16Array(width * height).fill(-1);
    const rects = [];
    for (let cell = 0; cell < width * height; cell++) {
        if (owner[cell] >= 0) continue;
        const r = Math.floor(cell / width);
        const c = cell % width;
        let maxCols = 0;
        while (c + maxCols < width && owner[cell + maxCols] < 0) maxCols++;
        const options = [];
        for (let rows = 1; r + rows <= height; rows++) {
            for (let cols = 1; cols <= maxCols && rows * cols <= maxArea; cols++) {
                if (rows * cols >= 2) options.push([rows, cols]);
            }
            if (rows >= maxArea) break;
        }
        // 2マス以上が入らないときだけ1マス。ときどき1マスも混ぜる
        const [rows, cols] = options.length && random() > 0.04 ? options[randomInt(random, options.length)] : [1, 1];
        const rect = [r, c, r + rows - 1, c + cols - 1];
        cellsOf(rect, width).forEach(x => { owner[x] = rects.length; });
        rects.push(rect);
    }
    return rects;
}

const puzzleOf = (width, height, rects, spots) => ({
    width,
    height,
    clues: rects.map((rect, i) => [spots[i], areaOf(rect)]).sort((x, y) => x[0] - y[0])
});

// 同じシードと難しさなら同じ問題。解が1つになるまで、別解と食い違う長方形の数字の位置を置き直す
export function generate(seed, difficulty = 'normal') {
    const level = SIZES[difficulty] ? difficulty : 'normal';
    const size = SIZES[level];
    const random = createRandom(seed);
    for (let attempt = 0; attempt < 300; attempt++) {
        const rects = partition(size, size, MAX_AREA[level], random);
        const spots = rects.map(rect => {
            const cells = cellsOf(rect, size);
            return cells[randomInt(random, cells.length)];
        });
        for (let fix = 0; fix < 12; fix++) {
            const puzzle = puzzleOf(size, size, rects, spots);
            const { count, solutions } = countSolutions(puzzle, 2);
            if (count === 1) return puzzle;
            if (solutions.length < 2) break;
            // 別解に出てこない長方形の数字を、その長方形の中で置き直す
            const other = solutions.find(solution => solution.some(rect => !rects.some(x => sameRect(x, rect))));
            if (!other) break;
            const differing = rects.map((rect, i) => i).filter(i => !other.some(rect => sameRect(rect, rects[i])));
            shuffle(differing, random).slice(0, 2).forEach(i => {
                const cells = cellsOf(rects[i], size);
                spots[i] = cells[randomInt(random, cells.length)];
            });
        }
    }
    throw new Error('四角に切れの問題を作れませんでした');
}
