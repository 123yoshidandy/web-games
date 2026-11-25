/**
 * CPU 同士を多数回対戦させて、勝率と得点を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（easy,normal）]
 *   例: node scripts/cpu-match.mjs 500 3 easy,normal,easy
 * 太陽駒の組と最初の人はシードで変わるので、試合を重ねれば席の有利・不利はならされる
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

export function runMatches({ games, count, levels, seedBase = 1 }) {
    const result = { finished: 0, stuck: 0, wins: Array(count).fill(0), points: Array(count).fill(0), auctions: 0, raCalls: 0 };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ count, levels, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.wins[game.winner] += 1;
        game.players.forEach(p => { result.points[p.id] += p.score; });
        game.commands.forEach(c => {
            if (c.command.type === 'bid') result.auctions++;
            if (c.command.type === 'ra') result.raCalls++;
        });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const count = Number(process.argv[3] ?? 3);
    const levels = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    if (levels.length !== count) throw new Error('席の数と強さの数が合いません');
    const started = Date.now();
    const r = runMatches({ games, count, levels });
    const avg = (v) => (v / Math.max(1, r.finished)).toFixed(1);
    console.log(`${games}試合（${count}人：${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・1試合あたり 出した太陽駒 ${avg(r.auctions)}・ラー宣言した ${avg(r.raCalls)}`);
    levels.forEach((level, i) => console.log(`席${i}（${level}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%・平均 ${avg(r.points[i])}点`));
}
