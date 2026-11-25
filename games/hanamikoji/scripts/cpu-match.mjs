/**
 * CPU 同士を多数回対戦させて、勝率・ラウンドの数・勝ち方を数える
 * 席による有利・不利を消すため、試合ごとに席を入れ替える
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さA] [強さB]（easy・normal・strong・random）
 *   例: node scripts/cpu-match.mjs 400 normal easy
 */

import Game from '../public/js/game.js';
import { runCpuStep, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 2000;

// profiles：席0・席1の強さ
export function playMatch({ profiles, seed }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true })), { seed });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = game.actor();
        if (!runCpuStep(game, seat, PROFILES[profiles[seat]])) break; // 進まなかった
        steps++;
    }
    return game;
}

// A と B を、席を入れ替えながら対戦させる。wins は [A, B]
export function runMatches({ games, a, b, seedBase = 1 }) {
    const result = { finished: 0, stuck: 0, rounds: [], wins: [0, 0], reasons: { points: 0, geishas: 0 } };
    for (let i = 0; i < games; i++) {
        const swap = i % 2 === 1;
        const game = playMatch({ profiles: swap ? [b, a] : [a, b], seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.rounds.push(game.round);
        result.reasons[game.history.at(-1).reason]++;
        const winnerIsA = (game.winner === 0) !== swap;
        result.wins[winnerIsA ? 0 : 1]++;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const a = process.argv[3] ?? 'normal';
    const b = process.argv[4] ?? 'easy';
    const started = Date.now();
    const r = runMatches({ games, a, b });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(2);
    console.log(`${games}試合（${a} 対 ${b}、席は交互）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}`);
    console.log(`ラウンドの数 平均 ${avg(r.rounds)}・最大 ${Math.max(...r.rounds)}。決まり方 11点 ${r.reasons.points}・芸者4人 ${r.reasons.geishas}`);
    console.log(`${a} の勝率 ${(r.wins[0] / Math.max(1, r.finished) * 100).toFixed(1)}%（${r.wins[0]}勝${r.wins[1]}敗）`);
}
