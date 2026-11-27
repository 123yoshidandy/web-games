/**
 * CPU 同士を多数回対局させて、勝率と1手の時間を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さA] [強さB] [盤の大きさ] [ばらす手数]
 *   例: node scripts/cpu-match.mjs 20 strong normal 15
 *   引数なし（npm run cpu-match）なら、隣り合う強さの組（ふつう 対 やさしい、つよい 対 ふつう）を15路で続けて測る
 * CPU は同じ局面なら同じ手を打つ。そのままでは毎回同じ対局になるので、最初の数手（既定2手）を、真ん中の 5×5 にシード付きの乱数で置いてから CPU に任せる。
 * 五目並べは先手（黒）が有利なので、試合ごとに黒・白を入れ替える
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { createRandom } from '../public/js/random.js';

export function playMatch({ levels, seed, size = 15, opening = 2 }) {
    // 席0が黒
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true, cpuLevel: level })), { size, black: 0 });
    const random = createRandom(seed);
    const times = [[], []];
    const mid = Math.floor((size - 1) / 2);
    while (game.moveNumber < opening) {
        const moves = game.moves().filter(sq => Math.abs(Math.floor(sq / size) - mid) <= 2 && Math.abs((sq % size) - mid) <= 2);
        game.applyCommand(game.current, { type: 'move', sq: moves[Math.floor(random() * moves.length)] });
    }
    let steps = 0;
    const limit = size * size + 4;
    while (!game.isOver() && steps < limit) {
        const seat = game.current;
        const started = performance.now();
        if (!runCpuStep(game)) break; // 進まなかった
        times[seat].push(performance.now() - started);
        steps++;
    }
    return { game, times };
}

export function runMatches({ games, a, b, size = 15, seedBase = 1, opening = 2, onGame }) {
    const r = { finished: 0, stuck: 0, winsA: 0, winsB: 0, draws: 0, seatWins: [0, 0], moves: 0, timesA: [], timesB: [] };
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

function report({ games, a, b, size, opening }) {
    const r = runMatches({
        games, a, b, size, opening,
        onGame: (i, game) => process.stderr.write(`${i + 1}: ${game.players[0].name}(黒) 対 ${game.players[1].name}(白) ${game.moveNumber}手 → ${game.winner === null ? '引き分け' : game.players[game.winner].name}\n`)
    });
    const pct = (v) => `${(v / Math.max(1, r.finished) * 100).toFixed(1)}%`;
    console.log(`${games}試合（${size}路、${a} 対 ${b}、最初の${opening}手はランダム）`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・平均 ${(r.moves / Math.max(1, r.finished)).toFixed(0)}手`);
    console.log(`${a} の勝ち ${pct(r.winsA)}・${b} の勝ち ${pct(r.winsB)}・引き分け ${pct(r.draws)}`);
    console.log(`席ごと：黒 ${pct(r.seatWins[0])}・白 ${pct(r.seatWins[1])}`);
    console.log(`1手の時間：${a} ${timeText(r.timesA)}／${b} ${timeText(r.timesB)}`);
    return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const [count, a, b, size = 15, opening = 2] = process.argv.slice(2);
    const pairs = a && b ? [[a, b]] : [['normal', 'easy'], ['strong', 'normal']];
    let stuck = 0;
    for (const [x, y] of pairs) {
        stuck += report({ games: Number(count ?? 20), a: x, b: y, size: Number(size), opening: Number(opening) }).stuck;
        console.log('');
    }
    if (stuck) process.exitCode = 1;
}
