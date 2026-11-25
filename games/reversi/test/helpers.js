import Game from '../public/js/game.js';
import { EMPTY, BLACK, WHITE } from '../public/js/rules.js';

export const players = (cpu = [false, true], level = 'normal') => cpu.map((c, i) => ({ name: `P${i}`, isCPU: c, cpuLevel: level }));

export function newGame(cpu) {
    return new Game(players(cpu));
}

// 盤を8行の文字列で作る。X 黒・O 白・. 空き（1行目が上の段＝行1）
export function boardOf(rows) {
    const code = { '.': EMPTY, X: BLACK, O: WHITE };
    return rows.join('').split('').map(ch => code[ch]);
}

export function setPosition(game, rows, current = 0) {
    game.board = boardOf(rows);
    game.current = current;
    return game;
}

export function snapshot(game) {
    const { lastError, ...rest } = game;
    return JSON.stringify(rest);
}
