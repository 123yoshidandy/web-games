import Game, { sortHand } from '../public/js/game.js';

export const players = (cpu = false) => [{ name: 'A', isCPU: cpu }, { name: 'B', isCPU: cpu }];
export const makeGame = (seed = 1) => new Game(players(), { seed });

// 場面を作る。席0の手番にする
export function setup(game, { hands, herds, market, deck, current = 0 } = {}) {
    if (hands) hands.forEach((hand, seat) => { game.players[seat].hand = sortHand([...hand]); });
    if (herds) herds.forEach((herd, seat) => { game.players[seat].herd = herd; });
    if (market) game.market = [...market];
    if (deck) game.deck = [...deck];
    game.current = current;
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, market: game.market, deck: game.deck, goodsTokens: game.goodsTokens, bonusTokens: game.bonusTokens,
    round: game.round, current: game.current, phase: game.phase, history: game.history, logs: game.logs, events: game.events, commands: game.commands
});
