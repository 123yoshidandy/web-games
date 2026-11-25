import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 1, seed = 1) => new Game(players(n), { seed });

// 手番の人が振ったことにして、出目を決める（rollsLeft は残りの回数）
export function setDice(game, dice, rollsLeft = 2) {
    game.dice = [...dice];
    game.rollsLeft = rollsLeft;
}

// 手番の人の得点表を決める（scores に書いた欄だけ上書きする）
export function setScores(game, seat, scores, yahtzeeBonus = 0) {
    Object.assign(game.players[seat].scores, scores);
    game.players[seat].yahtzeeBonus = yahtzeeBonus;
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, dice: game.dice, kept: game.kept, rollsLeft: game.rollsLeft, turn: game.turn, round: game.round,
    phase: game.phase, winners: game.winners, logs: game.logs, events: game.events, commands: game.commands
});

const NO_KEEP = [false, false, false, false, false];

// 振ってから、記入できる最初の欄に書く（手番を1つ進める）
export function playTurn(game, category = null) {
    const seat = game.turn;
    if (!game.applyCommand(seat, { type: 'roll', keep: NO_KEEP })) throw new Error(game.lastError);
    const target = category && game.legal().includes(category) ? category : game.legal()[0];
    if (!game.applyCommand(seat, { type: 'score', category: target })) throw new Error(game.lastError);
}
