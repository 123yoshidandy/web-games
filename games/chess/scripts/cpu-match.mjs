/**
 * CPU 同士を多数回対戦させて、勝率・終わり方・1手の時間を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さA] [強さB] [ばらす手数]
 *   例: node scripts/cpu-match.mjs 100 strong normal
 * チェスには乱数がなく、CPU は同じ局面なら同じ手を指す。そのままでは毎回同じ試合になるので、
 * 最初の数手（既定 4手＝両者2手ずつ）をシード付きの乱数で指してから CPU に任せる。試合ごとに席（白・黒）を入れ替える
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { createRandom } from '../public/js/random.js';

const MAX_PLIES = 400;

export function playMatch({ levels, seed, opening = 4 }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })));
    const random = createRandom(seed);
    const times = [[], []];
    while (!game.isOver() && game.ply < opening) {
        const moves = game.moves();
        const m = moves[Math.floor(random() * moves.length)];
        game.applyCommand(game.current, { type: 'move', from: m.from, to: m.to, ...(m.promo ? { promo: m.promo } : {}) });
    }
    while (!game.isOver() && game.ply < MAX_PLIES) {
        const seat = game.current;
        const started = performance.now();
        if (!runCpuStep(game)) break; // 進まなかった
        times[seat].push(performance.now() - started);
    }
    return { game, times };
}

export function runMatches({ games, a, b, seedBase = 1, opening = 4 }) {
    const r = { finished: 0, stuck: 0, winsA: 0, winsB: 0, draws: 0, seatWins: [0, 0], reasons: {}, plies: [], timesA: [], timesB: [] };
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
        r.plies.push(game.ply);
        r.reasons[game.result.reason] = (r.reasons[game.result.reason] ?? 0) + 1;
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
    const started = Date.now();
    const r = runMatches({ games, a, b, opening });
    const pct = (v) => `${(v / Math.max(1, r.finished) * 100).toFixed(1)}%`;
    const avgPly = r.plies.reduce((s, v) => s + v, 0) / Math.max(1, r.plies.length);
    console.log(`${games}試合（${a} 対 ${b}、最初の${opening}手はランダム）${((Date.now() - started) / 1000).toFixed(0)}秒`);
    console.log(`終わった ${r.finished}・${MAX_PLIES}手で終わらなかった ${r.stuck}・平均 ${avgPly.toFixed(0)}手（片方ずつ数えて）`);
    console.log(`${a} の勝ち ${pct(r.winsA)}・${b} の勝ち ${pct(r.winsB)}・引き分け ${pct(r.draws)}`);
    console.log(`終わり方：${Object.entries(r.reasons).map(([k, v]) => `${k} ${v}`).join('・')}`);
    console.log(`席ごと：白 ${pct(r.seatWins[0])}・黒 ${pct(r.seatWins[1])}`);
    console.log(`1手の時間：${a} ${timeText(r.timesA)}／${b} ${timeText(r.timesB)}`);
}
