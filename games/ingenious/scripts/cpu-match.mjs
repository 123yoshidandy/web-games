/**
 * CPU 同士を多数回対戦させて、勝率と最終得点（いちばん低い色の点）を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（easy,normal）] [遊び方（standard・team・solo）]
 *   例: node scripts/cpu-match.mjs 100 2 easy,normal
 * 席の並びによる有利・不利をならすため、最初の人は試合ごとに入れ替える。同点で勝ちを分け合ったら、勝ちを人数で割って数える
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 400; // 置くのは多くても84枚。取り替えとインジーニアスを入れても、これより多くはならない

export function playMatch({ count, levels, seed, mode = 'standard' }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })), { seed, startPlayer: seed % count, mode });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, count, levels, mode = 'standard', seedBase = 1 }) {
    const sides = mode === 'team' ? 2 : count;
    const result = { finished: 0, stuck: 0, wins: Array(sides).fill(0), finals: Array(sides).fill(0), swaps: 0, ingenious: 0, ties: 0, steps: [] };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ count, levels, seed: seedBase + i, mode });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.steps.push(game.commands.length);
        if (game.winners.length > 1) result.ties++;
        game.winners.forEach(w => { result.wins[w] += 1 / game.winners.length; });
        game.sides.forEach((s, j) => { result.finals[j] += game.finalScore(j); });
        result.swaps += game.commands.filter(c => c.command.type === 'swap').length;
        result.ingenious += game.logs.filter(l => l.includes('インジーニアス')).length;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 50);
    const count = Number(process.argv[3] ?? 2);
    const levels = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    const mode = process.argv[5] ?? (count === 1 ? 'solo' : 'standard');
    if (levels.length !== count) throw new Error('席の数と強さの数が合いません');
    const started = Date.now();
    const r = runMatches({ games, count, levels, mode });
    const per = (v) => (v / Math.max(1, r.finished)).toFixed(1);
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${count}人・${mode}：${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・操作の数 平均 ${avg(r.steps)}・同点 ${r.ties}・取り替え ${per(r.swaps)}回／試合・インジーニアス ${per(r.ingenious)}回／試合`);
    r.wins.forEach((w, j) => {
        const who = mode === 'team' ? `組${j}（${levels[j]}・${levels[j + 2]}）` : `席${j}（${levels[j]}）`;
        console.log(`${who}の勝率 ${(w / Math.max(1, r.finished) * 100).toFixed(1)}%・最終得点の平均 ${per(r.finals[j])}`);
    });
}
