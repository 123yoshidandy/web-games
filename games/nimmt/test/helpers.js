import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 3, seed = 1) => new Game(players(n), { seed });

// 手札と列を決める。hands は席ごとのカードの配列、rows は4列
export function setup(game, { hands, rows, scores }) {
    if (hands) hands.forEach((hand, seat) => { game.players[seat].hand = [...hand].sort((a, b) => a - b); });
    if (rows) game.rows = rows.map(row => [...row]);
    if (scores) scores.forEach((score, seat) => { game.players[seat].score = score; });
}

// 全員に1枚ずつ出させる（cards は席の順）
export function playAll(game, cards) {
    cards.forEach((card, seat) => {
        if (!game.applyCommand(seat, { type: 'play', card })) throw new Error(`${seat}: ${game.lastError}`);
    });
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, rows: game.rows, round: game.round, turn: game.turn, phase: game.phase,
    selected: game.selected, pending: game.pending, logs: game.logs, events: game.events, commands: game.commands
});
