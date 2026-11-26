import Game from '../public/js/game.js';
import { HEXES, LAND } from '../public/js/map.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));

// 勢力を決めてゲームを作る
export const makeGame = (factions, seed = 1) => new Game(players(factions.length), { seed, factions });

export const hexOf = (label) => HEXES.find(h => h.label === label).id;

// 準備（最初の住居とボーナスカード）を、置ける最初の土地・残っている最初のカードで済ませる
export function quickSetup(game) {
    for (let guard = 0; guard < 40 && game.state.phase === 'setup'; guard++) {
        const w = game.waiting();
        if (w.kind === 'place') {
            const hex = LAND.find(h => game.checkDwelling(w.seat, h, { free: true, needReach: false }).ok);
            if (!game.applyCommand(w.seat, { type: 'place', hex })) throw new Error(game.lastError);
        } else {
            const id = Object.keys(game.state.bonusPool)[0];
            if (!game.applyCommand(w.seat, { type: 'bonus', id })) throw new Error(game.lastError);
        }
    }
    return game;
}

// 盤面を書き換える：建物を置く（収入の数も合わせる）
export function put(game, seat, label, building = 'D', terrain) {
    const hex = hexOf(label);
    const h = game.state.hexes[hex];
    if (h.building) game.players[h.owner].buildings[h.building]--;
    h.terrain = terrain ?? game.home(seat);
    h.owner = seat;
    h.building = building;
    game.players[seat].buildings[building]++;
    return hex;
}

// 建物をすべて取り除く
export function clearBoard(game) {
    game.state.hexes.forEach(h => {
        if (h.building) game.players[h.owner].buildings[h.building]--;
        h.building = null;
        h.owner = null;
        h.town = 0;
    });
}

// その人の手番にする
export function turnTo(game, seat) {
    game.state.current = seat;
    game.state.queue = [];
    game.state.turnDone = false;
}

export const snapshot = (game) => JSON.stringify({ state: game.state, commands: game.commands });

export function act(game, seat, command) {
    if (!game.applyCommand(seat, command)) throw new Error(`${seat} ${JSON.stringify(command)}: ${game.lastError}`);
}
