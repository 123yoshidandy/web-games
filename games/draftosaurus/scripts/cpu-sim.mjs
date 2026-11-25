#!/usr/bin/env node
/**
 * CPU 同士の試合をたくさん回して、強さ（勝率・平均点）と速さ、止まらずに終わるかを測る
 *
 * 使い方：node scripts/cpu-sim.mjs [試合数] [強さの並び（カンマ区切り）]
 *   例：node scripts/cpu-sim.mjs 400 normal,easy,normal,easy
 * 席の順番による有利・不利を消すため、試合ごとに強さの並びをずらす
 */

import Game from '../public/js/game.js';
import { runCpuRound } from '../public/js/cpu-player.js';

const games = Number(process.argv[2] ?? 200);
const levels = (process.argv[3] ?? 'normal,easy').split(',');
const n = levels.length;

const keys = ['forest', 'meadow', 'love', 'trio', 'king', 'island', 'river', 'trex', 'total'];
const stats = Object.fromEntries([...new Set(levels)].map(l => [l, { seats: 0, wins: 0, ...Object.fromEntries(keys.map(k => [k, 0])) }]));
let stalls = 0;
let totalMs = 0;
let rounds = 0;

for (let g = 0; g < games; g++) {
    const shift = g % n;
    const seatLevels = levels.map((_, i) => levels[(i + shift) % n]);
    const game = new Game(seatLevels.map((l, i) => ({ name: `${l}${i}`, isCPU: true })), { seed: 7000 + g });
    let steps = 0;
    while (!game.isOver() && steps < 40) {
        const start = performance.now();
        const moved = runCpuRound(game, seat => seatLevels[seat]);
        totalMs += performance.now() - start;
        rounds++;
        steps++;
        if (!moved) break;
    }
    if (!game.isOver()) {
        stalls++;
        continue;
    }
    const winners = game.winners();
    game.scores.forEach((s, seat) => {
        const st = stats[seatLevels[seat]];
        st.seats++;
        keys.forEach(k => { st[k] += s[k]; });
        if (winners.includes(seat)) st.wins += 1 / winners.length;
    });
}

console.log(`${games} 試合（${levels.join(' 対 ')}）、止まった試合 ${stalls}`);
Object.entries(stats).forEach(([level, s]) => {
    const per = k => (s[k] / s.seats).toFixed(1);
    const seatsPerGame = s.seats / games;
    console.log(`${level.padEnd(7)} 勝率 ${(100 * s.wins / games / seatsPerGame).toFixed(1)}%（席あたり。互角なら ${(100 / n).toFixed(1)}%）  平均 ${per('total')} 点（森 ${per('forest')}・草原 ${per('meadow')}・恋人 ${per('love')}・木 ${per('trio')}・王 ${per('king')}・島 ${per('island')}・川 ${per('river')}・ティラノ ${per('trex')}）`);
});
console.log(`全員が 1 回選ぶのにかかる計算：平均 ${(totalMs / rounds).toFixed(2)}ms`);
