/**
 * CPU 同士を多数回対戦させて、勝率と点を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（easy,normal）] [準備（standard・beginner）]
 *   例: node scripts/cpu-match.mjs 100 2 easy,normal
 * 席の並びによる有利・不利をならすため、最初の人は試合ごとに入れ替える。同点で勝ちを分け合ったら、勝ちを人数で割って数える
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 220; // 目標を選ぶ1回＋置く・取るを22回ずつ、4人まで

export function playMatch({ count, levels, seed, setup }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })), { seed, startPlayer: seed % count, setup });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, count, levels, setup = 'standard', seedBase = 1 }) {
    const result = { finished: 0, stuck: 0, wins: Array(count).fill(0), totals: Array(count).fill(0), ties: 0, steps: [] };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ count, levels, seed: seedBase + i, setup });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.steps.push(game.commands.length);
        if (game.winners.length > 1) result.ties++;
        game.winners.forEach(w => { result.wins[w] += 1 / game.winners.length; });
        game.result.players.forEach((s, j) => { result.totals[j] += s.total; });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 50);
    const count = Number(process.argv[3] ?? 2);
    const levels = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    const setup = process.argv[5] ?? 'standard';
    if (levels.length !== count) throw new Error('席の数と強さの数が合いません');
    const started = Date.now();
    const r = runMatches({ games, count, levels, setup });
    const per = (v) => (v / Math.max(1, r.finished)).toFixed(1);
    console.log(`${games}試合（${count}人・${setup}：${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・同点 ${r.ties}`);
    r.wins.forEach((w, j) => {
        console.log(`席${j}（${levels[j]}）の勝率 ${(w / Math.max(1, r.finished) * 100).toFixed(1)}%・点の平均 ${per(r.totals[j])}`);
    });
}
