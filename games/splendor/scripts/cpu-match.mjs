/**
 * CPU 同士を多数回対戦させて、勝率・巡の数・終わり方を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（normal,strong,...）]
 *   例: node scripts/cpu-match.mjs 400 2 normal,strong
 * 席の並びによる有利・不利をならすため、最初の手番は試合ごとに入れ替える
 */

import Game, { pointsOf } from '../public/js/game.js';
import { runCpuStep, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 2000;

export function playMatch({ count, profiles, seed }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true })), { seed, startPlayer: seed % count });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const before = game.commands.length;
        runCpuStep(game, game.current, PROFILES[profiles[game.current]]);
        if (game.commands.length === before) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, count, profiles, seedBase = 1 }) {
    const wins = Array(count).fill(0);
    const result = { finished: 0, stalled: 0, stuck: 0, rounds: [], points: [], wins };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ count, profiles, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        if (game.endReason === 'stalled') result.stalled++;
        result.rounds.push(Math.ceil(game.turn / count));
        result.points.push(Math.max(...game.players.map(pointsOf)));
        game.winners.forEach(id => { wins[id] += 1 / game.winners.length; });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const count = Number(process.argv[3] ?? 2);
    const profiles = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    if (profiles.length !== count) throw new Error('席の数と強さの数が合いません');
    const started = Date.now();
    const r = runMatches({ games, count, profiles });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    const sorted = [...r.rounds].sort((a, b) => a - b);
    console.log(`${games}試合（${count}人：${profiles.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・全員パスで終わった ${r.stalled}・進まなくなった ${r.stuck}`);
    console.log(`巡の数 平均 ${avg(r.rounds)}（最短 ${sorted[0]}・中央 ${sorted[Math.floor(sorted.length / 2)]}・最長 ${sorted.at(-1)}）・勝者の点数 平均 ${avg(r.points)}`);
    profiles.forEach((p, i) => console.log(`席${i}（${p}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%`));
}
