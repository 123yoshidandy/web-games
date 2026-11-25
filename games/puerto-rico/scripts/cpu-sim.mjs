#!/usr/bin/env node
/**
 * CPU 同士の試合をたくさん回して、強さ（勝率）・点数・試合の長さ、止まらずに終わるかを測る
 *
 * 使い方：node scripts/cpu-sim.mjs [試合数] [強さの並び（カンマ区切り、3〜5 人）]
 *   例：node scripts/cpu-sim.mjs 200 normal,easy,easy
 */

import Game from '../public/js/game.js';
import { runCpuStep, isCpuToAct } from '../public/js/cpu-player.js';

const games = Number(process.argv[2] ?? 200);
const levels = (process.argv[3] ?? 'normal,easy,easy').split(',');
const n = levels.length;
const stats = Object.fromEntries([...new Set(levels)].map(l => [l, { seats: 0, wins: 0, points: 0 }]));
let rounds = 0, stalls = 0, rejects = 0;
const ends = {};
// CPU の手が断られた回数（断られても無作為な手で打ち直すので、ここで数える）
const apply = Game.prototype.applyCommand;
Game.prototype.applyCommand = function (seat, command) {
    const ok = apply.call(this, seat, command);
    if (!ok) rejects++;
    return ok;
};

for (let g = 0; g < games; g++) {
    // 席の並びを試合ごとにずらす
    const order = levels.map((_, i) => levels[(i + g) % n]);
    const game = new Game(order.map((l, i) => ({ name: `${l}${i}`, isCPU: true })), { seed: 1000 + g });
    let steps = 0;
    while (!game.isOver()) {
        if (!isCpuToAct(game) || ++steps > 20000 || !runCpuStep(game, s => order[s])) { stalls++; break; }
    }
    if (!game.isOver()) continue;
    rounds += game.round;
    ends[game.endTriggered] = (ends[game.endTriggered] ?? 0) + 1;
    order.forEach((l, i) => {
        stats[l].seats++;
        stats[l].points += game.scores[i].total;
        if (game.winners.includes(i)) stats[l].wins += 1 / game.winners.length;
    });
}

const done = games - stalls;
console.log(`${games}試合（${n}人）、止まった試合 ${stalls}、断られた手 ${rejects}`);
console.log(`平均 ${(rounds / done).toFixed(1)} ラウンド、終わりの理由 ${JSON.stringify(ends)}`);
for (const [l, s] of Object.entries(stats)) {
    console.log(`${l}: 席あたりの勝率 ${(100 * s.wins / s.seats).toFixed(1)}%、平均 ${(s.points / s.seats).toFixed(1)} 点`);
}
