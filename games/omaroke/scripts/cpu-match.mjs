#!/usr/bin/env node
/**
 * CPU 同士の試合をたくさん回して、止まらずに終わるか、役割ごとの勝率、手番の数を測る
 *
 * 使い方：node scripts/cpu-match.mjs [試合数] [人数] [強さ（normal・easy・mixed）] [ルール（basic・expert）]
 *   mixed は席ごとに強さを交互にし、役割 × 強さごとの勝率も出す
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

const games = Number(process.argv[2] ?? 200);
const n = Number(process.argv[3] ?? 5);
const level = process.argv[4] ?? 'normal';
const mode = process.argv[5] ?? 'basic';
const STEP_LIMIT = 5000;

const sides = { gym: 0, challenger: 0, rocket: 0 };
// 役割 × 強さごとの勝率（勝ち負けは役割で大きく変わるので、同じ役割どうしで比べる）
const byRole = {};
let stalls = 0;
let turns = 0;
let steps = 0;

for (let g = 0; g < games; g++) {
    const levels = Array.from({ length: n }, (_, i) => (level === 'mixed' ? ((i + g) % 2 ? 'easy' : 'normal') : level));
    const game = new Game(levels.map((l, i) => ({ name: `${l}${i}`, isCPU: true })), { seed: 9000 + g, mode });
    let k = 0;
    while (!game.isOver() && k < STEP_LIMIT) {
        const seat = game.actors().find(s => game.players[s].isCPU);
        if (!runCpuStep(game, levels[seat])) break;
        k++;
    }
    steps += k;
    if (!game.isOver()) {
        stalls++;
        continue;
    }
    sides[game.winnerSide]++;
    turns += game.turn.number;
    game.players.forEach(p => {
        const key = `${p.role}/${levels[p.id]}`;
        byRole[key] ??= { seats: 0, wins: 0 };
        byRole[key].seats++;
        if (game.winners.includes(p.id)) byRole[key].wins++;
    });
}

const done = games - stalls;
console.log(`${games} 試合（${n} 人・${level}・${mode}）、止まった試合 ${stalls}`);
console.log(`勝った側：ジム ${(100 * sides.gym / done).toFixed(1)}%・挑戦者 ${(100 * sides.challenger / done).toFixed(1)}%・ロケット団 ${(100 * sides.rocket / done).toFixed(1)}%`);
console.log(`平均の手番 ${(turns / done).toFixed(1)}、平均の操作 ${(steps / games).toFixed(0)}`);
if (level === 'mixed') {
    Object.entries(byRole).sort().forEach(([k, s]) => console.log(`${k.padEnd(18)} 勝率 ${(100 * s.wins / s.seats).toFixed(1)}%（${s.seats} 席）`));
}
