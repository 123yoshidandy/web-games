/**
 * 得点カードの採点と、季節の終わりの異形の減点（盤の配列だけを見る純粋な関数）
 * 盤は長さ 121 の配列。値は null（空き）か 'forest'・'village'・'farm'・'water'・'monster'・'mountain'
 * 廃墟は地図に印刷されたマスで、描いたあとも廃墟のマスのまま（RUIN_SET）
 */

import { SIZE, RUINS, MOUNTAINS } from './cards.js';

export const CELLS = SIZE * SIZE;
export const RUIN_SET = new Set(RUINS.map(([r, c]) => r * SIZE + c));
export const MOUNTAIN_CELLS = MOUNTAINS.map(([r, c]) => r * SIZE + c);

export const rowOf = (cell) => Math.floor(cell / SIZE);
export const colOf = (cell) => cell % SIZE;
export const isEdge = (cell) => rowOf(cell) === 0 || colOf(cell) === 0 || rowOf(cell) === SIZE - 1 || colOf(cell) === SIZE - 1;

// 上下左右のマス（地図の中だけ）
const NEIGHBORS = Array.from({ length: CELLS }, (_, cell) => {
    const r = rowOf(cell), c = colOf(cell);
    return [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]]
        .filter(([rr, cc]) => rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE)
        .map(([rr, cc]) => rr * SIZE + cc);
});
export const neighbors = (cell) => NEIGHBORS[cell];

const filled = (board, cell) => board[cell] !== null;
const adjacentTo = (board, cell, terrain) => NEIGHBORS[cell].some(n => board[n] === terrain);
// 上下左右がすべて、埋まったマスか地図の端
const enclosed = (board, cell) => NEIGHBORS[cell].every(n => filled(board, n));
const cellsOf = (board, terrain) => board.flatMap((t, cell) => (t === terrain ? [cell] : []));

// 同じ地形の、上下左右でつながったかたまり
export function clusters(board, terrain) {
    const seen = new Uint8Array(CELLS);
    const result = [];
    for (let start = 0; start < CELLS; start++) {
        if (seen[start] || board[start] !== terrain) continue;
        const group = [];
        const stack = [start];
        seen[start] = 1;
        while (stack.length) {
            const cell = stack.pop();
            group.push(cell);
            for (const n of NEIGHBORS[cell]) {
                if (!seen[n] && board[n] === terrain) {
                    seen[n] = 1;
                    stack.push(n);
                }
            }
        }
        result.push(group);
    }
    return result;
}

const SCORERS = {
    'sentinel-wood': (b) => cellsOf(b, 'forest').filter(isEdge).length,
    'greenbough': (b) => {
        const forests = cellsOf(b, 'forest');
        return new Set(forests.map(rowOf)).size + new Set(forests.map(colOf)).size;
    },
    'treetower': (b) => cellsOf(b, 'forest').filter(cell => enclosed(b, cell)).length,
    'stoneside-forest': (b) => {
        // 2つ以上の山に接する森のかたまりがつなぐ山を、1つにつき1回だけ数える
        const linked = new Set();
        clusters(b, 'forest').forEach(group => {
            const mountains = new Set(group.flatMap(cell => NEIGHBORS[cell].filter(n => b[n] === 'mountain')));
            if (mountains.size >= 2) mountains.forEach(m => linked.add(m));
        });
        return linked.size * 3;
    },
    'wildholds': (b) => clusters(b, 'village').filter(g => g.length >= 6).length * 8,
    'great-city': (b) => Math.max(0, ...clusters(b, 'village')
        .filter(g => !g.some(cell => adjacentTo(b, cell, 'mountain'))).map(g => g.length)),
    'shieldgate': (b) => {
        const sizes = clusters(b, 'village').map(g => g.length).sort((x, y) => y - x);
        return sizes.length >= 2 ? sizes[1] * 2 : 0;
    },
    'greengold-plains': (b) => clusters(b, 'village').filter(g => {
        const kinds = new Set(g.flatMap(cell => NEIGHBORS[cell].map(n => b[n]).filter(t => t && t !== 'village')));
        return kinds.size >= 3;
    }).length * 3,
    'canal-lake': (b) => cellsOf(b, 'water').filter(cell => adjacentTo(b, cell, 'farm')).length
        + cellsOf(b, 'farm').filter(cell => adjacentTo(b, cell, 'water')).length,
    'golden-granary': (b) => cellsOf(b, 'water').filter(cell => NEIGHBORS[cell].some(n => RUIN_SET.has(n))).length
        + cellsOf(b, 'farm').filter(cell => RUIN_SET.has(cell)).length * 3,
    'mages-valley': (b) => cellsOf(b, 'water').filter(cell => adjacentTo(b, cell, 'mountain')).length * 2
        + cellsOf(b, 'farm').filter(cell => adjacentTo(b, cell, 'mountain')).length,
    'shoreside-expanse': (b) => {
        const isolated = (terrain, other) => clusters(b, terrain)
            .filter(g => g.every(cell => !isEdge(cell) && !adjacentTo(b, cell, other))).length;
        return (isolated('farm', 'water') + isolated('water', 'farm')) * 3;
    },
    'borderlands': (b) => {
        let lines = 0;
        for (let i = 0; i < SIZE; i++) {
            let row = true, col = true;
            for (let j = 0; j < SIZE; j++) {
                if (!filled(b, i * SIZE + j)) row = false;
                if (!filled(b, j * SIZE + i)) col = false;
            }
            lines += row + col;
        }
        return lines * 6;
    },
    'broken-road': (b) => {
        // 左の端の (d, 0) から右下へ、下の端の (10, 10 - d) まで続く斜めの列
        let lines = 0;
        for (let d = 0; d < SIZE; d++) {
            let full = true;
            for (let r = d; r < SIZE; r++) if (!filled(b, r * SIZE + (r - d))) full = false;
            if (full) lines++;
        }
        return lines * 3;
    },
    'lost-barony': (b) => {
        // 右下の角を (r, c) とする、埋まったマスの最も大きい正方形の辺の長さ
        const side = new Array(CELLS).fill(0);
        let best = 0;
        for (let cell = 0; cell < CELLS; cell++) {
            if (!filled(b, cell)) continue;
            const r = rowOf(cell), c = colOf(cell);
            side[cell] = r === 0 || c === 0 ? 1
                : 1 + Math.min(side[cell - SIZE], side[cell - 1], side[cell - SIZE - 1]);
            best = Math.max(best, side[cell]);
        }
        return best * 3;
    },
    'cauldrons': (b) => b.reduce((sum, t, cell) => sum + (t === null && enclosed(b, cell) ? 1 : 0), 0)
};

export const scoreEdict = (edictId, board) => SCORERS[edictId](board);

// 異形のマスに接する空きマスの数（1マスは何体に接していても1点）
export const monsterPenalty = (board) => board.reduce((sum, t, cell) => sum + (t === null && adjacentTo(board, cell, 'monster') ? 1 : 0), 0);

// 上下左右がすべて埋まった山の数（コインになる）
export const surroundedMountains = (board) => MOUNTAIN_CELLS.filter(cell => enclosed(board, cell)).length;
