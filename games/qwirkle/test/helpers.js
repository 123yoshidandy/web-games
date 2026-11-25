import Game from '../public/js/game.js';
import { keyOf } from '../public/js/board.js';

export const players = (n = 2, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 2, seed = 1) => new Game(players(n), { seed });

// タイル：色（0〜5）・形（0〜5）・写し（0〜2）から番号を作る
export const T = (color, shape, copy = 0) => copy * 36 + color * 6 + shape;

// 盤を作る：[[x, y, tile], ...]
export function setBoard(game, cells) {
    game.board = new Map(cells.map(([x, y, t]) => [keyOf(x, y), t]));
    game.placed = cells.map(([x, y, tile]) => ({ x, y, tile, seat: 0, turn: 0 }));
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, board: [...game.board], placed: game.placed, bag: game.bag, current: game.current, turnNo: game.turnNo,
    phase: game.phase, passes: game.passes, winners: game.winners, commands: game.commands, logs: game.logs
});
