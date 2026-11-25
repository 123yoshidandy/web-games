import Game from '../public/js/game.js';
import { TILES } from '../public/js/data.js';
import { CELL_COUNT, cellFromAxial, axialOf } from '../public/js/board.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

// 席0から始まるゲーム（はじめての準備なら、すぐ置ける）
export const newGame = (n = 2, seed = 1, setup = 'beginner') => new Game(players(n), { seed, startPlayer: 0, setup });

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}

// 色と模様からタイルの id（写しの番号 k）
export const tileOf = (color, pattern, k = 0) => TILES.findIndex((t, i) => t.color === color && t.pattern === pattern && i % 3 === k);

// 空のキルトの上に、{ cell: [色, 模様] } を置いたもの
export function quiltOf(placements) {
    const quilt = new Array(CELL_COUNT).fill(null);
    const used = new Map();
    Object.entries(placements).forEach(([cell, [color, pattern]]) => {
        const key = `${color}/${pattern}`;
        const k = used.get(key) ?? 0;
        used.set(key, k + 1);
        quilt[Number(cell)] = tileOf(color, pattern, k % 3);
    });
    return quilt;
}

// 軸座標でずらしたマス
export const shift = (cell, dq, dr) => {
    const [q, r] = axialOf(cell);
    return cellFromAxial(q + dq, r + dr);
};

// 全部のタイルの数（袋・市場・手札・キルト）
export const totalTiles = (game) => game.bag.length + game.market.filter(t => t != null).length + game.discarded.length
    + game.players.reduce((s, p) => s + p.hand.length + p.quilt.filter(t => t != null).length, 0);
