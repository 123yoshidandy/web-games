#!/usr/bin/env node
/**
 * CPU 同士の試合をたくさん回して、強さ（勝率・平均点）と速さ、止まらずに終わるかを測る
 *
 * 使い方：node scripts/cpu-sim.mjs [試合数] [強さの並び（カンマ区切り）]
 *   例：node scripts/cpu-sim.mjs 200 normal,strong
 *       node scripts/cpu-sim.mjs 100 normal,normal,normal,normal
 * 席の順番による有利・不利を消すため、試合ごとに強さの並びをずらす
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

const games = Number(process.argv[2] ?? 100);
const levels = (process.argv[3] ?? 'normal,strong').split(',');
const n = levels.length;
const MAX_STEPS = 200;

const stats = Object.fromEntries([...new Set(levels)].map(l => [l, { seats: 0, wins: 0, score: 0, field: 0, city: 0, road: 0, monastery: 0 }]));
let totalMs = 0;
let moves = 0;
let maxMoveMs = 0;
let stalls = 0;

for (let g = 0; g < games; g++) {
    const shift = g % n;
    const seatLevels = levels.map((_, i) => levels[(i + shift) % n]);
    const game = new Game(seatLevels.map((l, i) => ({ name: `${l}${i}`, isCPU: true })), { seed: 1000 + g });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const start = performance.now();
        const ok = runCpuStep(game, seat => seatLevels[seat]);
        const ms = performance.now() - start;
        totalMs += ms;
        maxMoveMs = Math.max(maxMoveMs, ms);
        moves++;
        steps++;
        if (!ok) break;
    }
    if (!game.isOver()) {
        stalls++;
        continue;
    }
    const winners = game.winners();
    game.players.forEach((p, seat) => {
        const s = stats[seatLevels[seat]];
        s.seats++;
        s.score += p.score;
        Object.keys(p.breakdown).forEach(k => { s[k] += p.breakdown[k]; });
        if (winners.includes(seat)) s.wins += 1 / winners.length;
    });
}

console.log(`${games} 試合（${levels.join(' 対 ')}）、止まった試合 ${stalls}`);
Object.entries(stats).forEach(([level, s]) => {
    const per = v => (v / s.seats).toFixed(1);
    const seatsPerGame = s.seats / games;
    console.log(`${level.padEnd(7)} 勝率 ${(100 * s.wins / games / seatsPerGame).toFixed(1)}%（席あたり）  平均 ${per(s.score)} 点（都市 ${per(s.city)}・道 ${per(s.road)}・修道院 ${per(s.monastery)}・草原 ${per(s.field)}）`);
});
console.log(`1 手の計算：平均 ${(totalMs / moves).toFixed(1)}ms、最大 ${maxMoveMs.toFixed(1)}ms、1 試合 ${(moves / games).toFixed(1)} 手`);
