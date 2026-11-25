/**
 * CPU 同士を多数回対戦させて、勝率と平均点を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（easy,normal）]
 *   例: node scripts/cpu-match.mjs 400 2 easy,normal
 * 席による有利を消すため、試合ごとに強さの並びを1つずつずらす（席0の強さは、試合 i では levels[(0 + i) % 人数]）
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 3000;

export function playMatch({ levels, seed }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })), { seed });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break; // 進まなかった
        steps++;
    }
    return game;
}

// 強さごとに、勝ち（同点の勝ちは等分）・点の合計・席の数を数える
export function runMatches({ games, levels, seedBase = 1 }) {
    const kinds = [...new Set(levels)];
    const result = { finished: 0, stuck: 0, wins: {}, scores: {}, seats: {} };
    kinds.forEach(k => { result.wins[k] = 0; result.scores[k] = 0; result.seats[k] = 0; });
    for (let i = 0; i < games; i++) {
        const rotated = levels.map((_, s) => levels[(s + i) % levels.length]);
        const game = playMatch({ levels: rotated, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        game.winners.forEach(id => { result.wins[rotated[id]] += 1 / game.winners.length; });
        game.players.forEach((p, id) => {
            result.scores[rotated[id]] += p.score;
            result.seats[rotated[id]] += 1;
        });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const count = Number(process.argv[3] ?? 2);
    const levels = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    if (levels.length !== count) throw new Error('席の数と強さの数が合いません');
    const started = Date.now();
    const r = runMatches({ games, levels });
    console.log(`${games}試合（${count}人：${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}`);
    Object.keys(r.wins).forEach(level => {
        const per = levels.filter(l => l === level).length;
        console.log(`${level}（${per}席）：1席あたりの勝率 ${(r.wins[level] / per / Math.max(1, r.finished) * 100).toFixed(1)}%・平均 ${(r.scores[level] / Math.max(1, r.seats[level])).toFixed(1)}点`);
    });
}
