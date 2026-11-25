/**
 * CPU 同士を多数回対戦させて、勝率と点を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [席ごとの強さ（easy,normal,...）] [得点法 basic|advanced]
 *   例: node scripts/cpu-match.mjs 200 easy,normal
 * 先手（青）は試合ごとに入れ替える。引き分けは勝った人で等分する
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 200;

export function playMatch({ levels, seed, scoring = 'advanced' }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })), { seed, startPlayer: seed % levels.length, scoring });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break;
        steps++;
    }
    return game;
}

export function runMatches({ games, levels, seedBase = 1, scoring }) {
    const result = { finished: 0, stuck: 0, wins: levels.map(() => 0), draws: 0, scores: levels.map(() => []) };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ levels, seed: seedBase + i, scoring });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        if (game.winners.length > 1) result.draws++;
        game.winners.forEach(w => { result.wins[w] += 1 / game.winners.length; });
        game.scores().forEach((s, k) => result.scores[k].push(s));
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const levels = (process.argv[3] ?? 'normal,normal').split(',');
    const scoring = process.argv[4] ?? 'advanced';
    const started = Date.now();
    const r = runMatches({ games, levels, scoring });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${levels.join(' / ')}・${scoring}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・引き分け ${r.draws}`);
    levels.forEach((level, i) => console.log(`席${i}（${level}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%・点の平均 ${avg(r.scores[i])}`));
}
