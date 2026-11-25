/**
 * CPU 同士を多数回対戦させて、ジャック側と刑事側の勝率を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [ジャック側の強さ,刑事側の強さ]
 *   例: node scripts/cpu-match.mjs 200 normal,easy
 */

import Game, { JACK } from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export function playMatch({ jack, detective, seed }) {
    const game = new Game([{ name: 'J', isCPU: true, cpuLevel: jack }, { name: 'D', isCPU: true, cpuLevel: detective }], { seed });
    let steps = 0;
    while (!game.isOver() && steps < 100) {
        if (!runCpuStep(game)) break;
        steps++;
    }
    return game;
}

export function runMatches({ games, jack, detective, seedBase = 1 }) {
    const r = { finished: 0, stuck: 0, jackWins: 0, reasons: {}, rounds: 0 };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ jack, detective, seed: seedBase + i });
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        r.finished++;
        r.rounds += game.round;
        if (game.winner === JACK) r.jackWins++;
        r.reasons[game.endReason] = (r.reasons[game.endReason] ?? 0) + 1;
    }
    return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const [jack, detective] = (process.argv[3] ?? 'normal,normal').split(',');
    const started = Date.now();
    const r = runMatches({ games, jack, detective });
    const pct = (v) => (v / Math.max(1, r.finished) * 100).toFixed(1);
    console.log(`${games}試合（ジャック側 ${jack} / 刑事側 ${detective}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・平均ラウンド ${(r.rounds / Math.max(1, r.finished)).toFixed(1)}・終わり方 ${JSON.stringify(r.reasons)}`);
    console.log(`ジャック側の勝率 ${pct(r.jackWins)}%・刑事側の勝率 ${pct(r.finished - r.jackWins)}%`);
}
