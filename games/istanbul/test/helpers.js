import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 3, seed = 1, layout = 'short') => new Game(players(n), { seed, layout });

// seat の番の、移動の前にする。ほかの項目（lira・goods・cards・tiles・ext・merchant・stack・assistants・family）も書き換える
export function turnOf(game, seat, fields = {}) {
    const p = game.players[seat];
    Object.entries(fields).forEach(([key, value]) => {
        p[key] = key === 'goods' ? { red: 0, green: 0, yellow: 0, blue: 0, ...value } : structuredClone(value);
    });
    game.turn = seat;
    game.step = { stage: 'move', yellowUsed: false, acted: false };
    return p;
}

// 総督・密輸人・中立の商人を、盤の外（出会わない所）へ動かす
export function clearSpecial(game) {
    game.governor = 0;
    game.smuggler = 0;
    game.neutrals = game.neutrals.map(() => 0);
}

export function act(game, seat, command) {
    if (!game.applyCommand(seat, command)) throw new Error(`${seat} ${JSON.stringify(command)}: ${game.lastError}`);
}

export const snapshot = (game) => JSON.stringify({
    layout: game.layout, players: game.players, deck: game.deck, discard: game.discard, demand: game.demand, post: game.post,
    gem: game.gemPrice, sultan: game.sultanCount, tiles: game.mosqueTiles, mrub: game.mosqueRubies, gov: game.governor,
    smu: game.smuggler, neu: game.neutrals, turn: game.turn, step: game.step, phase: game.phase, end: game.endTriggered,
    winners: game.winners, logs: game.logs, events: game.events, commands: game.commands, rng: game.rngState
});
