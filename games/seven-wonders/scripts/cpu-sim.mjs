#!/usr/bin/env node
/**
 * CPU 同士の試合をたくさん回して、強さ（勝率・平均点）と速さ、止まらずに終わるかを測る
 *
 * 使い方：node scripts/cpu-sim.mjs [試合数] [強さの並び（カンマ区切り）] [面 A|B|random]
 *   例：node scripts/cpu-sim.mjs 100 normal,strong,normal
 * 席の順番による有利・不利を消すため、試合ごとに強さの並びをずらす
 */

import Game from '../public/js/game.js';
import { runCpuRound } from '../public/js/cpu-player.js';

const games = Number(process.argv[2] ?? 50);
const levels = (process.argv[3] ?? 'normal,strong,normal').split(',');
const sides = process.argv[4] ?? 'A';
const n = levels.length;

const keys = ['military', 'treasury', 'wonder', 'civilian', 'science', 'commercial', 'guilds', 'total'];
const stats = Object.fromEntries([...new Set(levels)].map(l => [l, { seats: 0, wins: 0, ...Object.fromEntries(keys.map(k => [k, 0])) }]));
let stalls = 0;
let totalMs = 0;
let rounds = 0;

for (let g = 0; g < games; g++) {
    const shift = g % n;
    const seatLevels = levels.map((_, i) => levels[(i + shift) % n]);
    const game = new Game(seatLevels.map((l, i) => ({ name: `${l}${i}`, isCPU: true })), { seed: 9000 + g, sides });
    let steps = 0;
    while (!game.isOver() && steps < 200) {
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

console.log(`${games} 試合（${levels.join(' 対 ')}、${sides} 面）、止まった試合 ${stalls}`);
Object.entries(stats).forEach(([level, s]) => {
    const per = k => (s[k] / s.seats).toFixed(1);
    const seatsPerGame = s.seats / games;
    console.log(`${level.padEnd(7)} 勝率 ${(100 * s.wins / games / seatsPerGame).toFixed(1)}%（席あたり）  平均 ${per('total')} 点（軍事 ${per('military')}・お金 ${per('treasury')}・不思議 ${per('wonder')}・市民 ${per('civilian')}・科学 ${per('science')}・商業 ${per('commercial')}・ギルド ${per('guilds')}）`);
});
console.log(`全員が 1 回選ぶのにかかる計算：平均 ${(totalMs / rounds).toFixed(1)}ms`);
