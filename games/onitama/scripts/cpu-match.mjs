/**
 * CPU 同士を多数回対戦させて、勝率を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さA] [強さB]
 *   例: node scripts/cpu-match.mjs 200 strong normal
 * 試合ごとに席（藍・朱）を入れ替える。先手は脇のカードの印の色で決まるので、シードで変わる
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export function playMatch({ levels, seed }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })), { seed });
    let steps = 0;
    while (!game.isOver() && steps < 1000) {
        if (!runCpuStep(game)) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, a, b, seedBase = 1 }) {
    const r = { finished: 0, stuck: 0, winsA: 0, winsB: 0, draws: 0, results: {}, plies: 0, ms: 0, seatWins: [0, 0], firstWins: 0 };
    for (let i = 0; i < games; i++) {
        const swap = i % 2 === 1;
        const started = Date.now();
        const game = playMatch({ levels: swap ? [b, a] : [a, b], seed: seedBase + i });
        r.ms += Date.now() - started;
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        r.finished++;
        r.plies += game.ply;
        r.results[game.result] = (r.results[game.result] ?? 0) + 1;
        if (game.winner !== null) {
            r.seatWins[game.winner]++;
            if (game.winner === game.first) r.firstWins++;
        }
        if (game.winner === null) r.draws++;
        else if ((game.winner === 0) !== swap) r.winsA++;
        else r.winsB++;
    }
    return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const a = process.argv[3] ?? 'normal';
    const b = process.argv[4] ?? 'easy';
    const r = runMatches({ games, a, b });
    const pct = (v) => `${(v / Math.max(1, r.finished) * 100).toFixed(1)}%`;
    console.log(`${games}試合（${a} 対 ${b}）${r.ms}ms・1手あたり ${(r.ms / Math.max(1, r.plies)).toFixed(1)}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・1試合あたり ${(r.plies / Math.max(1, r.finished)).toFixed(1)}手・決着 ${JSON.stringify(r.results)}`);
    console.log(`${a} の勝ち ${pct(r.winsA)}・${b} の勝ち ${pct(r.winsB)}・引き分け ${pct(r.draws)}`);
    console.log(`席ごと：藍 ${pct(r.seatWins[0])}・朱 ${pct(r.seatWins[1])}・先手の勝ち ${pct(r.firstWins)}`);
}
