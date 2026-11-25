import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 3, seed = 1) => new Game(players(n), { seed });

// 並べた物件・手番・コインなどを決める
export function setup(game, { market, turn, coins, hands, propDeck, checkDeck }) {
    if (market) {
        game.market = [...market].sort((a, b) => a - b).map(card => ({ card, takenBy: null }));
        game.high = 0;
        game.players.forEach(p => { p.bid = 0; p.passed = false; });
    }
    if (turn !== undefined) game.turn = turn;
    if (coins) coins.forEach((c, seat) => { game.players[seat].coins = c; });
    if (hands) hands.forEach((hand, seat) => { game.players[seat].hand = [...hand].sort((a, b) => a - b); game.players[seat].bought = [...hand]; });
    if (propDeck) game.propDeck = [...propDeck];
    if (checkDeck) game.checkDeck = [...checkDeck];
}

// 手番の人の操作を順に送る（数は入札額、'p' は降りる）
export function auction(game, moves) {
    moves.forEach(move => {
        const seat = game.turn;
        const command = move === 'p' ? { type: 'pass' } : { type: 'bid', amount: move };
        if (!game.applyCommand(seat, command)) throw new Error(`${seat}: ${game.lastError}`);
    });
}

// 全員に1枚ずつ出させる（cards は席の順）
export function sellAll(game, cards) {
    cards.forEach((card, seat) => {
        if (!game.applyCommand(seat, { type: 'sell', card })) throw new Error(`${seat}: ${game.lastError}`);
    });
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, propDeck: game.propDeck, checkDeck: game.checkDeck, market: game.market, checkMarket: game.checkMarket,
    turn: game.turn, high: game.high, phase: game.phase, round: game.round, selected: game.selected,
    winners: game.winners, logs: game.logs, events: game.events, commands: game.commands
});
