/**
 * CPU 同士を多数回対戦させて、勝率と最終得点（いちばん低い色の点）を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [席ごとの強さ（easy,normal など。数が人数）]
 *   例: node scripts/cpu-match.mjs 100 easy,normal
 * 席の並びによる有利・不利をならすため、最初の人は試合ごとに入れ替える。同点で勝ちを分け合ったら、勝ちを人数で割って数える
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 3000; // タイルは153枚。争いの手を入れても、これより多くはならない

export function playMatch({ levels, seed }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })), { seed, startPlayer: seed % levels.length });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, levels, seedBase = 1 }) {
    const n = levels.length;
    const result = { finished: 0, stuck: 0, wins: Array(n).fill(0), finals: Array(n).fill(0), ties: 0, steps: [], reasons: {}, counts: {} };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ levels, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.steps.push(game.commands.length);
        result.reasons[game.endReason] = (result.reasons[game.endReason] ?? 0) + 1;
        if (game.winners.length > 1) result.ties++;
        game.winners.forEach(w => { result.wins[w] += 1 / game.winners.length; });
        game.players.forEach((p, j) => { result.finals[j] += game.finalValues(j)[0]; });
        game.commands.forEach(({ command }) => { result.counts[command.type] = (result.counts[command.type] ?? 0) + 1; });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 50);
    const levels = (process.argv[3] ?? 'easy,normal').split(',');
    const started = Date.now();
    const r = runMatches({ games, levels });
    const per = (v) => (v / Math.max(1, r.finished)).toFixed(1);
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・操作の数 平均 ${avg(r.steps)}・同点 ${r.ties}・終わり方 ${JSON.stringify(r.reasons)}`);
    console.log(`操作の内訳（試合あたり） ${Object.entries(r.counts).map(([k, v]) => `${k} ${per(v)}`).join('・')}`);
    r.wins.forEach((w, j) => {
        console.log(`席${j}（${levels[j]}）の勝率 ${(w / Math.max(1, r.finished) * 100).toFixed(1)}%・最終得点の平均 ${per(r.finals[j])}`);
    });
}
