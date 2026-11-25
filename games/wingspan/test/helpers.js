import Game from '../public/js/game.js';
import { FOODS } from '../public/js/birds.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 2, seed = 1) => new Game(players(n), { seed });

// 準備を済ませる（全員、配られた鳥を残さず、餌を5つ残す）
export function skipSetup(game) {
    game.players.forEach(p => {
        if (!game.applyCommand(p.id, { type: 'setup', birds: [], food: [...FOODS], bonus: p.offer.bonus[0] })) throw new Error(game.lastError);
    });
    return game;
}

// 準備を済ませたゲーム
export const started = (n = 2, seed = 1) => skipSetup(makeGame(n, seed));

export const food = (obj = {}) => ({ ...Object.fromEntries(FOODS.map(f => [f, 0])), ...obj });

// 場に鳥を置く（h：生息地、list：[鳥の id か { bird, eggs, tucked, cache }]）
export function place(game, seat, h, list) {
    game.players[seat].board[h] = list.map(item => (typeof item === 'string'
        ? { bird: item, eggs: 0, cache: {}, tucked: 0 }
        : { eggs: 0, cache: {}, tucked: 0, ...item }));
}

export function act(game, seat, command) {
    if (!game.applyCommand(seat, command)) throw new Error(`${JSON.stringify(command)}: ${game.lastError}`);
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, deck: game.deck, discard: game.discard, tray: game.tray, feeder: game.feeder, bonusDeck: game.bonusDeck,
    round: game.round, turn: game.turn, phase: game.phase, decision: game.decision, tasks: game.tasks, rng: game.rng,
    winners: game.winners, logs: game.logs, events: game.events, commands: game.commands, goalResults: game.goalResults
});
