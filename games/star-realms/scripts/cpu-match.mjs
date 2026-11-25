/**
 * CPU 同士を多数回対戦させて、勝率と手番の数を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [席0の強さ,席1の強さ（easy・normal）]
 *   例: node scripts/cpu-match.mjs 400 normal,easy
 * 先手は、シードから決まる（席ごとの勝率に先手の有利が偏らないよう、試合ごとに入れ替わる）
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 5000;

export function playMatch({ levels, seed }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })), { seed });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, levels, seedBase = 1 }) {
    const result = { finished: 0, stuck: 0, wins: [0, 0], firstWins: 0, turns: 0 };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ levels, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.wins[game.winner]++;
        if (game.winner === game.options.startPlayer) result.firstWins++;
        result.turns += game.turnNumber;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const levels = (process.argv[3] ?? 'normal,normal').split(',');
    if (levels.length !== 2) throw new Error('強さは2つ（席0,席1）で指定します');
    const started = Date.now();
    const r = runMatches({ games, levels });
    const pct = (n) => `${(n / Math.max(1, r.finished) * 100).toFixed(1)}%`;
    console.log(`${games}試合（${levels.join(' 対 ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・平均 ${(r.turns / Math.max(1, r.finished)).toFixed(1)}手番・先手の勝率 ${pct(r.firstWins)}`);
    levels.forEach((level, i) => console.log(`席${i}（${level}）の勝率 ${pct(r.wins[i])}（${r.wins[i]}勝）`));
}
