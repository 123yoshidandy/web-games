/**
 * CPU 同士を多数回対戦させて、勝率と手番の数を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（easy,normal）]
 *   例: node scripts/cpu-match.mjs 400 2 easy,normal
 * 席の並びによる有利・不利をならすため、最初の手番は試合ごとに入れ替える
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 5000;

export function playMatch({ count, levels, seed }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })), { seed, startPlayer: seed % count });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, count, levels, seedBase = 1 }) {
    const result = { finished: 0, stuck: 0, turns: [], wins: Array(count).fill(0) };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ count, levels, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.turns.push(game.turn);
        result.wins[game.winner] += 1;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const count = Number(process.argv[3] ?? 2);
    const levels = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    if (levels.length !== count) throw new Error('席の数と強さの数が合いません');
    const started = Date.now();
    const r = runMatches({ games, count, levels });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${count}人：${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・手番の数 平均 ${avg(r.turns)}（最大 ${Math.max(...r.turns)}）`);
    levels.forEach((level, i) => console.log(`席${i}（${level}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%`));
}
