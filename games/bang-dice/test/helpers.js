import Game from '../public/js/game.js';
import { CHARACTER_BY_ID } from '../public/js/characters.js';

export const players = (n = 4, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 4, seed = 1) => new Game(players(n), { seed });

// 場面を作る：役割・キャラクター・体力・矢を決め、seat の手番を最初から始め直す
// roles と characters は席の順。life を省くと上限（保安官は +2）
export function setup(game, { roles, characters, life, arrows, pile, current = 0, dice } = {}) {
    game.players.forEach((p, i) => {
        if (roles) p.role = roles[i];
        if (characters) p.character = characters[i];
        p.maxLife = CHARACTER_BY_ID[p.character].life + (p.role === 'sheriff' ? 2 : 0);
        p.life = life?.[i] ?? p.maxLife;
        p.arrows = arrows?.[i] ?? 0;
        p.alive = p.life > 0;
    });
    if (pile !== undefined) game.arrowPile = pile;
    game.threePlayer = game.players.length === 3;
    game.startTurn(current);
    if (dice) setDice(game, dice);
    return game;
}

// 振ったあとの状態にする（振る回数を使い切ったことにしてもよい）
export function setDice(game, dice, { rolls = 1 } = {}) {
    const t = game.turn;
    t.stage = 'roll';
    t.dice = [...dice];
    t.rolls = rolls;
}

// 次に振る目を決める（ゲームの乱数を差し替える）。faces の順に出る
export function rig(game, faces) {
    const order = ['arrow', 'dynamite', '1', '2', 'beer', 'gatling'];
    const queue = [...faces];
    const original = game.random;
    game.random = () => (queue.length > 0 ? (order.indexOf(queue.shift()) + 0.5) / 6 : original());
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, arrowPile: game.arrowPile, turn: game.turn, pending: game.pending, queue: game.queue,
    phase: game.phase, winners: game.winners, logs: game.logs, events: game.events, commands: game.commands, acts: game.acts
});
