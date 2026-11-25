import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

// 最初の番を席0にそろえたゲーム（まだだれも置いていない）
export function newGame(n = 2, seed = 1) {
    const game = new Game(players(n), { seed });
    game.startPlayer = 0;
    game.current = 0;
    return game;
}

// 次に振るサイコロの目を決める（使い切ったら、もとの乱数に戻る）
export function fixDice(game, values) {
    const queue = [...values];
    const original = game.random;
    game.random = () => (queue.length ? (queue.shift() - 1) / 6 + 0.01 : original());
}

export function setRes(game, seat, res) {
    Object.assign(game.players[seat].res, { wood: 0, clay: 0, stone: 0, gold: 0 }, res);
}

// 操作を順に行う。[seat, command] の並び。通らなければ理由つきで止める
export function run(game, steps) {
    steps.forEach(([seat, command], i) => {
        if (!game.applyCommand(seat, command)) throw new Error(`${i}: ${JSON.stringify(command)} ${game.lastError}`);
    });
}

export const place = (place, count = 1) => ({ type: 'place', place, count });
export const resolve = (place) => ({ type: 'resolve', place });

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
