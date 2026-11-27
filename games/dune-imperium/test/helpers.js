import Game from '../public/js/game.js';
import { candidates } from '../public/js/cpu-player.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

// 最初の番を席0にそろえたゲーム（リーダーは指定できる）
export function newGame(n = 3, { seed = 1, leaders = null } = {}) {
    const game = new Game(players(n), { seed, ...(leaders ? { leaders } : {}) });
    game.firstPlayer = 0;
    game.current = 0;
    return game;
}

// 手札を差し替える
export function setHand(game, seat, hand) {
    game.players[seat].hand = [...hand];
}

// 操作を順に行う。[seat, command] の並び。通らなければ理由つきで止める
export function run(game, steps) {
    steps.forEach(([seat, command], i) => {
        if (!game.applyCommand(seat, command)) throw new Error(`${i}: ${JSON.stringify(command)} ${game.lastError}`);
    });
}

export const agent = (card, space) => ({ type: 'agent', card, space });
export const choose = (index) => ({ type: 'choose', index });

// 比べるための状態の写し（断った理由は除く）
export function snapshot(game) {
    const { lastError, ...rest } = game;
    return JSON.stringify(rest);
}

// 打てる手から、シードで決めた手を選んで最後まで進める（ランダムな試合）
export function playRandom(game, seed, maxSteps = 8000) {
    let state = seed >>> 0;
    const rand = () => {
        state = (state * 1664525 + 1013904223) >>> 0;
        return state / 2 ** 32;
    };
    for (let i = 0; i < maxSteps && !game.isOver(); i++) {
        const [seat] = game.actors();
        const list = candidates(game, seat);
        if (!list.length) throw new Error('打てる手がない');
        // 公開を急ぎすぎないように、置く手を選びやすくする
        const command = list[Math.floor(rand() * list.length)];
        if (!game.applyCommand(seat, command)) throw new Error(`${JSON.stringify(command)} ${game.lastError}`);
    }
    return game;
}
