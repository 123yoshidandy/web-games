/**
 * CPU 同士を多数回対戦させて、勝率と1手の時間を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さA] [強さB] [ばらす手数] [手数の上限]
 *   例: node scripts/cpu-match.mjs 40 strong normal
 * CPU は同じ局面なら同じ手を指す。そのままでは毎回同じ試合になるので、
 * 最初の数手（既定4手）をシード付きの乱数で指してから CPU に任せる。試合ごとに席（先手・後手）を入れ替える
 * 入玉で終わらない試合に備えて、手数の上限（既定 400手）で打ち切る（打ち切りは「終わらなかった」に数える）
 */

import Game from '../public/js/game.js';
import { runCpuStep, toCommand } from '../public/js/cpu-player.js';
import { createRandom } from '../public/js/random.js';

export function playMatch({ levels, seed, opening = 4, maxPly = 400 }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })));
    const random = createRandom(seed);
    const times = [[], []];
    while (!game.isOver() && game.ply < opening) {
        const moves = game.legalMoves();
        game.applyCommand(game.current, toCommand(moves[Math.floor(random() * moves.length)]));
    }
    while (!game.isOver() && game.ply < maxPly) {
        const seat = game.current;
        const started = performance.now();
        if (!runCpuStep(game)) break; // 進まなかった
        times[seat].push(performance.now() - started);
    }
    return { game, times };
}

export function runMatches({ games, a, b, seedBase = 1, opening = 4, maxPly = 400, onGame }) {
    const r = { finished: 0, stuck: 0, winsA: 0, winsB: 0, draws: 0, seatWins: [0, 0], reasons: {}, plies: [], timesA: [], timesB: [] };
    for (let i = 0; i < games; i++) {
        const swap = i % 2 === 1;
        const { game, times } = playMatch({ levels: swap ? [b, a] : [a, b], seed: seedBase + Math.floor(i / 2), opening, maxPly });
        r.timesA.push(...times[swap ? 1 : 0]);
        r.timesB.push(...times[swap ? 0 : 1]);
        onGame?.(i, game);
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        r.finished++;
        r.plies.push(game.ply);
        r.reasons[game.reason] = (r.reasons[game.reason] ?? 0) + 1;
        if (game.winner !== null) r.seatWins[game.winner]++;
        if (game.winner === null) r.draws++;
        else if ((game.winner === 0) !== swap) r.winsA++;
        else r.winsB++;
    }
    return r;
}

const timeText = (list) => {
    if (!list.length) return '-';
    const sorted = [...list].sort((x, y) => x - y);
    const avg = list.reduce((s, v) => s + v, 0) / list.length;
    return `平均 ${avg.toFixed(0)}ms・99% ${sorted[Math.floor(sorted.length * 0.99)].toFixed(0)}ms・最長 ${sorted.at(-1).toFixed(0)}ms`;
};

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 20);
    const a = process.argv[3] ?? 'normal';
    const b = process.argv[4] ?? 'easy';
    const opening = Number(process.argv[5] ?? 4);
    const maxPly = Number(process.argv[6] ?? 400);
    const r = runMatches({
        games, a, b, opening, maxPly,
        onGame: (i, game) => process.stderr.write(`${i + 1}: ${game.ply}手 ${game.reason ?? '打ち切り'} 勝ち=${game.winner ?? '-'}\n`)
    });
    const pct = (v) => `${(v / Math.max(1, r.finished) * 100).toFixed(1)}%`;
    const avgPly = r.plies.length ? (r.plies.reduce((s, v) => s + v, 0) / r.plies.length).toFixed(0) : '-';
    console.log(`${games}試合（${a} 対 ${b}、最初の${opening}手はランダム、${maxPly}手で打ち切り）`);
    console.log(`終わった ${r.finished}・終わらなかった ${r.stuck}・平均 ${avgPly}手・理由 ${JSON.stringify(r.reasons)}`);
    console.log(`${a} の勝ち ${pct(r.winsA)}・${b} の勝ち ${pct(r.winsB)}・引き分け ${pct(r.draws)}`);
    console.log(`席ごと：先手 ${pct(r.seatWins[0])}・後手 ${pct(r.seatWins[1])}`);
    console.log(`1手の時間：${a} ${timeText(r.timesA)}／${b} ${timeText(r.timesB)}`);
}
