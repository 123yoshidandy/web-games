/**
 * CPU 同士を多数回対戦させて、勝率・手番の数・点数を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（normal,strong,random）]
 *   例: node scripts/cpu-match.mjs 400 3 normal,normal,strong
 */

import Game from '../public/js/game.js';
import { runCpuStep, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 5000;

export function playMatch({ profiles, seed }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true })), { seed });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game, game.current, PROFILES[profiles[game.current]])) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, profiles, seedBase = 1 }) {
    const count = profiles.length;
    const wins = Array(count).fill(0);
    const result = { finished: 0, stuck: 0, turns: [], scores: Array.from({ length: count }, () => []), wins };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ profiles, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        // 1人あたりの手番の数
        result.turns.push(game.turn / count);
        game.results.forEach(r => result.scores[r.seat].push(r.score));
        wins[game.winner]++;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const count = Number(process.argv[3] ?? 3);
    const profiles = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    if (profiles.length !== count) throw new Error('席の数と強さの数が合いません');
    const started = Date.now();
    const r = runMatches({ games, profiles });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    const sorted = [...r.turns].sort((a, b) => a - b);
    console.log(`${games}試合（${count}人：${profiles.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}`);
    console.log(`1人あたりの手番 平均 ${avg(r.turns)}（最短 ${sorted[0]?.toFixed(1)}・中央 ${sorted[Math.floor(sorted.length / 2)]?.toFixed(1)}・最長 ${sorted.at(-1)?.toFixed(1)}）`);
    profiles.forEach((p, i) => console.log(`席${i}（${p}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%・点数の平均 ${avg(r.scores[i])}`));
}
