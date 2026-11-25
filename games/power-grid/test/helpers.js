import Game from '../public/js/game.js';

export const ALL = ['green', 'brown', 'red', 'yellow', 'blue', 'purple'];

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

export function newGame(n = 3, { seed = 1, map = 'germany', regions = ALL } = {}) {
    return new Game(players(n), { seed, map, regions });
}

export function run(game, steps) {
    steps.forEach(([seat, command], i) => {
        if (!game.applyCommand(seat, command)) throw new Error(`${i}: ${JSON.stringify(command)} ${game.lastError}`);
    });
}

// 最初の巡の競りを、手番の順に「市場のいちばん安い発電所を番号どおりの値で買う」で終える
export function buyCheapest(game) {
    while (game.phase === 'auction') {
        const a = game.auction;
        if (a.discard !== null) run(game, [[a.discard, { type: 'discard', plant: game.players[a.discard].plants[0] }]]);
        else if (a.current) run(game, [[a.current.turn, { type: 'pass' }]]);
        else {
            const plant = game.market[0];
            run(game, [[a.chooser, { type: 'choose', plant, bid: plant }]]);
        }
    }
}

export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
