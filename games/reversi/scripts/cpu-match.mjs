/**
 * CPU 同士を多数回対戦させて、勝率と1手の時間を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さA] [強さB] [ばらす手数]
 *   例: node scripts/cpu-match.mjs 200 strong normal
 * リバーシには乱数がなく、CPU は同じ局面なら同じ手を打つ。そのままでは毎回同じ試合になるので、
 * 最初の数手（既定4手）をシード付きの乱数で打ってから CPU に任せる。試合ごとに席（黒・白）を入れ替える
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { createRandom } from '../public/js/random.js';

export function playMatch({ levels, seed, opening = 4 }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })));
    const random = createRandom(seed);
    const times = [[], []];
    while (!game.isOver() && game.ply < opening) {
        const moves = game.moves();
        game.applyCommand(game.current, { type: 'move', sq: moves[Math.floor(random() * moves.length)] });
    }
    let steps = 0;
    while (!game.isOver() && steps < 100) {
        const seat = game.current;
        const started = performance.now();
        if (!runCpuStep(game)) break; // 進まなかった
        times[seat].push(performance.now() - started);
        steps++;
    }
    return { game, times };
}

export function runMatches({ games, a, b, seedBase = 1, opening = 4 }) {
    const r = { finished: 0, stuck: 0, winsA: 0, winsB: 0, draws: 0, seatWins: [0, 0], discsA: 0, timesA: [], timesB: [] };
    for (let i = 0; i < games; i++) {
        const swap = i % 2 === 1;
        const { game, times } = playMatch({ levels: swap ? [b, a] : [a, b], seed: seedBase + Math.floor(i / 2), opening });
        r.timesA.push(...times[swap ? 1 : 0]);
        r.timesB.push(...times[swap ? 0 : 1]);
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        r.finished++;
        const { black, white } = game.counts();
        r.discsA += swap ? white - black : black - white;
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
    return `平均 ${avg.toFixed(1)}ms・99% ${sorted[Math.floor(sorted.length * 0.99)].toFixed(0)}ms・最長 ${sorted.at(-1).toFixed(0)}ms`;
};

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const a = process.argv[3] ?? 'normal';
    const b = process.argv[4] ?? 'easy';
    const opening = Number(process.argv[5] ?? 4);
    const r = runMatches({ games, a, b, opening });
    const pct = (v) => `${(v / Math.max(1, r.finished) * 100).toFixed(1)}%`;
    console.log(`${games}試合（${a} 対 ${b}、最初の${opening}手はランダム）`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}`);
    console.log(`${a} の勝ち ${pct(r.winsA)}・${b} の勝ち ${pct(r.winsB)}・引き分け ${pct(r.draws)}・${a} から見た石の差 平均 ${(r.discsA / Math.max(1, r.finished)).toFixed(1)}`);
    console.log(`席ごと：黒 ${pct(r.seatWins[0])}・白 ${pct(r.seatWins[1])}`);
    console.log(`1手の時間：${a} ${timeText(r.timesA)}／${b} ${timeText(r.timesB)}`);
}
