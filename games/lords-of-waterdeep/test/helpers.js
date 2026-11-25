import Game from '../public/js/game.js';
import { candidates } from '../public/js/cpu-player.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

// 最初の番を席0にそろえたゲーム（まだだれも置いていない）
export function newGame(n = 2, seed = 1) {
    const game = new Game(players(n), { seed });
    game.firstPlayer = 0;
    game.roundFirst = 0;
    game.current = 0;
    return game;
}

export function setRes(game, seat, res) {
    game.players[seat].res = { f: 0, r: 0, w: 0, c: 0, g: 0, ...res };
}

// 操作を順に行う。[seat, command] の並び。通らなければ理由つきで止める
export function run(game, steps) {
    steps.forEach(([seat, command], i) => {
        if (!game.applyCommand(seat, command)) throw new Error(`${i}: ${JSON.stringify(command)} ${game.lastError}`);
    });
}

export const place = (space) => ({ type: 'place', space });
export const skip = { type: 'complete', quest: null };

// 比べるための状態の写し（断った理由は除く）
export function snapshot(game) {
    const { lastError, ...rest } = game;
    return JSON.stringify(rest);
}

// 打てる手から、シードで決めた手を選んで最後まで進める（ランダムな試合）
export function playRandom(game, seed, maxSteps = 4000) {
    let state = seed >>> 0;
    const rand = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
    for (let i = 0; i < maxSteps && !game.isOver(); i++) {
        const [seat] = game.actors();
        const list = candidates(game, seat);
        if (!list.length) throw new Error('打てる手がない');
        if (!game.applyCommand(seat, list[Math.floor(rand() * list.length)])) throw new Error(game.lastError);
    }
    return game;
}
