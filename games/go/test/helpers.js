import Game from '../public/js/game.js';
import { EMPTY, BLACK, WHITE } from '../public/js/rules.js';

export const players = (cpu = [false, true], level = 'easy') => cpu.map((c, i) => ({ name: `P${i}`, isCPU: c, cpuLevel: level }));

export function newGame(cpu = [false, false], options = { size: 9 }) {
    return new Game(players(cpu), options);
}

// 盤を行の文字列で作る。X 黒・O 白・. 空き（1行目が上の段）。行の数が盤の大きさ
export function boardOf(rows) {
    const code = { '.': EMPTY, X: BLACK, O: WHITE };
    return rows.join('').replace(/\s/g, '').split('').map(ch => code[ch]);
}

export const at = (size, r, c) => r * size + c;

// 局面を差し替える（手番の席も）
export function setPosition(game, rows, current = 0) {
    game.board = boardOf(rows);
    game.current = current;
    game.ko = -1;
    return game;
}

export function snapshot(game) {
    const { lastError, ...rest } = game;
    return JSON.stringify(rest);
}
