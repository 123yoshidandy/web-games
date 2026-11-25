/**
 * CPU 同士を多数回対局させて、最後まで終わるか・止まらないか・局の結果の内訳を数える
 * 使い方: node scripts/cpu-match.mjs [対局数] [east|south]
 *   例: node scripts/cpu-match.mjs 100 south
 */

import Game from '../public/js/game.js';
import { runCpuStep, cpuActors } from '../public/js/cpu-player.js';

const MAX_STEPS = 40000;

export function playMatch({ seed, length = 'east' }) {
    const game = new Game(['A', 'B', 'C', 'D'].map(name => ({ name, isCPU: true })), { seed, length });
    const hands = [];
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = cpuActors(game)[0];
        if (seat === undefined || !runCpuStep(game, seat)) break; // 進まなかった
        if (game.phase === 'result' && hands.at(-1) !== game.result) hands.push(game.result);
        steps++;
    }
    return { game, hands, steps };
}

export function runMatches({ games, length = 'east', seedBase = 1 }) {
    const result = { finished: 0, stuck: [], hands: 0, wins: 0, tsumo: 0, ron: 0, draws: {}, yaku: {}, steps: 0, riichi: 0, calls: 0 };
    for (let i = 0; i < games; i++) {
        const { game, hands, steps } = playMatch({ seed: seedBase + i, length });
        result.steps += steps;
        if (!game.isOver()) {
            result.stuck.push(seedBase + i);
            continue;
        }
        result.finished++;
        hands.forEach(h => {
            result.hands++;
            if (h.type === 'win') {
                h.wins.forEach(w => {
                    result.wins++;
                    result[w.tsumo ? 'tsumo' : 'ron']++;
                    if (w.riichi) result.riichi++;
                    if (w.melds.some(m => m.type !== 'ankan')) result.calls++;
                    w.yaku.forEach(y => { result.yaku[y.name] = (result.yaku[y.name] ?? 0) + 1; });
                });
            } else {
                result.draws[h.reason] = (result.draws[h.reason] ?? 0) + 1;
            }
        });
        const total = game.players.reduce((s, p) => s + p.score, 0);
        if (total !== 100000) throw new Error(`点数の合計が合いません（シード ${seedBase + i}: ${total}）`);
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 50);
    const length = process.argv[3] ?? 'east';
    const started = Date.now();
    const r = runMatches({ games, length });
    console.log(`${games}対局（${length === 'south' ? '半荘戦' : '東風戦'}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck.length}${r.stuck.length ? `（シード ${r.stuck.join(', ')}）` : ''}`);
    console.log(`局 ${r.hands}（1対局あたり ${(r.hands / Math.max(1, r.finished)).toFixed(1)}）・和了 ${r.wins}（ツモ ${r.tsumo}・ロン ${r.ron}・立直 ${r.riichi}・鳴き ${r.calls}）`);
    console.log(`流局 ${JSON.stringify(r.draws)}`);
    const yaku = Object.entries(r.yaku).sort((a, b) => b[1] - a[1]).map(([name, n]) => `${name} ${n}`).join('・');
    console.log(`役 ${yaku}`);
}
