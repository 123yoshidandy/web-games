/**
 * コリドールのルールの中身（DOM に依存しない。CPU の先読みでも使う）
 *
 * 盤は 9×9。マスは番号 c = y * 9 + x（x は左から、y は上から 0〜8）で持つ
 * 壁は、マスの間の溝の交点（ax, ay は 0〜7）と向き（h 横・v 縦）で持つ
 *   h (ax, ay)：行 ay と ay+1 の間で、列 ax と ax+1 をふさぐ
 *   v (ax, ay)：列 ax と ax+1 の間で、行 ay と ay+1 をふさぐ
 * 辺（side）：0 下・1 左・2 上・3 右。各人は自分の辺の中央から始め、向かいの辺に着いたら勝ち
 * 席（seat）の順に手番が回る。4人では 下→左→上→右（時計回り）
 */

export const SIZE = 9;
export const SLOTS = SIZE - 1;               // 壁の交点は 8×8
export const WALLS_PER_PLAYER = { 2: 10, 4: 5 };
export const SIDES_FOR = { 2: [0, 2], 4: [0, 1, 2, 3] };
const START = [[4, 8], [0, 4], [4, 0], [8, 4]];
// 向き：0 上・1 右・2 下・3 左
const DX = [0, 1, 0, -1];
const DY = [-1, 0, 1, 0];

export const cellOf = (x, y) => y * SIZE + x;
export const xOf = (c) => c % SIZE;
export const yOf = (c) => Math.floor(c / SIZE);

export function isGoal(side, c) {
    const x = c % SIZE;
    const y = (c - x) / SIZE;
    return side === 0 ? y === 0 : side === 1 ? x === SIZE - 1 : side === 2 ? y === SIZE - 1 : x === 0;
}

// players: 2 か 4、first: 最初の手番の席
export function createState({ players = 2, first = 0 } = {}) {
    if (!SIDES_FOR[players]) throw new Error('2人か4人で遊びます');
    const sides = SIDES_FOR[players];
    return {
        players,
        sides: [...sides],
        pawns: sides.map(s => cellOf(START[s][0], START[s][1])),
        walls: sides.map(() => WALLS_PER_PLAYER[players]),
        h: new Array(SLOTS * SLOTS).fill(0),
        v: new Array(SLOTS * SLOTS).fill(0),
        placed: [],          // 置いた壁の順の一覧 { x, y, o, seat }
        current: first,
        result: null         // 決着したら { winner }
    };
}

const slot = (arr, ax, ay) => ax >= 0 && ax < SLOTS && ay >= 0 && ay < SLOTS && arr[ay * SLOTS + ax] === 1;

// c から dir の向きへ1マス進めるか（盤の外と壁を見る。駒は見ない）
export function canStep(h, v, c, dir) {
    const x = c % SIZE;
    const y = (c - x) / SIZE;
    switch (dir) {
        case 0: return y > 0 && !slot(h, x, y - 1) && !slot(h, x - 1, y - 1);
        case 1: return x < SIZE - 1 && !slot(v, x, y) && !slot(v, x, y - 1);
        case 2: return y < SIZE - 1 && !slot(h, x, y) && !slot(h, x - 1, y);
        default: return x > 0 && !slot(v, x - 1, y) && !slot(v, x - 1, y - 1);
    }
}

const step = (c, dir) => c + DY[dir] * SIZE + DX[dir];

const queue = new Int16Array(SIZE * SIZE);
const prev = new Int16Array(SIZE * SIZE);

// ゴールまでの最短の歩数（駒は無視する）。withPath なら、その道のマスの列（スタートからゴールまで）も返す
export function shortestPath(h, v, from, side, withPath = false) {
    if (isGoal(side, from)) return withPath ? { dist: 0, path: [from] } : 0;
    prev.fill(-1);
    prev[from] = from;
    let head = 0;
    let tail = 0;
    queue[tail++] = from;
    while (head < tail) {
        const c = queue[head++];
        for (let dir = 0; dir < 4; dir++) {
            if (!canStep(h, v, c, dir)) continue;
            const n = step(c, dir);
            if (prev[n] !== -1) continue;
            prev[n] = c;
            if (isGoal(side, n)) {
                const path = [n];
                let p = n;
                while (p !== from) { p = prev[p]; path.push(p); }
                return withPath ? { dist: path.length - 1, path: path.reverse() } : path.length - 1;
            }
            queue[tail++] = n;
        }
    }
    return withPath ? { dist: Infinity, path: null } : Infinity;
}

export const distances = (state) => state.pawns.map((c, seat) => shortestPath(state.h, state.v, c, state.sides[seat]));

// 壁 (ax, ay, o) が、隣り合うマス a・b の間をふさぐか
function wallCuts(ax, ay, o, a, b) {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    const x = lo % SIZE;
    const y = (lo - x) / SIZE;
    if (hi - lo === SIZE) return o === 'h' && ay === y && (ax === x || ax === x - 1);
    return o === 'v' && ax === x && (ay === y || ay === y - 1);
}

// 道（マスの列）を、この壁がふさぐか
export function wallCutsPath(wall, path) {
    for (let i = 1; i < path.length; i++) {
        if (wallCuts(wall.x, wall.y, wall.o, path[i - 1], path[i])) return true;
    }
    return false;
}

// 重なり・交差だけを見る（道をふさぐかは見ない）。問題なければ null
function overlapReason(state, { x, y, o }) {
    const arr = o === 'h' ? state.h : state.v;
    const other = o === 'h' ? state.v : state.h;
    if (slot(arr, x, y)) return 'overlap';
    if (o === 'h' ? slot(arr, x - 1, y) || slot(arr, x + 1, y) : slot(arr, x, y - 1) || slot(arr, x, y + 1)) return 'overlap';
    if (slot(other, x, y)) return 'cross';
    return null;
}

function setWall(state, { x, y, o }, value) {
    (o === 'h' ? state.h : state.v)[y * SLOTS + x] = value;
}

// 各人の最短の道（1本）。壁が道をふさがなければ、その人の歩数は変わらない
export const paths = (state) => state.pawns.map((c, seat) => shortestPath(state.h, state.v, c, state.sides[seat], true).path);

/**
 * 壁を置けない理由。置けるなら null
 *   { code: 'none' } 壁が残っていない / 'range' 盤の外 / 'overlap' 重なる / 'cross' 交差する / 'block'（seat）道をふさぐ
 * knownPaths を渡すと、道の計算を使い回す
 */
export function wallReason(state, wall, knownPaths = null) {
    if (state.walls[state.current] <= 0) return { code: 'none' };
    const { x, y, o } = wall;
    if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x >= SLOTS || y >= SLOTS || (o !== 'h' && o !== 'v')) return { code: 'range' };
    const overlap = overlapReason(state, wall);
    if (overlap) return { code: overlap };
    const ps = knownPaths ?? paths(state);
    const cut = ps.map(p => wallCutsPath(wall, p));
    if (!cut.some(Boolean)) return null;
    setWall(state, wall, 1);
    let blocked = -1;
    for (let seat = 0; seat < state.pawns.length && blocked < 0; seat++) {
        if (cut[seat] && shortestPath(state.h, state.v, state.pawns[seat], state.sides[seat]) === Infinity) blocked = seat;
    }
    setWall(state, wall, 0);
    return blocked >= 0 ? { code: 'block', seat: blocked } : null;
}

// 置ける壁の一覧
export function legalWalls(state) {
    if (state.result || state.walls[state.current] <= 0) return [];
    const ps = paths(state);
    const list = [];
    for (let y = 0; y < SLOTS; y++) {
        for (let x = 0; x < SLOTS; x++) {
            for (const o of ['h', 'v']) {
                const wall = { x, y, o };
                if (!wallReason(state, wall, ps)) list.push(wall);
            }
        }
    }
    return list;
}

// seat の駒が動ける先のマス
// 隣の駒とは向かい合ったら飛び越える。その後ろが壁・盤の端・別の駒なら、隣の駒の左右（斜め）へ進める
export function pawnMoves(state, seat = state.current) {
    const { h, v, pawns } = state;
    const from = pawns[seat];
    const occupied = (c) => pawns.includes(c);
    const result = [];
    for (let dir = 0; dir < 4; dir++) {
        if (!canStep(h, v, from, dir)) continue;
        const n = step(from, dir);
        if (!occupied(n)) {
            result.push(n);
            continue;
        }
        if (canStep(h, v, n, dir) && !occupied(step(n, dir))) {
            result.push(step(n, dir));
            continue;
        }
        for (const side of [(dir + 1) % 4, (dir + 3) % 4]) {
            if (!canStep(h, v, n, side)) continue;
            const d = step(n, side);
            if (!occupied(d) && !result.includes(d)) result.push(d);
        }
    }
    return result;
}

export const actionKey = (a) => a.type === 'wall' ? `wall:${a.x},${a.y},${a.o}` : a.type === 'move' ? `move:${a.x},${a.y}` : a.type;

// 今の手番の人の通る手。動かす手も壁もなければパスだけ
export function legalActions(state) {
    if (state.result) return [];
    const moves = pawnMoves(state).map(c => ({ type: 'move', x: xOf(c), y: yOf(c) }));
    const walls = legalWalls(state).map(w => ({ type: 'wall', ...w }));
    const list = [...moves, ...walls];
    return list.length ? list : [{ type: 'pass' }];
}

export function cloneState(state) {
    return {
        ...state,
        sides: state.sides,
        pawns: state.pawns.slice(),
        walls: state.walls.slice(),
        h: state.h.slice(),
        v: state.v.slice(),
        placed: state.placed.slice(),
        result: state.result ? { ...state.result } : null
    };
}

// 手を当てた新しい状態を返す（元の状態は変えない）。手が通るかは確かめない（legalActions で確かめてから呼ぶ）
export function applyAction(state, action) {
    const next = cloneState(state);
    const seat = state.current;
    if (action.type === 'move') {
        next.pawns[seat] = cellOf(action.x, action.y);
        if (isGoal(next.sides[seat], next.pawns[seat])) {
            next.result = { winner: seat };
            return next;
        }
    } else if (action.type === 'wall') {
        setWall(next, action, 1);
        next.walls[seat]--;
        next.placed.push({ x: action.x, y: action.y, o: action.o, seat });
    }
    next.current = (seat + 1) % next.players;
    return next;
}

// 同じ局面かを見分ける鍵（壁は増えるだけなので、置いた数で足りる）
export const positionKey = (state) => `${state.pawns.join(',')}|${state.placed.length}|${state.current}`;
