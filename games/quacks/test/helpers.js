import { expect } from 'vitest';
import Game from '../public/js/game.js';
import { START_BAG } from '../public/js/data.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 3, seed = 1) => new Game(players(n), { seed });

// 1回目を、決めた占いカードでやり直す（ほかの状態は始めのまま）
export function restartWith(game, fortune, { round = 1 } = {}) {
    game.fortunes = Array(24).fill(fortune);
    if (round === 1) {
        game.players.forEach(p => Object.assign(p, {
            score: 0, rubies: 1, droplet: 0, flask: true, rats: 0, pot: [], prompts: [], bag: [...START_BAG]
        }));
    }
    game.round = round - 1;
    game.phase = 'fortune';
    game.startRound();
    return game;
}

// 占いのない回で調合を始める（「ひとしずく」は全員同じだけ動くので、しずくを戻す）
export function brewing(n = 3, seed = 1) {
    const game = makeGame(n, seed);
    restartWith(game, 'rabbit');
    expect(game.phase).toBe('brew');
    return game;
}

// 袋を、上から引く順に並べる（引くときに先頭を取るようにする）
export function stack(game, seat, chips) {
    const p = game.players[seat];
    p.bag = [...chips];
    p.random = () => 0;
}

export function act(game, seat, ...commands) {
    commands.forEach(command => {
        const c = typeof command === 'string' ? { type: command } : command;
        if (!game.applyCommand(seat, c)) throw new Error(`${seat} ${JSON.stringify(c)}: ${game.lastError}`);
    });
}

// 全員を止める
export function stopAll(game) {
    game.players.forEach(p => {
        if (game.phase === 'brew' && !p.brew.done) game.applyCommand(p.id, { type: 'stop' });
    });
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, round: game.round, fortune: game.fortune, fortunes: game.fortunes, phase: game.phase,
    winners: game.winners, logs: game.logs, events: game.events, commands: game.commands, promptSeq: game.promptSeq
});
