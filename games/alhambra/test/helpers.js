import Game, { SCORE_1, SCORE_2 } from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 3, seed = 1) => new Game(players(n), { seed });

// 通貨と値のカードの id（同じ値のカードが何枚もあるので、使っていないものを選ぶ）
export function cardOf(game, currency, value, used = []) {
    const card = game.cards.find(c => c.currency === currency && c.value === value && !used.includes(c.id));
    return card.id;
}

// 手番の人の手札を差し替える。spec: [['yellow', 3], ['blue', 5]]
export function setHand(game, seat, spec) {
    const used = [];
    game.players[seat].hand = spec.map(([currency, value]) => {
        const id = cardOf(game, currency, value, used);
        used.push(id);
        return id;
    });
    return game.players[seat].hand;
}

// お金の市場を差し替える
export function setMoneyMarket(game, spec) {
    const used = game.players.flatMap(p => p.hand);
    game.moneyMarket = spec.map(([currency, value]) => {
        const id = cardOf(game, currency, value, used);
        used.push(id);
        return id;
    });
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, dirk: game.dirk, bag: game.bag, market: game.market, moneyMarket: game.moneyMarket, deck: game.deck,
    discard: game.discard, current: game.current, phase: game.phase, actionsTaken: game.actionsTaken, bought: game.bought,
    finalQueue: game.finalQueue, roundsScored: game.roundsScored, logs: game.logs, events: game.events, commands: game.commands
});

export { SCORE_1, SCORE_2 };
