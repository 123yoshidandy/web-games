/**
 * CPU 同士を多数回対戦させて、勝率・得点・手数を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（normal,strong）] [最初のシード]
 *   例: node scripts/cpu-match.mjs 200 4 strong,normal,normal,normal
 * 盤面と手番の順はシードで変わるので、席による有利・不利は試合数で均される
 */

import Game from '../public/js/game.js';
import { runCpuStep, cpuActor, CPU_LEVELS } from '../public/js/cpu-player.js';

const MAX_STEPS = 5000;

export function playMatch({ levels, seed, mode = 'classic' }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true })), { seed, mode });
    for (let steps = 0; game.phase !== 'end' && steps < MAX_STEPS; steps++) {
        const seat = game.isRealtimeSetup() ? game.actors()[0] : cpuActor(game);
        if (seat === null || seat === undefined || !runCpuStep(game, seat, levels[seat])) break; // 進まなかった
    }
    return game;
}

export function runMatches({ games, levels, seedBase = 1, mode }) {
    const result = { finished: 0, stuck: 0, steps: [], wins: levels.map(() => 0), scores: levels.map(() => []) };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ levels, seed: seedBase + i, mode });
        if (game.phase !== 'end') {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.steps.push(game.commands.length);
        game.result.points.forEach((points, seat) => result.scores[seat].push(points));
        result.wins[game.result.winnerId]++;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const count = Number(process.argv[3] ?? 4);
    const levels = (process.argv[4] ?? ['strong', ...Array(count - 1).fill('normal')].join(',')).split(',');
    if (levels.length !== count) throw new Error('席の数と強さの数が合いません');
    if (levels.some(level => !CPU_LEVELS[level])) throw new Error(`強さは ${Object.keys(CPU_LEVELS).join('・')} のどれかです`);
    const started = Date.now();
    const r = runMatches({ games, levels, seedBase: Number(process.argv[5] ?? 1) });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${count}人：${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・操作の数の平均 ${avg(r.steps)}`);
    levels.forEach((level, i) => console.log(`席${i}（${level}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%・得点の平均 ${avg(r.scores[i])}`));
}
