import Game from '../public/js/game.js';
import { emptyPark } from '../public/js/park.js';

export const players = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));
export const cpus = n => players(n).map(p => ({ ...p, isCPU: true }));

// 公園を短く作る：park({ forest: 'trex trex', river: 'tri' })
export function park(spec = {}) {
    const p = emptyPark();
    Object.entries(spec).forEach(([zone, list]) => { p[zone] = list.split(' ').filter(Boolean); });
    return p;
}

/**
 * 状態を直接作ったゲーム。parks：席ごとの公園、hands：席ごとの手（種類の並び）、die：ダイスの面、roller：振った人
 */
export function setupGame({ parks, hands, die = 'woods', roller = 0, round = 1, turn = 1 }) {
    const game = new Game(players(parks.length), { seed: 1 });
    game.parks = parks.map(p => structuredClone(p));
    game.hands = hands.map(h => h.split(' ').filter(Boolean));
    game.round = round;
    game.turn = turn;
    game.die = die;
    game.roller = roller;
    game.events = [];
    return game;
}

export function snapshot(game) {
    return JSON.stringify({
        parks: game.parks, hands: game.hands, bag: game.bag, round: game.round, turn: game.turn, die: game.die, roller: game.roller,
        phase: game.phase, waiting: game.waiting, pending: game.pending, commands: game.commands.length
    });
}
