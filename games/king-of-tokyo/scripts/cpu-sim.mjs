#!/usr/bin/env node
/**
 * CPU 同士の試合をたくさん回して、強さ（勝率）と試合の長さ、止まらずに終わるかを測る
 *
 * 使い方：node scripts/cpu-sim.mjs [試合数] [強さの並び（カンマ区切り）]
 *   例：node scripts/cpu-sim.mjs 300 normal,strong
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

const games = Number(process.argv[2] ?? 200);
const levels = (process.argv[3] ?? 'normal,strong').split(',');
const n = levels.length;
const stats = Object.fromEntries([...new Set(levels)].map(l => [l, { seats: 0, wins: 0, byPoints: 0 }]));
let stalls = 0;
let turns = 0;
let decisions = 0;
let totalMs = 0;
let maxMs = 0;
let draws = 0;

for (let g = 0; g < games; g++) {
    const shift = g % n;
    const seatLevels = levels.map((_, i) => levels[(i + shift) % n]);
    const game = new Game(seatLevels.map((l, i) => ({ name: `${l}${i}`, isCPU: true })), { seed: 11000 + g });
    let steps = 0;
    while (!game.isOver() && steps < 20000) {
        const start = performance.now();
        const ok = runCpuStep(game, seat => seatLevels[seat]);
        const ms = performance.now() - start;
        totalMs += ms;
        maxMs = Math.max(maxMs, ms);
        steps++;
        if (!ok) break;
    }
    decisions += steps;
    if (!game.isOver()) {
        stalls++;
        continue;
    }
    turns += game.turnNo;
    if (game.winner === null) {
        draws++;
        continue;
    }
    const st = stats[seatLevels[game.winner]];
    st.wins++;
    if (game.events.at(-1).reason === 'points') st.byPoints++;
    game.players.forEach((_, seat) => { stats[seatLevels[seat]].seats++; });
}

console.log(`${games} 試合（${levels.join(' 対 ')}）、止まった試合 ${stalls}、全滅 ${draws}`);
Object.entries(stats).forEach(([level, s]) => {
    const seatsPerGame = levels.filter(l => l === level).length;
    console.log(`${level.padEnd(7)} 勝率 ${(100 * s.wins / games / seatsPerGame).toFixed(1)}%（席あたり）  うち 20 点で勝ち ${s.wins ? (100 * s.byPoints / s.wins).toFixed(0) : 0}%`);
});
console.log(`1 試合：平均 ${(turns / games).toFixed(1)} 手番、${(decisions / games).toFixed(0)} 回の判断。1 回の判断：平均 ${(totalMs / decisions).toFixed(2)}ms、最大 ${maxMs.toFixed(1)}ms`);
