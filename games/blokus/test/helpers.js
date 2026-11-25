import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

// 席0が先手（青）のゲーム
export const newGame = (n = 4, seed = 1, scoring = 'advanced') => new Game(players(n), { seed, startPlayer: 0, scoring });

// 盤に文字で色を置く（{ x, y, rows: ['BB.', '.B.'] }、B Y R G が色）
export function paint(game, x, y, rows) {
    const index = { B: 0, Y: 1, R: 2, G: 3 };
    rows.forEach((row, dy) => [...row].forEach((ch, dx) => {
        if (ch in index) game.board[(y + dy) * 20 + x + dx] = index[ch];
    }));
}

export const place = (game, piece, orient, x, y) => game.applyCommand(game.actors()[0], { type: 'place', piece, orient, x, y });

export function snapshot(game) {
    const { lastError, ...rest } = game;
    return JSON.stringify(rest);
}
