import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

// 席0から始まるゲーム
export const newGame = (n = 2, seed = 1, cards) => new Game(players(n), { seed, startPlayer: 0, cards });

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}

// トークンの並び（{ 'q,r': 動物 }）を、短い書き方から作る：tokens(['bear', [0, 0], [1, 0]], ['fox', [3, 0]])
export function tokens(...groups) {
    const out = {};
    groups.forEach(([animal, ...cells]) => cells.forEach(([q, r]) => { out[`${q},${r}`] = animal; }));
    return out;
}

// 直線のマス（(q, r) から (dq, dr) の向きに n 個）
export const line = (q, r, dq, dr, n) => Array.from({ length: n }, (_, i) => [q + dq * i, r + dr * i]);

// 全部のトークンの数（袋・場・地）
export const totalTokens = (game) => game.bag.length + game.display.tokens.filter(Boolean).length
    + game.players.reduce((s, p) => s + Object.values(p.env).filter(x => x.token).length, 0);

// 全部のタイルの数（山・場・地）
export const totalTiles = (game) => game.stack.length + game.display.tiles.filter(t => t != null).length
    + game.players.reduce((s, p) => s + Object.keys(p.env).length, 0);
