import Game from '../public/js/game.js';
import { SIZE, index } from '../public/js/tiles.js';

export const players = (n = 1, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 1, seed = 1) => new Game(players(n), { seed });

// 盤を短い記法で作る：[[x, y, kind, o], ...]
export function board(list) {
    const cells = Array(SIZE * SIZE).fill(null);
    list.forEach(([x, y, kind, o = 0]) => { cells[index(x, y)] = { kind, o, round: 1 }; });
    return cells;
}

// ダイスの目を決める
export function setDice(game, dice) {
    game.dice = [...dice];
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, round: game.round, dice: game.dice, phase: game.phase, results: game.results,
    winners: game.winners, logs: game.logs, events: game.events, commands: game.commands
});
