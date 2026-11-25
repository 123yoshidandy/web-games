#!/usr/bin/env node
/**
 * CPU 同士の試合をたくさん回して、強さ（勝率）と速さ、止まらずに終わるかを測る
 *
 * 使い方：node scripts/cpu-sim.mjs [試合数] [強さの並び（カンマ区切り）]
 *   例：node scripts/cpu-sim.mjs 500 normal,strong
 * 席の順番による有利・不利を消すため、試合ごとに強さの並びをずらす
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

const games = Number(process.argv[2] ?? 200);
const levels = (process.argv[3] ?? 'normal,strong').split(',');
const n = levels.length;
const MAX_STEPS = 20000;

const stats = Object.fromEntries([...new Set(levels)].map(l => [l, { seats: 0, wins: 0, claimed: 0, turns: 0, busts: 0 }]));
let totalMs = 0;
let moves = 0;
let maxMoveMs = 0;
let stalls = 0;
let totalTurns = 0;
let totalCommands = 0;

for (let g = 0; g < games; g++) {
    const shift = g % n;
    const seatLevels = levels.map((_, i) => levels[(i + shift) % n]);
    const game = new Game(seatLevels.map((l, i) => ({ name: `${l}${i}`, isCPU: true })), { seed: 5000 + g });
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
    totalTurns += game.turn;
    totalCommands += game.commands.length;
    const busts = game.events.length; // 最近の分だけなので使わない
    game.players.forEach((p, seat) => {
        const s = stats[seatLevels[seat]];
        s.seats++;
        s.claimed += game.claimedCount(seat);
        if (game.winner === seat) s.wins++;
    });
    void busts;
}

console.log(`${games} 試合（${levels.join(' 対 ')}）、止まった試合 ${stalls}`);
Object.entries(stats).forEach(([level, s]) => {
    const seatsPerGame = s.seats / games;
    console.log(`${level.padEnd(7)} 勝率 ${(100 * s.wins / games / seatsPerGame).toFixed(1)}%（席あたり）  取った列 平均 ${(s.claimed / s.seats).toFixed(2)}`);
});
console.log(`1 試合：平均 ${(totalTurns / games).toFixed(1)} 手番、${(totalCommands / games).toFixed(1)} 操作。1 手の計算：平均 ${(totalMs / moves).toFixed(2)}ms、最大 ${maxMoveMs.toFixed(1)}ms`);
