/**
 * CPU 同士を多数回対戦させて、勝率と勝ち方を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [席ごとの強さ（easy,normal）]
 *   例: node scripts/cpu-match.mjs 400 easy,normal
 * 先手による有利・不利をならすため、先手は試合ごとに入れ替える
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 1000;

export function playMatch({ levels, seed }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })), { seed, startPlayer: seed % 2 });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, levels, seedBase = 1 }) {
    const result = { finished: 0, stuck: 0, wins: [0, 0], draws: 0, victories: { military: 0, science: 0, civil: 0, draw: 0 }, scores: [] };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ levels, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.victories[game.victory] += 1;
        if (game.winner === null) result.draws++;
        else result.wins[game.winner] += 1;
        if (game.victory !== 'military' && game.victory !== 'science') result.scores.push(game.score(0).total, game.score(1).total);
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const levels = (process.argv[3] ?? 'normal,normal').split(',');
    if (levels.length !== 2) throw new Error('強さは2つ書いてください');
    const started = Date.now();
    const r = runMatches({ games, levels });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    const pct = (n) => `${(n / Math.max(1, r.finished) * 100).toFixed(1)}%`;
    console.log(`${games}試合（${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・引き分け ${r.draws}`);
    console.log(`勝ち方：軍事 ${pct(r.victories.military)}・科学 ${pct(r.victories.science)}・点 ${pct(r.victories.civil)}・点の平均 ${avg(r.scores)}`);
    levels.forEach((level, i) => console.log(`席${i}（${level}）の勝率 ${pct(r.wins[i])}`));
}
