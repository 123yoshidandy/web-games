import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 3, seed = 1) => new Game(players(n), { seed });

let nextId = 1000;
export const locCard = (loc) => ({ id: `t${nextId++}`, kind: 'loc', loc });
export const indCard = (...industries) => ({ id: `t${nextId++}`, kind: 'ind', industries });

// 手番の人を seat にし、手札を差し替える。返り値は手札のカード
export function setTurn(game, seat, hand, { actionsLeft = 2 } = {}) {
    const s = game.state;
    s.turnIdx = s.order.indexOf(seat);
    s.actionsLeft = actionsLeft;
    s.players[seat].hand = hand;
    return hand;
}

// 盤面にタイルを置く（{ 'birmingham:0': { owner, industry, level, cubes, flipped } }）
export function place(game, tiles) {
    for (const [slot, tile] of Object.entries(tiles)) {
        game.state.board[slot] = { flipped: false, cubes: 0, ...tile };
    }
}

export function lay(game, links) {
    for (const [id, owner] of Object.entries(links)) game.state.links[id] = owner;
}

export function apply(game, seat, command) {
    if (!game.applyCommand(seat, command)) throw new Error(`${seat}: ${game.lastError}`);
}

export const snapshot = (game) => JSON.stringify({ state: game.state, logs: game.logs, commands: game.commands });
