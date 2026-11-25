/**
 * CPU 同士を多数回対戦させて、勝率と点を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [席ごとの強さ（easy,normal,...）]
 *   例: node scripts/cpu-match.mjs 200 easy,normal
 * 最初の手番は試合ごとに入れ替える。同点で複数が勝ったときは等分する
 */

import Game, { pointsOf } from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 5000;

export function playMatch({ levels, seed }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })), { seed, startPlayer: seed % levels.length });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break;
        steps++;
    }
    return game;
}

export function runMatches({ games, levels, seedBase = 1 }) {
    const result = { finished: 0, stuck: 0, wins: levels.map(() => 0), draws: 0, scores: levels.map(() => []), turns: [] };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ levels, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        if (game.winners.length > 1) result.draws++;
        game.winners.forEach(w => { result.wins[w] += 1 / game.winners.length; });
        game.players.forEach((p, k) => result.scores[k].push(pointsOf(p)));
        result.turns.push(game.turn);
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const levels = (process.argv[3] ?? 'normal,normal').split(',');
    const started = Date.now();
    const r = runMatches({ games, levels });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・同点で分けた ${r.draws}・手番の数の平均 ${avg(r.turns)}`);
    levels.forEach((level, i) => console.log(`席${i}（${level}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%・点の平均 ${avg(r.scores[i])}`));
}
