import Game from '../public/js/game.js';
import { cellOf } from '../public/js/board.js';

export const players = (n = 2, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 2, { seed = 1, mode = 'family', level = 'recruit' } = {}) => new Game(players(n), { seed, mode, level });
export const C = (r, c) => cellOf(r, c);

// 準備（専門職・始める場所）を済ませる。roles を省くと好みの順
export function setup(game, cells = null, roles = null) {
    if (game.phase === 'role') {
        game.players.forEach((p, i) => {
            const role = roles?.[i] ?? game.unusedRoles()[0];
            if (!game.applyCommand(i, { type: 'role', role })) throw new Error(game.lastError);
        });
    }
    game.players.forEach((p, i) => {
        const cell = cells?.[i] ?? C(3, 0);
        if (!game.applyCommand(i, { type: 'place', cell })) throw new Error(game.lastError);
    });
    return game;
}

// 盤面の火と印を空にする
export function clearBoard(game) {
    game.fire = game.fire.map(() => 0);
    game.pois = [];
    game.hazmats = [];
    game.hotspots = [];
}

export const snapshot = (game) => JSON.stringify({
    fire: game.fire, edges: game.edges, damage: game.damage, rescued: game.rescued, lost: game.lost,
    pois: game.pois, hazmats: game.hazmats, hotspots: game.hotspots, vehicles: game.vehicles, players: game.players,
    current: game.current, phase: game.phase, result: game.result, commands: game.commands, logs: game.logs, poiPool: game.poiPool,
    turnNo: game.turnNo, lastRoll: game.lastRoll
});
