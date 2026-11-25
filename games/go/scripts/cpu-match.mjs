/**
 * CPU 同士を多数回対局させて、勝率と1手の時間を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さA] [強さB] [盤の大きさ] [ばらす手数]
 *   例: node scripts/cpu-match.mjs 40 normal easy 9
 * CPU は同じ局面なら同じ手を打つ。そのままでは毎回同じ対局になるので、最初の数手（既定2手）をシード付きの乱数で打ってから CPU に任せる。
 * 試合ごとに席（黒・白）を入れ替える。コミは 6目半
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { createRandom } from '../public/js/random.js';

export function playMatch({ levels, seed, size = 9, opening = 2, komi = 6.5 }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })), { size, komi });
    const random = createRandom(seed);
    const times = [[], []];
    while (game.moveNumber < opening) {
        // 1線と2線を避けて、ばらす
        const moves = game.moves().filter(sq => {
            const r = Math.floor(sq / size);
            const c = sq % size;
            return Math.min(r, c, size - 1 - r, size - 1 - c) >= 2;
        });
        game.applyCommand(game.current, { type: 'move', sq: moves[Math.floor(random() * moves.length)] });
    }
    let steps = 0;
    const limit = size * size * 4;
    while (!game.isOver() && steps < limit) {
        const seat = game.actors().find(s => game.players[s].isCPU);
        const started = performance.now();
        if (!runCpuStep(game)) break; // 進まなかった
        const type = game.commands.at(-1).command.type;
        if (type === 'move' || type === 'pass') times[seat].push(performance.now() - started);
        steps++;
    }
    return { game, times };
}

export function runMatches({ games, a, b, size = 9, seedBase = 1, opening = 2, onGame }) {
    const r = { finished: 0, stuck: 0, winsA: 0, winsB: 0, draws: 0, resigns: 0, seatWins: [0, 0], marginA: 0, moves: 0, timesA: [], timesB: [] };
    for (let i = 0; i < games; i++) {
        const swap = i % 2 === 1;
        const { game, times } = playMatch({ levels: swap ? [b, a] : [a, b], seed: seedBase + Math.floor(i / 2), size, opening });
        r.timesA.push(...times[swap ? 1 : 0]);
        r.timesB.push(...times[swap ? 0 : 1]);
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        r.finished++;
        r.moves += game.moveNumber;
        if (game.result.reason === 'resign') r.resigns++;
        else r.marginA += swap ? -game.result.score.diff : game.result.score.diff;
        if (game.winner !== null) r.seatWins[game.winner]++;
        if (game.winner === null) r.draws++;
        else if ((game.winner === 0) !== swap) r.winsA++;
        else r.winsB++;
        onGame?.(i, game);
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
    const size = Number(process.argv[5] ?? 9);
    const opening = Number(process.argv[6] ?? 2);
    const r = runMatches({
        games, a, b, size, opening,
        onGame: (i, game) => process.stderr.write(`${i + 1}: ${game.players[0].name}(黒) 対 ${game.players[1].name}(白) ${game.moveNumber}手 ${game.result.reason === 'resign' ? '投了' : game.result.score.diff} → ${game.winner === null ? '持碁' : game.players[game.winner].name}\n`)
    });
    const pct = (v) => `${(v / Math.max(1, r.finished) * 100).toFixed(1)}%`;
    console.log(`${games}試合（${size}路、${a} 対 ${b}、最初の${opening}手はランダム）`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・投了 ${r.resigns}・平均 ${(r.moves / Math.max(1, r.finished)).toFixed(0)}手`);
    console.log(`${a} の勝ち ${pct(r.winsA)}・${b} の勝ち ${pct(r.winsB)}・持碁 ${pct(r.draws)}・${a} から見た目数の差（投了を除く）平均 ${(r.marginA / Math.max(1, r.finished - r.resigns)).toFixed(1)}`);
    console.log(`席ごと：黒 ${pct(r.seatWins[0])}・白 ${pct(r.seatWins[1])}`);
    console.log(`1手の時間：${a} ${timeText(r.timesA)}／${b} ${timeText(r.timesB)}`);
}
