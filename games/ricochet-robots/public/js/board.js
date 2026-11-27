/**
 * 盤面（16×16 のマスと壁・目標・ロボット）と、ロボットの動き
 * 盤面の絵柄と壁の配置は自作。対戦ごとにシード付きの乱数で作る（4つの区画に、L字の壁で囲んだ目標と、外周の短い壁を置く）
 * DOM に依存しないので、画面・サーバー・テストで同じものを使う
 */

import { shuffle } from './random.js';

export const SIZE = 16;
export const CELLS = SIZE * SIZE;

// 壁は、マスごとに4辺のビットで持つ（隣のマスにも同じ壁を入れる）
export const WALL = { N: 1, E: 2, S: 4, W: 8 };
// 向き：0 上・1 右・2 下・3 左
export const DIRS = [0, 1, 2, 3];
export const DIR_BITS = [WALL.N, WALL.E, WALL.S, WALL.W];
export const DIR_DELTA = [-SIZE, 1, SIZE, -1];
export const DIR_NAMES = ['上', '右', '下', '左'];
export const DIR_ARROWS = ['↑', '→', '↓', '←'];
const OPPOSITE = [2, 3, 0, 1];

// ロボットの色（0〜3 は目標の色。4 は銀で、目標を持たないじゃま役）
export const ROBOT_COLORS = ['red', 'blue', 'green', 'yellow', 'silver'];
export const ROBOT_NAMES = ['赤', '青', '緑', '黄', '銀'];
export const SILVER = 4;
// 目標の記号（色ごとに4つ）と、どのロボットでもよい渦の目標
export const SYMBOLS = ['ring', 'triangle', 'diamond', 'star'];
export const SYMBOL_NAMES = ['輪', '三角', 'ひし形', '星'];
export const VORTEX = 16;          // 渦の目標の id（0〜15 は 色×4＋記号）
export const TARGET_COUNT = 17;

// 真ん中の 2×2 は入れない
export const CENTER = [7 * SIZE + 7, 7 * SIZE + 8, 8 * SIZE + 7, 8 * SIZE + 8];

export const cellOf = (x, y) => y * SIZE + x;
export const xOf = cell => cell % SIZE;
export const yOf = cell => Math.floor(cell / SIZE);

// 目標の情報：色（渦は null）と記号
export function targetInfo(id) {
    if (id === VORTEX) return { id, color: null, symbol: 'vortex', name: '渦（どのロボットでも）' };
    const color = Math.floor(id / 4);
    const symbol = id % 4;
    return { id, color, symbol: SYMBOLS[symbol], name: `${ROBOT_NAMES[color]}の${SYMBOL_NAMES[symbol]}` };
}

function addWall(walls, cell, dir) {
    walls[cell] |= DIR_BITS[dir];
    const x = xOf(cell) + [0, 1, 0, -1][dir];
    const y = yOf(cell) + [-1, 0, 1, 0][dir];
    if (x >= 0 && x < SIZE && y >= 0 && y < SIZE) walls[cellOf(x, y)] |= DIR_BITS[OPPOSITE[dir]];
}

// 隣り合う2マスのあいだに壁を置く
function wallBetween(walls, a, b) {
    const dx = xOf(b) - xOf(a);
    const dy = yOf(b) - yOf(a);
    const dir = dy === -1 ? 0 : dx === 1 ? 1 : dy === 1 ? 2 : 3;
    addWall(walls, a, dir);
}

// 区画（0 左上・1 右上・2 右下・3 左下）の中の位置（盤の角が (0,0)、真ん中寄りが (7,7)）を、盤のマスに直す
function toGlobal(quadrant, lx, ly) {
    const x = quadrant === 1 || quadrant === 2 ? SIZE - 1 - lx : lx;
    const y = quadrant >= 2 ? SIZE - 1 - ly : ly;
    return cellOf(x, y);
}

// 盤面を作る。{ walls: マスごとの壁のビット, targets: [{ id, cell }] }
export function generateBoard(random) {
    for (let attempt = 0; attempt < 200; attempt++) {
        const board = tryGenerate(random);
        if (board) return board;
    }
    throw new Error('盤面を作れませんでした');
}

function tryGenerate(random) {
    const walls = new Array(CELLS).fill(0);
    for (let i = 0; i < SIZE; i++) {
        walls[cellOf(i, 0)] |= WALL.N;
        walls[cellOf(i, SIZE - 1)] |= WALL.S;
        walls[cellOf(0, i)] |= WALL.W;
        walls[cellOf(SIZE - 1, i)] |= WALL.E;
    }
    // 真ん中の 2×2 を壁で囲む
    addWall(walls, cellOf(7, 7), 0); addWall(walls, cellOf(7, 7), 3);
    addWall(walls, cellOf(8, 7), 0); addWall(walls, cellOf(8, 7), 1);
    addWall(walls, cellOf(7, 8), 2); addWall(walls, cellOf(7, 8), 3);
    addWall(walls, cellOf(8, 8), 2); addWall(walls, cellOf(8, 8), 1);

    // 各区画に、4色の目標を1つずつ。記号は区画ごとにずらし、どの区画にも4つの記号がそろう（色と記号の組は全体で1つずつ）
    const symbolShift = shuffle([0, 1, 2, 3], random);
    const vortexQuadrant = Math.floor(random() * 4);
    const targets = [];
    for (let q = 0; q < 4; q++) {
        const ids = [0, 1, 2, 3].map(color => color * 4 + (color + symbolShift[q]) % 4);
        if (q === vortexQuadrant) ids.push(VORTEX);
        const spots = placeSpots(random, ids.length);
        if (!spots) return null;
        shuffle(ids, random);
        spots.forEach(([lx, ly], i) => {
            const cell = toGlobal(q, lx, ly);
            targets.push({ id: ids[i], cell });
            // L字の壁：隣り合う2辺
            const first = Math.floor(random() * 4);
            addWall(walls, cell, first);
            addWall(walls, cell, (first + 1) % 4);
        });
        // 外周の短い壁：区画の2つの外の辺に1つずつ
        const along = 2 + Math.floor(random() * 4);
        wallBetween(walls, toGlobal(q, along, 0), toGlobal(q, along + 1, 0));
        const down = 2 + Math.floor(random() * 4);
        wallBetween(walls, toGlobal(q, 0, down), toGlobal(q, 0, down + 1));
    }
    if (!allConnected(walls)) return null;
    targets.sort((a, b) => a.id - b.id);
    return { walls, targets };
}

// 区画の中で、目標を置く位置を選ぶ（1〜6 の範囲。行も列も重ならず、斜めを含めて隣り合わない）
function placeSpots(random, count) {
    for (let attempt = 0; attempt < 400; attempt++) {
        const spots = [];
        for (let tries = 0; tries < 60 && spots.length < count; tries++) {
            const lx = 1 + Math.floor(random() * 6);
            const ly = 1 + Math.floor(random() * 6);
            if (lx === 6 && ly === 6) continue;
            const clash = spots.some(([x, y]) => x === lx || y === ly || (Math.abs(x - lx) <= 1 && Math.abs(y - ly) <= 1));
            if (!clash) spots.push([lx, ly]);
        }
        if (spots.length === count) return spots;
    }
    return null;
}

// 真ん中以外のマスが、すべて隣どうしでつながっているか
function allConnected(walls) {
    const seen = new Uint8Array(CELLS);
    CENTER.forEach(cell => { seen[cell] = 1; });
    const stack = [0];
    seen[0] = 1;
    let count = 1;
    while (stack.length) {
        const cell = stack.pop();
        for (const dir of DIRS) {
            if (walls[cell] & DIR_BITS[dir]) continue;
            const next = cell + DIR_DELTA[dir];
            if (seen[next]) continue;
            seen[next] = 1;
            count++;
            stack.push(next);
        }
    }
    return count === CELLS - CENTER.length;
}

// ロボットの最初の位置（目標と真ん中を避け、重ならない）
export function placeRobots(random, count, targets) {
    const blocked = new Set([...CENTER, ...targets.map(target => target.cell)]);
    const robots = [];
    while (robots.length < count) {
        const cell = Math.floor(random() * CELLS);
        if (blocked.has(cell) || robots.includes(cell)) continue;
        robots.push(cell);
    }
    return robots;
}

// ロボットを1つ動かした先（壁か、ほかのロボットに当たるまで滑る）
export function slide(walls, robots, robot, dir) {
    let cell = robots[robot];
    const bit = DIR_BITS[dir];
    while (!(walls[cell] & bit)) {
        const next = cell + DIR_DELTA[dir];
        if (robots.includes(next)) break;
        cell = next;
    }
    return cell;
}

// 手順をたどる。途中で動かない手があっても、そのまま数える。{ robots, path: 各手の { robot, dir, from, to } }
export function applyMoves(walls, robots, moves) {
    const now = [...robots];
    const path = [];
    for (const [robot, dir] of moves) {
        const from = now[robot];
        const to = slide(walls, now, robot, dir);
        now[robot] = to;
        path.push({ robot, dir, from, to });
    }
    return { robots: now, path };
}

// 目標に着いているか（渦はどのロボットでもよい。銀も含む）
export function reached(targetId, targetCell, robots) {
    if (targetId === VORTEX) return robots.includes(targetCell);
    return robots[Math.floor(targetId / 4)] === targetCell;
}

// 手の形が正しいか（[ロボットの番号, 向き] の配列）
export function isMoveList(moves, robotCount, maxLength) {
    return Array.isArray(moves) && moves.length <= maxLength && moves.every(move => Array.isArray(move) && move.length === 2
        && Number.isInteger(move[0]) && move[0] >= 0 && move[0] < robotCount
        && Number.isInteger(move[1]) && move[1] >= 0 && move[1] < 4);
}
