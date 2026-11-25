import Game, { COLUMNS } from '../public/js/game.js';

export const players = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));

/**
 * 状態を直接作ったゲーム
 * progress: [{ 列: 位置 }]（席ごと）、runners、claimed: { 列: 席 }、dice：振ったダイス（phase は choose）
 */
export function setupGame({ n = 2, current = 0, progress = [], runners = {}, claimed = {}, dice = null, phase }) {
    const game = new Game(players(n), { seed: 1 });
    game.current = current;
    game.players.forEach((p, i) => Object.assign(p.progress, progress[i] ?? {}));
    game.runners = { ...runners };
    COLUMNS.forEach(c => { game.claimed[c] = claimed[c] ?? null; });
    game.dice = dice;
    game.phase = phase ?? (dice ? 'choose' : 'roll');
    game.events = [];
    return game;
}

// 次に振るダイスを決める（ゲームの乱数を差し替える）
export function forceDice(game, ...rolls) {
    const values = rolls.flat().map(v => (v - 1) / 6 + 0.01);
    const original = game.random;
    game.random = () => (values.length ? values.shift() : original());
}

export function snapshot(game) {
    return JSON.stringify({
        players: game.players, claimed: game.claimed, runners: game.runners, dice: game.dice,
        phase: game.phase, current: game.current, winner: game.winner, commands: game.commands.length
    });
}

export const sortOptions = options => options.map(o => `${o.pair}:${o.sums.join('+')}`).sort();
