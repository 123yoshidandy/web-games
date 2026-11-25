import Game from '../public/js/game.js';
import { cellAt } from '../public/js/board.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

// 席0から始まるゲーム
export const newGame = (n = 2, seed = 1, mode) => new Game(players(n), { seed, startPlayer: 0, mode });

// 軸座標でマスの番号を引く
export const at = (q, r) => {
    const c = cellAt(q, r);
    if (c < 0) throw new Error(`盤の外です: ${q},${r}`);
    return c;
};

// 手札を決める（袋のタイルと入れ替えて、全体の枚数を保つ）
export function setHand(game, seat, tiles) {
    const p = game.players[seat];
    game.bag.push(...p.hand);
    p.hand = [];
    tiles.forEach(([a, b]) => {
        const i = game.bag.findIndex(t => (t[0] === a && t[1] === b) || (t[0] === b && t[1] === a));
        if (i < 0) throw new Error(`${a}-${b} が袋にありません`);
        p.hand.push(game.bag.splice(i, 1)[0]);
    });
}

// 盤に色を直接置く（タイルとしても記録する。得点は動かさない）
export function paint(game, cells, colors, seat = 0) {
    cells.forEach((c, i) => { game.board[c] = colors[i]; });
    if (cells.length === 2) game.tiles.push({ cells: [...cells], colors: [...colors], seat });
}

// 最初の手番を済ませたことにする
export const skipFirst = (game) => game.players.forEach(p => { p.placed = Math.max(p.placed, 1); });

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}

// 全部のタイルの数（袋・手札・盤）
export const totalTiles = (game) => game.bag.length + game.tiles.length + game.players.reduce((s, p) => s + p.hand.length, 0);
