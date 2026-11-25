import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 3, seed = 1) => new Game(players(n), { seed });

// 山札・めくったカード・手番・各自のカードとチップを決める。deck は上から順に並べる
export function setup(game, { deck, current, pot, turn, cards, chips }) {
    if (deck) game.deck = [...deck].reverse();
    if (current !== undefined) game.current = current;
    if (pot !== undefined) game.pot = pot;
    if (turn !== undefined) game.turn = turn;
    if (cards) cards.forEach((list, seat) => { game.players[seat].cards = [...list].sort((a, b) => a - b); });
    if (chips) chips.forEach((count, seat) => { game.players[seat].chips = count; });
}

// 手番の人の操作を順に送る（'p' はいらない、't' は取る）
export function act(game, moves) {
    [...moves].forEach(move => {
        const seat = game.turn;
        const type = move === 'p' ? 'pass' : 'take';
        if (!game.applyCommand(seat, { type })) throw new Error(`${seat}: ${game.lastError}`);
    });
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, deck: game.deck, removed: game.removed, current: game.current, pot: game.pot,
    turn: game.turn, phase: game.phase, winners: game.winners, logs: game.logs, events: game.events, commands: game.commands
});
