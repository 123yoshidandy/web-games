import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

// 最初の番を席0にそろえたゲーム（まだだれも置いていない）
export function newGame(n = 2, seed = 1) {
    const game = new Game(players(n), { seed });
    game.startPlayer = 0;
    game.current = 0;
    game.players.forEach((p, i) => { p.food = n === 1 ? 0 : (i === 0 ? 2 : 3); });
    return game;
}

// まだ出ていない行動スペースを、今のラウンドに出す（テスト用）
export function withSpace(game, id, goods = {}) {
    if (!game.spaces.includes(id)) game.spaces.push(id);
    game.goods[id] = { ...goods };
    return game;
}

export function setRes(game, seat, res) {
    Object.assign(game.players[seat].res, res);
}

export function run(game, steps) {
    steps.forEach(([seat, command], i) => {
        if (!game.applyCommand(seat, command)) throw new Error(`${i}: ${JSON.stringify(command)} ${game.lastError}`);
    });
}

export const act = (space, params = {}) => ({ type: 'act', space, ...params });

// 残りの人を、空いているためる場所や日雇いに置いて、ラウンドを終える
export function finishRound(game) {
    const round = game.round;
    let guard = 0;
    while (game.round === round && game.phase === 'work' && guard++ < 50) {
        const seat = game.current;
        const free = game.legalSpaces(seat).find(id => ['fishing', 'storehouse', 'clayPit', 'reedBank', 'forest', 'grain', 'start'].includes(id))
            ?? game.legalSpaces(seat).find(id => id === 'laborer');
        const command = act(free, free === 'laborer' ? { res: 'wood' } : {});
        if (!game.applyCommand(seat, command)) throw new Error(`${free}: ${game.lastError}`);
    }
}

export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
