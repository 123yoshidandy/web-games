import Game, { findSets, isSet } from '../public/js/game.js';

export const solo = (seed = 1) => new Game([{ name: 'あなた' }], { seed, mode: 'solo' });
export const versus = (seed = 1, level = 'normal', cpus = 2) => new Game(
    [{ name: 'あなた' }, ...Array.from({ length: cpus }, (_, i) => ({ name: `C${i + 1}`, isCPU: true }))],
    { seed, mode: 'cpu', level }
);

// 場の中の、セットでない3枚
export function nonSet(board) {
    for (let i = 0; i < board.length; i++) {
        for (let j = i + 1; j < board.length; j++) {
            for (let k = j + 1; k < board.length; k++) {
                if (!isSet(board[i], board[j], board[k])) return [board[i], board[j], board[k]];
            }
        }
    }
    return null;
}

// 1人で、見つけたセットを順に取って終わりまで進める（時刻は1手ごとに step ミリ秒）
export function playOut(game, seat = 0, step = 1000) {
    let t = game.lastT;
    let guard = 0;
    while (!game.isOver && guard++ < 200) {
        t += step;
        const [cards] = findSets(game.board);
        if (!game.applyCommand(seat, { type: 'claim', cards, t })) throw new Error(game.lastError);
    }
    return game;
}

export const snapshot = (game) => JSON.stringify({
    board: game.board, deck: game.deck, players: game.players, phase: game.phase, commands: game.commands,
    boardVersion: game.boardVersion, changedAt: game.changedAt, lastT: game.lastT, hintCards: game.hintCards, logs: game.logs
});
