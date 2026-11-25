/**
 * CPU 同士を多数回対戦させて、勝率と点数を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（easy,normal）]
 *   例: node scripts/cpu-match.mjs 200 2 easy,normal
 * 席の並びによる有利・不利をならすため、最初の人は試合ごとに入れ替える。同点で勝ちを分け合ったら、勝ちを人数で割って数える
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 200; // 置く16回＋氷60枚より多くはならない

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
    const result = { finished: 0, stuck: 0, wins: Array(count).fill(0), fish: Array(count).fill(0), turns: [], ties: 0 };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ count, levels, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.turns.push(game.turnNumber);
        if (game.winners.length > 1) result.ties++;
        game.winners.forEach(w => { result.wins[w] += 1 / game.winners.length; });
        game.players.forEach(p => { result.fish[p.id] += game.score(p.id).fish; });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const count = Number(process.argv[3] ?? 2);
    const levels = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    if (levels.length !== count) throw new Error('席の数と強さの数が合いません');
    const started = Date.now();
    const r = runMatches({ games, count, levels });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${count}人：${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・手番の数 平均 ${avg(r.turns)}・同点 ${r.ties}`);
    levels.forEach((level, i) => console.log(`席${i}（${level}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%・魚の平均 ${(r.fish[i] / Math.max(1, r.finished)).toFixed(1)}`));
}
