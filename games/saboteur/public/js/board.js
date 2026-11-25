/**
 * 盤面と、道のつながりの計算（DOM に依存しない）
 * 盤面は { "x,y": cell } の形。cell は
 *   { type: 'start' } / { type: 'goal', goal: ゴールの番号 } / { type: 'path', id: カードの番号, rotated: 180度回したか }
 * ゴールは goals[i] = { pos, card: GOAL_CARDS の番号, revealed, rotated } に持つ
 */

import { CARDS, START, GOAL_CARDS, DIRS, opposite, rotateEdges } from './cards.js';

export const key = (x, y) => `${x},${y}`;
export const parseKey = (k) => k.split(',').map(Number);
export const BOARD_LIMIT = 20; // 盤面の広さの安全弁（スタートからこのマス数まで）

// マスの辺（開いているか）。伏せたゴールは分からないので null
export function cellEdges(cell, goals) {
    if (cell.type === 'start') return START.edges;
    if (cell.type === 'goal') {
        const goal = goals[cell.goal];
        return goal.revealed ? rotateEdges(GOAL_CARDS[goal.card].edges, goal.rotated) : null;
    }
    return rotateEdges(CARDS[cell.id].edges, cell.rotated);
}

// 真ん中でつながっているか（行き止まりなら false）
export function cellConnected(cell, goals) {
    if (cell.type === 'path') return CARDS[cell.id].connected;
    if (cell.type === 'goal') return goals[cell.goal].revealed;
    return true;
}

// スタートからたどれる、つながったマスの集合（行き止まりのマスには入れるが、その先へは進めない）
export function liveCells(board, goals) {
    const live = new Set();
    const queue = [key(0, 0)];
    live.add(key(0, 0));
    while (queue.length > 0) {
        const k = queue.shift();
        const [x, y] = parseKey(k);
        const edges = cellEdges(board[k], goals);
        DIRS.forEach(([dx, dy], d) => {
            if (!edges[d]) return;
            const nk = key(x + dx, y + dy);
            const next = board[nk];
            if (!next || live.has(nk)) return;
            const nextEdges = cellEdges(next, goals);
            if (!nextEdges || !nextEdges[opposite(d)] || !cellConnected(next, goals)) return;
            live.add(nk);
            queue.push(nk);
        });
    }
    return live;
}

// 道のカードを (x, y) に置けるか。置けなければ理由を返す
export function placementError(board, goals, id, x, y, rotated, live = liveCells(board, goals)) {
    if (Math.abs(x) > BOARD_LIMIT || Math.abs(y) > BOARD_LIMIT) return '盤面の外です';
    if (board[key(x, y)]) return 'そこにはもうカードがあります';
    const edges = rotateEdges(CARDS[id].edges, rotated);
    let touches = false;
    let linked = false;
    for (let d = 0; d < 4; d++) {
        const [dx, dy] = DIRS[d];
        const nk = key(x + dx, y + dy);
        const next = board[nk];
        if (!next) continue;
        const nextEdges = cellEdges(next, goals);
        if (!nextEdges) continue; // 伏せたゴールとは、辺を合わせなくてよい
        touches = true;
        if (nextEdges[opposite(d)] !== edges[d]) return '隣のカードと道が合いません';
        if (edges[d] && live.has(nk)) linked = true;
    }
    if (!touches) return 'ほかのカードの隣に置きます';
    if (!linked) return 'スタートからつながる道に置きます';
    return null;
}

// 道のカードを置ける場所と向きの一覧
export function placements(board, goals, id) {
    const live = liveCells(board, goals);
    // 回しても同じ形（十字・直線）なら、回した候補は出さない
    const edges = CARDS[id].edges;
    const symmetric = rotateEdges(edges, true).every((e, d) => e === edges[d]);
    const seen = new Set();
    const result = [];
    Object.keys(board).forEach(k => {
        const [x, y] = parseKey(k);
        DIRS.forEach(([dx, dy]) => {
            const nk = key(x + dx, y + dy);
            if (board[nk] || seen.has(nk)) return;
            seen.add(nk);
            (symmetric ? [false] : [false, true]).forEach(rotated => {
                if (!placementError(board, goals, id, x + dx, y + dy, rotated, live)) result.push({ x: x + dx, y: y + dy, rotated });
            });
        });
    });
    return result;
}

// つながった道が届いた、まだ伏せてあるゴール
export function reachedGoals(board, goals) {
    const live = liveCells(board, goals);
    const reached = [];
    goals.forEach((goal, index) => {
        if (goal.revealed) return;
        const [gx, gy] = goal.pos;
        DIRS.forEach(([dx, dy], d) => {
            // ゴールから見て d の向きの隣が、ゴールの方へ開いたつながった道なら届いている
            const nk = key(gx + dx, gy + dy);
            const cell = board[nk];
            if (!cell || !live.has(nk)) return;
            if (cellEdges(cell, goals)[opposite(d)] && !reached.includes(index)) reached.push(index);
        });
    });
    return reached;
}

// めくったゴールの向き：届いた道の側が開く向きにする。できればまわりの辺もすべて合う向き
export function goalRotation(board, goals, index) {
    const goal = goals[index];
    const [gx, gy] = goal.pos;
    const live = liveCells(board, goals);
    const score = (rotated) => {
        const edges = rotateEdges(GOAL_CARDS[goal.card].edges, rotated);
        let linked = false;
        let fits = true;
        DIRS.forEach(([dx, dy], d) => {
            const nk = key(gx + dx, gy + dy);
            const cell = board[nk];
            if (!cell) return;
            const other = cellEdges(cell, goals);
            if (!other) return;
            if (other[opposite(d)] !== edges[d]) fits = false;
            if (edges[d] && other[opposite(d)] && live.has(nk)) linked = true;
        });
        return (linked ? 2 : 0) + (fits ? 1 : 0);
    };
    return score(true) > score(false);
}

// スタートからの道の先端（つながった道の、まだ何もない開いた辺）
export function openEnds(board, goals) {
    const live = liveCells(board, goals);
    const ends = [];
    live.forEach(k => {
        const [x, y] = parseKey(k);
        const edges = cellEdges(board[k], goals);
        DIRS.forEach(([dx, dy], d) => {
            if (edges[d] && !board[key(x + dx, y + dy)]) ends.push([x + dx, y + dy]);
        });
    });
    return ends;
}
