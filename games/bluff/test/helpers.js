import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

export const newGame = (n = 3, seed = 1, options = {}) => new Game(players(n), { seed, ...options });

// ダイスを決める（目の配列。6 は星）
export function setDice(game, seat, values) {
    game.players[seat].dice = values.map(value => ({ value, shown: false }));
}

export function act(game, seat, command) {
    if (!game.applyCommand(seat, command)) throw new Error(`${JSON.stringify(command)}: ${game.lastError}`);
}

// 全部のダイスの数
export const totalDice = (game) => game.players.reduce((s, p) => s + p.dice.length, 0);

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
