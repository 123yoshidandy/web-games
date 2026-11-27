/**
 * ぬりかべのロジック。DOM に触れない（サーバーとテストでもそのまま動く）
 *
 * 問題：{ width, height, numbers: [0|1.. …] }（数字のマス。0 は数字なし。左上から行ごと）
 * 状態：{ cells: [0|1|2 …] }（0 未定・1 壁（塗ったマス）・2 島の印（塗らないとわかったマス）。数字のマスは 0 のまま）
 * 入力：{ cells: [マスの番号…], value: 0|1|2 }（押した・なぞったマスをまとめて同じ値にする。数字のマスは受け付けない）
 *
 * 作り方：やさしいはその場で作り、ふつう・むずかしいは前もって作って確かめた組（pool.js）から選ぶ（SPECS）
 *
 * 決まり：数字のマスは、その数と同じ大きさの島（塗らないマスのつながり）に1つずつ入る。数字のない島はない。
 * 壁はすべてつながり、2×2 の壁のかたまりはない
 */

import { createRandom, randomInt, shuffle } from '../../random.js';
import { POOL } from './pool.js';

export const EMPTY = 0;
export const WALL = 1;
export const DOT = 2;

// 難しさごとの大きさ・島の大きさの上限と偏り（skew が大きいほど小さな島が多い）・理屈の強さ（trial：仮に置いて矛盾を探す理屈も使う）。
// pool：前もって作って確かめた組（pool.js）から選ぶ（その場で作ると、7×7 で 0.3 秒、9×9 で 10 秒を超えることがあるため。scripts/build-pool.mjs）。
// needTrial：仮置きが1回は要る問題だけを組に入れる
export const SPECS = {
    easy: { size: 5, maxIsland: 5, skew: 1.5, trial: false },
    normal: { size: 7, maxIsland: 7, skew: 2, trial: false, pool: true },
    hard: { size: 9, maxIsland: 9, skew: 2.5, trial: true, needTrial: true, pool: true }
};

// 解き方の中の値：-1 未定・0 島・1 壁
const UNKNOWN = -1;
const ISLAND = 0;
const BLACK = 1;

// ---------- 盤の形 ----------

const neighborCache = new Map();
export function neighborsOf(width, height) {
    const key = `${width}x${height}`;
    if (!neighborCache.has(key)) {
        neighborCache.set(key, Array.from({ length: width * height }, (_, i) => {
            const r = Math.floor(i / width);
            const c = i % width;
            const list = [];
            if (r > 0) list.push(i - width);
            if (c > 0) list.push(i - 1);
            if (c < width - 1) list.push(i + 1);
            if (r < height - 1) list.push(i + width);
            return list;
        }));
    }
    return neighborCache.get(key);
}

// 2×2 の4マスの組（左上のマスごと）
const squareCache = new Map();
function squaresOf(width, height) {
    const key = `${width}x${height}`;
    if (!squareCache.has(key)) {
        const list = [];
        for (let r = 0; r + 1 < height; r++) for (let c = 0; c + 1 < width; c++) {
            const i = r * width + c;
            list.push([i, i + 1, i + width, i + width + 1]);
        }
        squareCache.set(key, list);
    }
    return squareCache.get(key);
}

export function validPuzzle(puzzle) {
    return Number.isInteger(puzzle?.width) && Number.isInteger(puzzle.height) && puzzle.width > 0 && puzzle.height > 0
        && Array.isArray(puzzle.numbers) && puzzle.numbers.length === puzzle.width * puzzle.height
        && puzzle.numbers.every(n => Number.isInteger(n) && n >= 0);
}

// 値が同じマスのつながり（value の関数で選んだマス）。{ cells, numbers（数字のマス）, liberties（となりの未定のマス） }
function groupsOf(puzzle, grid, member) {
    const { width, height, numbers } = puzzle;
    const nb = neighborsOf(width, height);
    const groupOf = new Int32Array(grid.length).fill(-1);
    const groups = [];
    for (let start = 0; start < grid.length; start++) {
        if (groupOf[start] >= 0 || !member(grid[start])) continue;
        const group = { cells: [], numbers: [], liberties: [] };
        const libertySet = new Set();
        groupOf[start] = groups.length;
        const stack = [start];
        while (stack.length) {
            const cell = stack.pop();
            group.cells.push(cell);
            if (numbers[cell]) group.numbers.push(cell);
            for (const next of nb[cell]) {
                if (grid[next] === UNKNOWN) libertySet.add(next);
                else if (groupOf[next] < 0 && member(grid[next])) {
                    groupOf[next] = groups.length;
                    stack.push(next);
                }
            }
        }
        group.liberties = [...libertySet];
        groups.push(group);
    }
    return { groups, groupOf };
}

const totalWalls = (puzzle) => puzzle.numbers.length - puzzle.numbers.reduce((a, b) => a + b, 0);

// ---------- 理屈 ----------

// 今の盤（-1・0・1）で、その島から、まだ届くマス（未定か島のマスを通り、ほかの数字の島のとなりを通らず、大きさの残りで届く）
function reachable(puzzle, grid, islands, groupOf) {
    const { width, height, numbers } = puzzle;
    const nb = neighborsOf(width, height);
    const reach = new Uint8Array(grid.length);
    islands.groups.forEach((group, g) => {
        if (group.numbers.length !== 1) return;
        const budget = numbers[group.numbers[0]] - group.cells.length;
        if (budget <= 0) return;
        // ほかの数字の島のとなりのマスは、この島には入れない
        const blocked = (cell) => nb[cell].some(next => groupOf[next] >= 0 && groupOf[next] !== g && islands.groups[groupOf[next]].numbers.length);
        const dist = new Map(group.cells.map(cell => [cell, 0]));
        let frontier = group.cells.slice();
        for (let d = 1; d <= budget && frontier.length; d++) {
            const next = [];
            for (const cell of frontier) {
                for (const to of nb[cell]) {
                    if (dist.has(to) || grid[to] === BLACK) continue;
                    if (groupOf[to] >= 0 && islands.groups[groupOf[to]].numbers.length) continue;
                    if (blocked(to)) continue;
                    dist.set(to, d);
                    reach[to] = 1;
                    next.push(to);
                }
            }
            frontier = next;
        }
    });
    return reach;
}

// 盤が決まりにはっきり反していないか（矛盾があれば true）
export function contradicts(puzzle, grid) {
    const { width, height, numbers } = puzzle;
    for (const square of squaresOf(width, height)) if (square.every(cell => grid[cell] === BLACK)) return true;
    const islands = groupsOf(puzzle, grid, v => v === ISLAND);
    for (const group of islands.groups) {
        if (group.numbers.length > 1) return true;
        if (group.numbers.length === 1) {
            const size = numbers[group.numbers[0]];
            if (group.cells.length > size) return true;
            if (!group.liberties.length && group.cells.length < size) return true;
        } else if (!group.liberties.length) return true;
    }
    const walls = groupsOf(puzzle, grid, v => v === BLACK);
    const wallCount = grid.filter(v => v === BLACK).length;
    const need = totalWalls(puzzle);
    if (wallCount > need) return true;
    if (walls.groups.length > 1 && walls.groups.some(group => !group.liberties.length)) return true;
    if (grid.filter(v => v !== ISLAND).length < need) return true;
    // どの島からも届かない島のマス
    const reach = reachable(puzzle, grid, islands, islands.groupOf);
    for (const group of islands.groups) {
        if (group.numbers.length) continue;
        if (!group.cells.some(cell => reach[cell])) return true;
    }
    return false;
}

// 次に決まるマス：{ cells, value（ISLAND|BLACK）, rule } か null。やさしい理屈から順に探す
export function deduce(puzzle, grid, { trial = false } = {}) {
    const { width, height, numbers } = puzzle;
    const nb = neighborsOf(width, height);
    const islands = groupsOf(puzzle, grid, v => v === ISLAND);
    const { groups, groupOf } = islands;

    // 大きさどおりになった島のまわりは壁
    for (const group of groups) {
        if (group.numbers.length === 1 && group.cells.length === numbers[group.numbers[0]] && group.liberties.length) {
            return { cells: group.liberties.slice().sort((a, b) => a - b), value: BLACK, rule: 'complete', number: group.numbers[0] };
        }
    }
    // 2つの数字の島のとなりのマスは壁
    for (let cell = 0; cell < grid.length; cell++) {
        if (grid[cell] !== UNKNOWN) continue;
        const touching = new Set(nb[cell].map(next => groupOf[next]).filter(g => g >= 0 && groups[g].numbers.length));
        if (touching.size >= 2) return { cells: [cell], value: BLACK, rule: 'between' };
    }
    // 3つが壁の 2×2 の、残りのマスは島
    for (const square of squaresOf(width, height)) {
        const open = square.filter(cell => grid[cell] === UNKNOWN);
        if (open.length === 1 && square.filter(cell => grid[cell] === BLACK).length === 3) return { cells: open, value: ISLAND, rule: 'square' };
    }
    // 大きさの足りない島の出口が1つなら、そこは島
    for (const group of groups) {
        const short = group.numbers.length === 0 || group.cells.length < numbers[group.numbers[0]];
        if (short && group.numbers.length <= 1 && group.liberties.length === 1) return { cells: group.liberties.slice(), value: ISLAND, rule: 'island-exit', number: group.numbers[0] };
    }
    // 壁のかたまりの出口が1つで、ほかにも壁があるなら、そこは壁
    const walls = groupsOf(puzzle, grid, v => v === BLACK);
    const need = totalWalls(puzzle);
    for (const group of walls.groups) {
        if (group.liberties.length === 1 && group.cells.length < need) return { cells: group.liberties.slice(), value: BLACK, rule: 'wall-exit' };
    }
    // どの島からも届かないマスは壁
    const reach = reachable(puzzle, grid, islands, groupOf);
    const far = [];
    for (let cell = 0; cell < grid.length; cell++) if (grid[cell] === UNKNOWN && !reach[cell]) far.push(cell);
    if (far.length) return { cells: far, value: BLACK, rule: 'unreachable' };
    // 壁の数がちょうどそろったら、残りは島。島の数がそろったら、残りは壁
    const unknown = [];
    let wallCount = 0;
    grid.forEach((v, cell) => { if (v === UNKNOWN) unknown.push(cell); else if (v === BLACK) wallCount++; });
    if (unknown.length && wallCount === need) return { cells: unknown, value: ISLAND, rule: 'count' };
    if (unknown.length && wallCount + unknown.length === need) return { cells: unknown, value: BLACK, rule: 'count' };

    // 仮に置いてみて、やさしい理屈で進めると矛盾するなら、反対に決まる
    if (trial) {
        for (const cell of unknown) {
            for (const value of [BLACK, ISLAND]) {
                const test = grid.slice();
                test[cell] = value;
                if (propagate(puzzle, test) === 'contradiction') return { cells: [cell], value: 1 - value, rule: 'trial' };
            }
        }
    }
    return null;
}

// やさしい理屈（仮置きなし）で、決まるだけ決める。'contradiction'・'solved'・'stuck' を返す（grid を書き換える）
export function propagate(puzzle, grid) {
    for (;;) {
        if (contradicts(puzzle, grid)) return 'contradiction';
        if (!grid.includes(UNKNOWN)) return isSolution(puzzle, grid) ? 'solved' : 'contradiction';
        const step = deduce(puzzle, grid);
        if (!step) return 'stuck';
        step.cells.forEach(cell => { grid[cell] = step.value; });
    }
}

// 盤（0・1 だけ）が決まりをすべて満たすか
export function isSolution(puzzle, grid) {
    const { width, height, numbers } = puzzle;
    if (grid.some(v => v !== ISLAND && v !== BLACK)) return false;
    for (const square of squaresOf(width, height)) if (square.every(cell => grid[cell] === BLACK)) return false;
    const islands = groupsOf(puzzle, grid, v => v === ISLAND);
    if (!islands.groups.every(group => group.numbers.length === 1 && group.cells.length === numbers[group.numbers[0]])) return false;
    return groupsOf(puzzle, grid, v => v === BLACK).groups.length <= 1;
}

// 最初の盤（数字のマスは島、ほかは未定）
export const startGrid = (puzzle) => puzzle.numbers.map(n => (n ? ISLAND : UNKNOWN));

// 理屈だけで、どこまで解けるか。{ grid, steps（決めた回数）, trials（仮置きを使った回数）, solved }
export function logicSolve(puzzle, { trial = false, grid = startGrid(puzzle) } = {}) {
    const work = grid.slice();
    let steps = 0;
    let trials = 0;
    while (work.includes(UNKNOWN)) {
        if (contradicts(puzzle, work)) break;
        const step = deduce(puzzle, work, { trial });
        if (!step) break;
        step.cells.forEach(cell => { work[cell] = step.value; });
        steps++;
        if (step.rule === 'trial') trials++;
    }
    return { grid: work, steps, trials, solved: !work.includes(UNKNOWN) && isSolution(puzzle, work) };
}

// ---------- 解の数え上げ ----------

// 解の数（limit まで）と、1つ目の解（0・1 の盤）。理屈で決まるだけ決め、残りは未定のマスで分ける
export function countSolutions(puzzle, limit = 2) {
    if (!validPuzzle(puzzle)) return { count: 0, grid: null };
    // 理屈（どれも正しい推論）だけで解ければ、解は1つ
    const logic = logicSolve(puzzle, { trial: true });
    if (logic.solved) return { count: 1, grid: logic.grid };
    let count = 0;
    let first = null;
    const search = (grid) => {
        const result = propagate(puzzle, grid);
        if (result === 'contradiction') return false;
        if (result === 'solved') {
            count++;
            if (!first) first = grid.slice();
            return count >= limit;
        }
        // 島のとなりの未定のマスから分ける（なければ最初の未定のマス）
        const nb = neighborsOf(puzzle.width, puzzle.height);
        let cell = grid.findIndex((v, i) => v === UNKNOWN && nb[i].some(next => grid[next] === ISLAND));
        if (cell < 0) cell = grid.indexOf(UNKNOWN);
        for (const value of [BLACK, ISLAND]) {
            const next = grid.slice();
            next[cell] = value;
            if (search(next)) return true;
        }
        return false;
    };
    search(startGrid(puzzle));
    return { count, grid: first };
}

// ---------- 問題を作る ----------

// 答えの盤：島を1つずつ育て（ほかの島に触れず、壁のつながりを切らない）、2×2 の壁のかたまりを島で崩す。だめなら null
export function makeSolution(spec, random) {
    const { size, maxIsland } = spec;
    const n = size * size;
    const nb = neighborsOf(size, size);
    const owner = new Int32Array(n).fill(-1); // 島の番号（-1 は壁）
    const islands = [];
    const wallsConnected = () => {
        const start = owner.indexOf(-1);
        if (start < 0) return true;
        const seen = new Uint8Array(n);
        seen[start] = 1;
        const stack = [start];
        let count = 1;
        while (stack.length) {
            for (const next of nb[stack.pop()]) {
                if (seen[next] || owner[next] >= 0) continue;
                seen[next] = 1;
                count++;
                stack.push(next);
            }
        }
        return count === owner.filter(o => o < 0).length;
    };
    // そのマスを島 id にしてよいか（ほかの島に触れず、壁がつながったまま）
    const canTake = (cell, id) => {
        if (owner[cell] >= 0 || nb[cell].some(next => owner[next] >= 0 && owner[next] !== id)) return false;
        owner[cell] = id;
        const ok = wallsConnected();
        owner[cell] = -1;
        return ok;
    };
    for (const seed of shuffle(Array.from({ length: n }, (_, i) => i), random)) {
        const id = islands.length;
        if (!canTake(seed, id)) continue;
        owner[seed] = id;
        const island = [seed];
        const target = 1 + Math.floor(random() ** (spec.skew ?? 1) * maxIsland);
        while (island.length < target) {
            const options = shuffle([...new Set(island.flatMap(cell => nb[cell]))], random).filter(cell => canTake(cell, id));
            if (!options.length) break;
            owner[options[0]] = id;
            island.push(options[0]);
        }
        islands.push(island);
    }
    // 2×2 の壁のかたまりを、島のマスで崩す（となりの島に足すか、1マスの島にする）
    for (let changed = true; changed;) {
        changed = false;
        for (const square of squaresOf(size, size)) {
            if (!square.every(cell => owner[cell] < 0)) continue;
            const options = shuffle(square.slice(), random).map(cell => {
                const touching = [...new Set(nb[cell].map(next => owner[next]).filter(o => o >= 0))];
                return { cell, touching };
            }).filter(({ cell, touching }) => touching.length <= 1 && (!touching.length || islands[touching[0]].length < maxIsland) && canTake(cell, touching[0] ?? islands.length));
            if (!options.length) return null;
            const { cell, touching } = options[0];
            const id = touching[0] ?? islands.length;
            if (id === islands.length) islands.push([]);
            owner[cell] = id;
            islands[id].push(cell);
            changed = true;
        }
    }
    return { owner, islands };
}

// 答えの盤から問題を作る（島ごとに、でたらめなマスに島の大きさを書く）
export function puzzleFrom(size, islands, random) {
    const numbers = new Array(size * size).fill(0);
    for (const island of islands) numbers[island[randomInt(random, island.length)]] = island.length;
    return { width: size, height: size, numbers };
}

// その場で、理屈だけで解ける問題を1つ作る（理屈は正しい推論だけなので、解ければ解は1つ）。
// spec.needTrial なら、仮置きが要らない問題は採らない。tries 回で作れなければ null
export function buildPuzzle(spec, random, tries = Infinity) {
    for (let attempt = 0; attempt < tries; attempt++) {
        const solution = makeSolution(spec, random);
        if (!solution) continue;
        const puzzle = puzzleFrom(spec.size, solution.islands, random);
        const result = logicSolve(puzzle, { trial: spec.trial });
        if (result.solved && (!spec.needTrial || result.trials > 0)) return puzzle;
    }
    return null;
}

// ---------- 問題の組（pool.js） ----------

// 問題を文字にする（1行ずつ / で区切る。数字のないマスは .、島の大きさは 1〜9 の1文字）
export const encode = (puzzle) => Array.from({ length: puzzle.height }, (_, r) => puzzle.numbers.slice(r * puzzle.width, (r + 1) * puzzle.width).map(n => (n ? String(n) : '.')).join('')).join('/');

export function decode(text) {
    const rows = text.split('/');
    return { width: rows[0].length, height: rows.length, numbers: [...rows.join('')].map(ch => (ch === '.' ? 0 : Number(ch))) };
}

// 正方形の盤を回す・裏返す（k は 0〜7。決まりは向きによらないので、解は1つのまま）
export function transform(puzzle, k) {
    const { width: size, numbers } = puzzle;
    const next = new Array(numbers.length).fill(0);
    numbers.forEach((n, i) => {
        let r = Math.floor(i / size);
        let c = i % size;
        if (k & 4) c = size - 1 - c;
        for (let t = 0; t < (k & 3); t++) [r, c] = [c, size - 1 - r];
        next[r * size + c] = n;
    });
    return { width: size, height: size, numbers: next };
}

// 問題（同じ引数なら同じ問題。解は必ず1つ）。組のある難しさは組から1つ選んで向きを変え、ないものはその場で作る
export function generate(seed, difficulty = 'normal') {
    const spec = SPECS[difficulty] ?? SPECS.normal;
    const random = createRandom(seed);
    const list = spec.pool ? POOL[difficulty] : null;
    if (list?.length) return transform(decode(list[randomInt(random, list.length)]), randomInt(random, 8));
    return buildPuzzle(spec, random);
}
