/**
 * CPU 同士の点数を測る
 *   node tools/cpu-bench.mjs [試合数]
 */

import Game from '../public/js/game.js';
import { chooseCommand } from '../public/js/cpu-player.js';

const GAMES = Number(process.argv[2] ?? 500);

for (const n of [2, 3, 4, 5]) {
    let total = 0;
    let turns = 0;
    let struck = 0;
    let perfect = 0;
    let mistakes = 0;
    const scores = [];
    const start = performance.now();
    for (let i = 0; i < GAMES; i++) {
        const game = new Game(Array.from({ length: n }, (_, k) => ({ name: `C${k}`, isCPU: true })), { seed: 1000 + i * 7919 });
        let steps = 0;
        while (!game.isOver) {
            if (++steps > 300) throw new Error(`終わらない試合 seed=${game.seed}`);
            if (!game.applyCommand(game.current, chooseCommand(game))) throw new Error(game.lastError);
        }
        total += game.score;
        scores.push(game.score);
        turns += game.turn;
        mistakes += game.mistakes;
        if (game.endReason === 'mistakes') struck++;
        if (game.endReason === 'perfect') perfect++;
    }
    scores.sort((a, b) => a - b);
    const ms = performance.now() - start;
    console.log(`${n}人 ${GAMES}試合：平均 ${(total / GAMES).toFixed(2)}点（中央 ${scores[GAMES >> 1]}、最低 ${scores[0]}、最高 ${scores[GAMES - 1]}）` +
        ` / 25点 ${(100 * perfect / GAMES).toFixed(1)}% / ミス3回 ${(100 * struck / GAMES).toFixed(1)}% / ミス平均 ${(mistakes / GAMES).toFixed(2)}` +
        ` / ${(turns / GAMES).toFixed(1)}手 / ${(ms / GAMES).toFixed(1)}ms`);
}
