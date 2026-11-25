import Game from '../public/js/game.js';

export const players = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));

// 都市を短く作る：city('giza', 'A', ['lumberYard', ...], { stages, coins, tokens, defeats })
export function city(wonder, side = 'A', keys = [], extra = {}) {
    return { wonder, side, built: keys.map(k => (k.includes('#') ? k : `${k}#3`)), stages: 0, coins: 3, tokens: [], defeats: 0, freeBuildAge: null, ...extra };
}

/**
 * 状態を直接作ったゲーム（3 人以上）。cities：都市の配列、hands：席ごとの手札（カードの key か id）
 */
export function setupGame({ cities, hands, age = 1, turn = 1 }) {
    const game = new Game(players(cities.length), { seed: 1 });
    game.cities = cities.map(c => ({ ...c }));
    game.age = age;
    game.turn = turn;
    game.hands = hands.map(h => h.map(k => (k.includes('#') ? k : `${k}#3`)));
    game.discardPile = [];
    game.events = [];
    game.beginChoose(game.players.map(p => p.id));
    return game;
}

export function snapshot(game) {
    return JSON.stringify({
        cities: game.cities, hands: game.hands, discard: game.discardPile, age: game.age, turn: game.turn,
        phase: game.phase, waiting: game.waiting, pending: game.pending, commands: game.commands.length
    });
}

export const id = key => `${key}#3`;
