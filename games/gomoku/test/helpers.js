import Game from '../public/js/game.js';
import { EMPTY, BLACK, WHITE } from '../public/js/rules.js';

export const players = (cpu = [false, true], level = 'easy') => cpu.map((c, i) => ({ name: `P${i}`, isCPU: c, cpuLevel: level }));

// 席0が黒の対局
export function newGame(cpu = [false, false], options = {}) {
    return new Game(players(cpu), { size: 15, black: 0, ...options });
}

// 盤を行の文字列で作る。X 黒・O 白・. 空き（1行目が上の段）。行の数が盤の大きさ
export function boardOf(rows) {
    const code = { '.': EMPTY, X: BLACK, O: WHITE };
    return rows.join('').replace(/\s/g, '').split('').map(ch => code[ch]);
}

export const at = (size, r, c) => r * size + c;
export const mv = (sq) => ({ type: 'move', sq });

// 15路の盤を、指定した石だけ置いた形で作る（{ X: [[r, c], ...], O: [...] }）
export function board15({ X = [], O = [] } = {}) {
    const board = new Array(225).fill(EMPTY);
    X.forEach(([r, c]) => { board[r * 15 + c] = BLACK; });
    O.forEach(([r, c]) => { board[r * 15 + c] = WHITE; });
    return board;
}

// 交互に打つ（席は手番に合わせる）
export function playMoves(game, squares) {
    squares.forEach(sq => {
        if (!game.applyCommand(game.current, mv(sq))) throw new Error(game.lastError);
    });
    return game;
}

export function snapshot(game) {
    const { lastError, ...rest } = game;
    return JSON.stringify(rest);
}
