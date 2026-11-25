import Game from '../public/js/game.js';
import { Position } from '../public/js/rules.js';

export const players = (cpu = [false, true], level = 'normal') => cpu.map((c, i) => ({ name: `P${i}`, isCPU: c, cpuLevel: level }));

export function newGame(cpu) {
    return new Game(players(cpu));
}

// 局面を SFEN から作り直す（千日手の記録も、その局面から始める）
export function setPosition(game, sfen) {
    game.pos = Position.fromSfen(sfen);
    game.history = [game.pos.toSfen()];
    game.checks = [];
    return game;
}

export function snapshot(game) {
    const { lastError, ...rest } = game;
    return JSON.stringify(rest);
}

// 操作を作る（升は sqOf(筋, 段) で渡す）
export const move = (from, to, promote = false) => ({ type: 'move', from, to, promote });
export const drop = (piece, to) => ({ type: 'drop', piece, to });
