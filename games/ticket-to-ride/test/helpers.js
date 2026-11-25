import Game from '../public/js/game.js';
import { COLORS, LOCO } from '../public/js/map.js';

export const players = (n = 2, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));

// はじめの目的地を全員がすべて残し、手番を始めた状態
export function started(n = 2, seed = 1) {
    const game = new Game(players(n), { seed });
    game.players.forEach(p => game.applyCommand(p.id, { type: 'keep', tickets: [...p.offered] }));
    return game;
}

// 手札を決める：{ red: 3, loco: 1 } など（書かない色は0枚）
export function setHand(player, hand) {
    [...COLORS, LOCO].forEach(c => { player.hand[c] = hand[c] ?? 0; });
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, deck: game.deck, discard: game.discard, faceUp: game.faceUp, ticketDeck: game.ticketDeck,
    claimed: game.claimed, phase: game.phase, current: game.current, drewOne: game.drewOne, lastPlayer: game.lastPlayer,
    results: game.results, winners: game.winners, logs: game.logs, events: game.events, commands: game.commands
});
