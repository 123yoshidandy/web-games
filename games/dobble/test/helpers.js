import Game from '../public/js/game.js';
import { CARDS } from '../public/js/deck.js';

export const solo = (seed = 1) => new Game([{ name: 'あなた' }], { seed, mode: 'solo' });
export const versus = (seed = 1, level = 'normal', cpus = 2) => new Game(
    [{ name: 'あなた' }, ...Array.from({ length: cpus }, (_, i) => ({ name: `C${i + 1}`, isCPU: true }))],
    { seed, mode: 'cpu', level }
);

// 席の答えで取る操作
export const claimOf = (game, seat) => ({ type: 'claim', symbol: game.answerFor(seat), center: game.center });

// 真ん中のカードにあって、席のカードにないマーク（まちがいのタップ）
export const wrongOf = (game, seat) => ({
    type: 'claim',
    symbol: CARDS[game.center].find(symbol => !CARDS[game.players[seat].top].includes(symbol)),
    center: game.center
});

// 1人で、答えを順に取って終わりまで進める（時刻は1手ごとに step ミリ秒）
export function playOut(game, seat = 0, step = 1000) {
    let t = game.lastT;
    let guard = 0;
    while (!game.isOver && guard++ < 200) {
        t += step;
        if (!game.applyCommand(seat, { ...claimOf(game, seat), t })) throw new Error(game.lastError);
    }
    return game;
}

export const snapshot = (game) => JSON.stringify({
    pile: game.pile, players: game.players, phase: game.phase, commands: game.commands,
    version: game.version, changedAt: game.changedAt, lastT: game.lastT, hintMarks: game.hintMarks, logs: game.logs
});
