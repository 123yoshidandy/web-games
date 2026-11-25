import Game, { sortCards } from '../public/js/game.js';

export const players = (cpu = false) => Array.from({ length: 4 }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (seed = 1) => new Game(players(), { seed });

// 出す段階にして、手札・手番・トリックの回数などを決める
export function setup(game, { hands, turn, trickNo = 2, broken = false, scores }) {
    game.phase = 'play';
    game.passes = [[], [], [], []];
    if (hands) hands.forEach((hand, seat) => { game.players[seat].hand = sortCards(hand); });
    game.turn = turn ?? game.turn ?? 0;
    game.trickNo = trickNo;
    game.broken = broken;
    game.trick = [];
    if (scores) scores.forEach((s, seat) => { game.players[seat].score = s; });
}

// 手番の人に順に出させる
export function playCards(game, cards) {
    cards.forEach(card => {
        const seat = game.turn;
        if (!game.applyCommand(seat, { type: 'play', card })) throw new Error(`${seat} ${card}: ${game.lastError}`);
    });
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, round: game.round, phase: game.phase, passes: game.passes, trick: game.trick, trickNo: game.trickNo,
    turn: game.turn, broken: game.broken, played: game.played, winners: game.winners, logs: game.logs, events: game.events, commands: game.commands
});
