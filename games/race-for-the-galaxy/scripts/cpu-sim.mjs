#!/usr/bin/env node
/**
 * CPU 同士の試合をたくさん回して、強さ（勝率）・点数・試合の長さ、止まらずに終わるかを測る
 *
 * 使い方：node scripts/cpu-sim.mjs [試合数] [強さの並び（カンマ区切り）] [advanced]
 *   例：node scripts/cpu-sim.mjs 200 normal,easy
 *       node scripts/cpu-sim.mjs 200 normal,easy advanced   （2 人の上級ルール）
 */

import Game from '../public/js/game.js';
import { runCpuStep, cpuSeatsToAct } from '../public/js/cpu-player.js';

const games = Number(process.argv[2] ?? 200);
const levels = (process.argv[3] ?? 'normal,easy').split(',');
const advanced = process.argv[4] === 'advanced';
const n = levels.length;
const stats = Object.fromEntries([...new Set(levels)].map(l => [l, { seats: 0, wins: 0, points: 0 }]));
let rounds = 0, stalls = 0, rejects = 0, endByTableau = 0;
const errors = new Map();
// CPU の手が断られた回数（断られても無作為な手で打ち直すので、ここで数える）
const apply = Game.prototype.applyCommand;
Game.prototype.applyCommand = function (seat, command) {
    const ok = apply.call(this, seat, command);
    if (!ok) { rejects++; const key = `${command?.type}: ${this.lastError}`; errors.set(key, (errors.get(key) ?? 0) + 1); }
    return ok;
};

for (let g = 0; g < games; g++) {
    // 席の並びを試合ごとにずらす
    const order = levels.map((_, i) => levels[(i + g) % n]);
    const game = new Game(order.map((l, i) => ({ name: `${l}${i}`, isCPU: true })), { seed: 1000 + g, advanced });
    let steps = 0;
    while (!game.isOver()) {
        const seats = cpuSeatsToAct(game);
        if (!seats.length || ++steps > 20000) { stalls++; break; }
        for (const seat of seats) {
            if (game.pending[seat] && !runCpuStep(game, seat, s => order[s])) stalls++;
        }
    }
    if (!game.isOver()) continue;
    rounds += game.round;
    if (game.players.some(p => p.tableau.length >= 12)) endByTableau++;
    order.forEach((l, i) => {
        stats[l].seats++;
        stats[l].points += game.scores[i].total;
        if (game.winners.includes(i)) stats[l].wins += 1 / game.winners.length;
    });
}

const done = games - stalls;
console.log(`${games}試合（${n}人${advanced ? '・上級' : ''}）、止まった試合 ${stalls}、断られた手 ${rejects}`);
for (const [k, v] of errors) console.log('  断られた理由', k, v);
console.log(`平均 ${(rounds / done).toFixed(1)} ラウンド、場札12枚で終わった ${(100 * endByTableau / done).toFixed(0)}%`);
for (const [l, s] of Object.entries(stats)) {
    console.log(`${l}: 勝率 ${(100 * s.wins / s.seats * (n / new Set(levels).size) / n * new Set(levels).size).toFixed(1)}%（席あたり ${(100 * s.wins / s.seats).toFixed(1)}%）、平均 ${(s.points / s.seats).toFixed(1)} 点`);
}
