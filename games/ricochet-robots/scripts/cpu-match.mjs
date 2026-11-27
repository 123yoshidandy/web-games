#!/usr/bin/env node
/**
 * CPU 同士の対戦：強さの違う CPU を同じ卓に座らせて、勝ち数・チップの平均・止まった試合の数を出す
 * 使い方: npm run cpu-match -- [試合数] [強さの並び] [目標の枚数]（例：npm run cpu-match -- 100 easy,normal,hard 9）
 * 時計は人がいないので早送りで進む（宣言の時刻は計画どおりに入るので、早く見つけた CPU が勝つ）
 */

import Game from '../public/js/game.js';
import { runDue } from '../public/js/cpu-player.js';

const games = Number(process.argv[2] ?? 60);
const levels = (process.argv[3] ?? 'easy,normal,hard').split(',');
const targets = Number(process.argv[4] ?? 17);
const wins = levels.map(() => 0);
const chips = levels.map(() => 0);
let stalls = 0;
let rounds = 0;
let flowed = 0;
const started = performance.now();

for (let i = 0; i < games; i++) {
    // 席の並びを試合ごとにずらす（同じ手数で先に宣言した人が先に実演するので、席の順で差が出ないように）
    const shift = i % levels.length;
    const seats = levels.map((_, k) => (k + shift) % levels.length);
    const players = seats.map(index => ({ name: levels[index], isCPU: true, level: levels[index] }));
    const game = new Game(players, { seed: 1000 + i, targets, startAt: 0 });
    runDue(game, Infinity, 20000);
    if (!game.isOver()) {
        stalls++;
        continue;
    }
    rounds += game.rounds.length;
    flowed += game.rounds.filter(round => round.winner === null).length;
    const { winners } = game.result();
    winners.forEach(seat => { wins[seats[seat]] += 1 / winners.length; });
    game.players.forEach(player => { chips[seats[player.seat]] += game.chips[player.seat].length; });
}

const finished = games - stalls;
console.log(`${games} 試合（目標 ${targets} 枚）・${((performance.now() - started) / 1000).toFixed(1)} 秒`);
levels.forEach((level, i) => console.log(`  ${level.padEnd(7)} 勝ち ${wins[i].toFixed(1).padStart(5)}（${(wins[i] / Math.max(1, finished) * 100).toFixed(0)}%）・チップ平均 ${(chips[i] / Math.max(1, finished)).toFixed(2)}`));
console.log(`  流れた目標 ${flowed} / ${rounds}・止まった試合 ${stalls}`);
if (stalls) process.exitCode = 1;
