import Game, { CARDS } from '../public/js/game.js';

export const players = (cpu = false) => [{ name: 'A', isCPU: cpu }, { name: 'B', isCPU: cpu }];
export const makeGame = (seed = 1, options = {}) => new Game(players(), { seed, ...options });

// 色と数（0 は握手。同じ色の握手は 0 を並べた順に別のカード）からカードの番号を引く
export function card(color, value, nth = 0) {
    return CARDS.filter(c => c.color === color && c.value === value)[nth].id;
}

// 場面を作る。席 current の「出す」段階にし、使ったカードは山札から除く
export function setup(game, { hands, expeditions, discards, deck, current = 0 } = {}) {
    const used = new Set();
    if (hands) hands.forEach((hand, seat) => { game.players[seat].hand = [...hand]; hand.forEach(id => used.add(id)); });
    if (expeditions) expeditions.forEach((exp, seat) => Object.entries(exp).forEach(([color, ids]) => { game.players[seat].expeditions[color] = [...ids]; ids.forEach(id => used.add(id)); }));
    if (discards) Object.entries(discards).forEach(([color, ids]) => { game.discards[color] = [...ids]; ids.forEach(id => used.add(id)); });
    game.deck = deck ? [...deck] : game.deck.filter(id => !used.has(id));
    game.current = current;
    game.phase = 'play';
    game.justDiscarded = null;
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, deck: game.deck, discards: game.discards, round: game.round, current: game.current, phase: game.phase,
    justDiscarded: game.justDiscarded, history: game.history, logs: game.logs, events: game.events, commands: game.commands
});
