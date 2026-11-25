/**
 * CPU 同士を多数回対戦させて、勝率と平均の送電都市数を数える
 * 席の並び（最初の番の人はシードで決まる）で有利不利が出ないように、試合ごとに強さの並びを1つずつずらす
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さの並び（easy,normal,...）]
 *   例: node scripts/cpu-match.mjs 400 easy,normal,easy
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 20000;

export function playMatch({ levels, seed }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })), { seed });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break; // 進まなかった
        steps++;
    }
    return game;
}

// 結果は「強さの並びの何番目か」ごとに数える
export function runMatches({ games, levels, seedBase = 1, rotate = true }) {
    const n = levels.length;
    const result = { finished: 0, stuck: 0, wins: Array(n).fill(0), scores: Array(n).fill(0), rounds: 0 };
    for (let i = 0; i < games; i++) {
        const shift = rotate ? i % n : 0;
        const seated = levels.map((_, s) => levels[(s + shift) % n]);
        const game = playMatch({ levels: seated, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.rounds += game.round;
        game.players.forEach((p, s) => {
            const who = (s + shift) % n;
            if (game.winners.includes(s)) result.wins[who] += 1 / game.winners.length;
            result.scores[who] += game.final[s].powered;
        });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const levels = (process.argv[3] ?? 'easy,normal').split(',');
    const started = Date.now();
    const r = runMatches({ games, levels });
    const f = Math.max(1, r.finished);
    console.log(`${games}試合（${levels.length}人：${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・平均 ${(r.rounds / f).toFixed(1)}巡`);
    levels.forEach((level, i) => console.log(`${i + 1}番目（${level}）の勝率 ${(r.wins[i] / f * 100).toFixed(1)}%・平均 ${(r.scores[i] / f).toFixed(1)}都市`));
}
