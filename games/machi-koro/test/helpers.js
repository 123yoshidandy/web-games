import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

// 席0の番から始まるゲーム
export const newGame = (n = 2, seed = 1) => new Game(players(n), { seed, startPlayer: 0 });

// 次に出る目を決める（1つの目につき乱数を1つ使う）。決めた目を使い切ったら、元の乱数に戻す
export function fixDice(game, ...faces) {
    const original = game.random;
    const queue = [...faces];
    game.random = () => (queue.length ? (queue.shift() - 1) / 6 + 0.01 : original());
}

// 施設とランドマークを決める（{ cafe: 2 } のように。足りない分は市場から取らない）
export function setCity(game, seat, { cards, landmarks = [], coins } = {}) {
    const p = game.players[seat];
    if (cards) p.cards = { ...cards };
    landmarks.forEach(k => { p.landmarks[k] = true; });
    if (coins !== undefined) p.coins = coins;
}

export const coins = (game) => game.players.map(p => p.coins);

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
