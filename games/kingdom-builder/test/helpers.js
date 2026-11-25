import Game from '../public/js/game.js';
import { buildTargets } from '../public/js/rules.js';

// テストで使う盤面：左上 神託所、右上 農場、左下 港、右下 塔（回さない）
export const FIXED = [{ id: 'oracle', rot: false }, { id: 'farm', rot: false }, { id: 'harbor', rot: false }, { id: 'tower', rot: false }];

export const cellOf = (r, c) => r * 20 + c;

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

// 席0の手番の初めにそろえたゲーム。card で席0の手札を決められる
export function newGame(n = 2, { seed = 1, boards = FIXED, cards = ['fishermen', 'merchants', 'knights'], card } = {}) {
    const game = new Game(players(n), { seed, boards, cards });
    game.active = 0;
    game.start = 0;
    game.built = 0;
    game.mandatoryDone = false;
    if (card) game.players[0].card = card;
    return game;
}

// 自分の家を直接置く（場所タイルは取らない）
export function put(game, seat, cells) {
    cells.forEach(cell => {
        game.owner[cell] = seat;
        game.players[seat].supply--;
    });
}

export function run(game, steps) {
    steps.forEach(([seat, command], i) => {
        if (!game.applyCommand(seat, command)) throw new Error(`${i}: ${JSON.stringify(command)} ${game.lastError}`);
    });
}

// 手番の人が、建てられる最初のマスに3軒建てて番を終える
export function playSimple(game) {
    const seat = game.active;
    while (!game.mandatoryDone) run(game, [[seat, { type: 'build', cell: buildTargets(game, seat)[0] }]]);
    run(game, [[seat, { type: 'end' }]]);
}

export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}

// 盤上と手元の家の数（1人40軒のまま）
export function houseTotals(game) {
    return game.players.map(p => p.supply + game.owner.filter(o => o === p.id).length);
}
