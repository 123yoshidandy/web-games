/**
 * CPU 同士を多数回対戦させて、勝率・ラウンドの数・1ラウンドの手数を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [席0の強さ] [席1の強さ]（normal・strong・random）
 *   例: node scripts/cpu-match.mjs 400 normal strong
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
    const wins = [0, 0];
    const result = { finished: 0, stuck: 0, rounds: [], turnsPerRound: [], roundScores: [], wins };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ profiles, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.rounds.push(game.round);
        result.turnsPerRound.push(game.commands.length / game.round);
        game.history.forEach(h => h.results.forEach(r => result.roundScores.push(r.score)));
        wins[game.winner]++;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const profiles = [process.argv[3] ?? 'normal', process.argv[4] ?? 'normal'];
    const started = Date.now();
    const r = runMatches({ games, profiles });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${profiles.join(' 対 ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}`);
    console.log(`ラウンドの数 平均 ${avg(r.rounds)}・1ラウンドの手数 平均 ${avg(r.turnsPerRound)}（2人の合計）・1ラウンドの点数 平均 ${avg(r.roundScores)}`);
    profiles.forEach((p, i) => console.log(`席${i}（${p}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%`));
}
