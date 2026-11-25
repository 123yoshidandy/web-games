import Game from '../public/js/game.js';
import { CELLS, EMPTY, pieceOf, positionKey } from '../public/js/rules.js';

export const players = (cpu = [false, true], level = 'normal') => cpu.map((c, i) => ({ name: `P${i}`, isCPU: c, cpuLevel: level }));

export function newGame(seed = 1, cpu) {
    return new Game(players(cpu), { seed });
}

// 盤を決める。pieces: { マス: '藍師'|'藍弟'|'朱師'|'朱弟' }。手札・脇・手番も決める
export function setPosition(game, pieces, { hands, side, current = 0 } = {}) {
    const code = { 藍弟: pieceOf(0, false), 藍師: pieceOf(0, true), 朱弟: pieceOf(1, false), 朱師: pieceOf(1, true) };
    game.board = Array(CELLS).fill(EMPTY);
    Object.entries(pieces).forEach(([sq, p]) => { game.board[Number(sq)] = code[p]; });
    if (hands) game.hands = hands.map(h => [...h]);
    if (side) game.side = side;
    game.current = current;
    game.seen = new Map([[positionKey(game.state(), game.current), 1]]);
    return game;
}

export function snapshot(game) {
    const { random, lastError, seen, ...rest } = game;
    return JSON.stringify({ ...rest, seen: [...seen.entries()] });
}
