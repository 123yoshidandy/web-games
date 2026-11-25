import Game from '../public/js/game.js';
import { cityId, CITIES } from '../public/js/cities.js';

export const players = (n = 2, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 2, { seed = 1, level = 'standard', roles } = {}) => new Game(players(n), { seed, level, roles });
export const C = (name) => cityId(name);

// 盤面を空にする（病原体・感染カードの捨て札・強化のまとまり）
export function clearBoard(game) {
    game.cubes = CITIES.map(() => [0, 0, 0, 0]);
    game.supply = [24, 24, 24, 24];
    game.known = [];
    game.infectionDiscard = [];
}

// 病原体を置く：{ 'Paris': 3, 'Tokyo': [0, 0, 0, 2] }（数だけなら都市の色）
export function setCubes(game, spec) {
    Object.entries(spec).forEach(([name, value]) => {
        const id = C(name);
        const row = Array.isArray(value) ? value : [0, 1, 2, 3].map(c => (c === CITIES[id].color ? value : 0));
        row.forEach((n, color) => {
            game.supply[color] += game.cubes[id][color] - n;
            game.cubes[id][color] = n;
        });
    });
}

// 手札を決める（都市名かカードの番号）
export function setHand(game, seat, cards) {
    game.players[seat].hand = cards.map(c => (typeof c === 'string' ? C(c) : c));
}

export const moveTo = (game, seat, name) => { game.players[seat].city = C(name); };

export const snapshot = (game) => JSON.stringify({
    players: game.players, cubes: game.cubes, supply: game.supply, stations: game.stations, cures: game.cures,
    outbreaks: game.outbreaks, rateIndex: game.rateIndex, quiet: game.quiet, playerDeck: game.playerDeck, playerDiscard: game.playerDiscard,
    infectionDeck: game.infectionDeck, infectionDiscard: game.infectionDiscard, infectionRemoved: game.infectionRemoved, known: game.known,
    current: game.current, stage: game.stage, phase: game.phase, actionsLeft: game.actionsLeft, opsMoveUsed: game.opsMoveUsed,
    result: game.result, commands: game.commands, logs: game.logs, removedCards: game.removedCards, forecastBy: game.forecastBy
});

// 手番の人に、アクションを使い切らせる（pass）
export const pass = (game) => game.applyCommand(game.current, { type: 'pass' });
