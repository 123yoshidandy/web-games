/**
 * CPU 同士を多数回対戦させて、勝率を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（easy,normal）]
 *   例: node scripts/cpu-match.mjs 400 4 normal,easy,easy,easy
 * 最初の人はシードで変わるので、試合を重ねれば席の有利・不利はならされる
 * 引き分けは、引き分けた人数で割って勝ちに数える（2人の引き分けなら 0.5 勝ずつ）
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 200;

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
    const count = levels.length;
    const result = { finished: 0, stuck: 0, wins: Array(count).fill(0), ties: 0, tiles: 0, dragons: 0 };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ levels, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        if (game.winners.length > 1) result.ties++;
        game.winners.forEach(s => { result.wins[s] += 1 / game.winners.length; });
        result.tiles += game.placed;
        if (game.events.some(e => e.type === 'dragon') || game.logs.some(l => l.includes('竜のタイル'))) result.dragons++;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const count = Number(process.argv[3] ?? 4);
    const levels = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    if (levels.length !== count) throw new Error('席の数と強さの数が合いません');
    const started = Date.now();
    const r = runMatches({ games, levels });
    const per = (v) => (v / Math.max(1, r.finished)).toFixed(1);
    console.log(`${games}試合（${count}人：${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・引き分け ${r.ties}・竜のタイルが出た ${r.dragons}・1試合あたり置いたタイル ${per(r.tiles)}`);
    levels.forEach((level, i) => console.log(`席${i}（${level}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%`));
}
