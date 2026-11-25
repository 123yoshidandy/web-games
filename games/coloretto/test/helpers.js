import Game from '../public/js/game.js';

export const players = (n = 4, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 4, seed = 1, options = {}) => new Game(players(n), { seed, ...options });

// 場面を作る：席 current の手番にし、列・山札を決める
export function setup(game, { rows, deck, current = 0, counts } = {}) {
    if (rows) game.rows = rows.map(r => (Array.isArray(r) ? { cards: [...r], taken: false } : { cards: [...r.cards], taken: !!r.taken }));
    if (deck) game.deck = [...deck];
    if (counts) counts.forEach((c, seat) => Object.assign(game.players[seat].counts, c));
    game.current = current;
    game.phase = 'play';
    game.pending = null;
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, rows: game.rows, deck: game.deck, round: game.round, current: game.current, phase: game.phase,
    pending: game.pending, lastRound: game.lastRound, results: game.results, logs: game.logs, events: game.events, commands: game.commands
});
