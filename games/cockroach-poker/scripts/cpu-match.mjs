/**
 * CPU 同士を多数回対戦させて、負けた割合と、嘘・見抜いた数を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（easy,normal）]
 *   例: node scripts/cpu-match.mjs 1000 3 easy,normal,easy
 * 席の並びによる有利・不利をならすため、最初の親は試合ごとに入れ替える
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 2000;

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
    const result = { finished: 0, stuck: 0, rounds: [], losses: Array(count).fill(0), set: 0, empty: 0, claims: 0, lies: 0, answers: 0, correct: 0, peeks: 0 };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ count, levels, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.rounds.push(game.history.length);
        result.losses[game.loser] += 1;
        result[game.reason] += 1;
        game.history.forEach(h => {
            result.answers++;
            if (h.correct) result.correct++;
            result.peeks += h.chain.length - 1;
            h.chain.forEach(c => {
                result.claims++;
                if (c.claim !== h.card) result.lies++;
            });
        });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const count = Number(process.argv[3] ?? 3);
    const levels = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    if (levels.length !== count) throw new Error('席の数と強さの数が合いません');
    const started = Date.now();
    const r = runMatches({ games, count, levels });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    const pct = (a, b) => `${(a / Math.max(1, b) * 100).toFixed(1)}%`;
    console.log(`${games}試合（${count}人：${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・回の数 平均 ${avg(r.rounds)}（最大 ${Math.max(...r.rounds)}）・負け方 そろった ${r.set}／手札なし ${r.empty}`);
    console.log(`言った ${r.claims}（嘘 ${pct(r.lies, r.claims)}）・答えが当たった ${pct(r.correct, r.answers)}・見てから回した ${r.peeks}`);
    levels.forEach((level, i) => console.log(`席${i}（${level}）の負け ${pct(r.losses[i], r.finished)}`));
}
