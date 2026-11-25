import Game from '../public/js/game.js';
import { cellAt } from '../public/js/board.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

// 席0から始まるゲーム
export const newGame = (n = 2, seed = 1) => new Game(players(n), { seed, startPlayer: 0 });

// 倍の x と y で、マスの番号を引く
export const at = (x, y) => {
    const c = cellAt(x, y);
    if (c < 0) throw new Error(`盤の外です: ${x},${y}`);
    return c;
};

// 動かす場面を作る：ペンギンの位置を { 番号: マス } で置き、席 current の番にする
export function movePhase(game, cells, current = 0) {
    game.penguins.forEach((p, i) => { p.cell = cells[i] ?? null; p.removed = cells[i] === undefined; });
    game.placed = game.penguins.length;
    game.phase = 'move';
    game.current = current;
}

// 盤の氷を全部1匹にする（数えやすくするため）
export const flatFish = (game, fish = 1) => { game.fish.fill(fish); };

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}

// 全部の氷の数（盤に残る・取った）
export const totalTiles = (game) => game.fish.filter(f => f > 0).length + game.players.reduce((s, p) => s + p.catch.length, 0);
