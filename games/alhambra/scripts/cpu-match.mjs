/**
 * CPU 同士を多数回対戦させて、勝率・得点・手番の数を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [席ごとの強さ（easy,normal,...）]
 *   例: node scripts/cpu-match.mjs 200 easy,normal
 *   強さ: easy・normal（画面で選べる）、strong（見落としのない比較用）。2〜6人
 */

import Game from '../public/js/game.js';
import { runCpuStep, chooseCpuCommand, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 6000;
// 項目の並び順によらずに、操作を比べる
const stable = (command) => JSON.stringify(Object.fromEntries(Object.entries(command ?? {}).sort(([a], [b]) => a.localeCompare(b))));

export function playMatch({ profiles, seed }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true, cpuLevel: p })), { seed });
    let steps = 0, fallbacks = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = game.actors()[0];
        const before = game.commands.length;
        const intended = stable(chooseCpuCommand(game, seat, PROFILES[profiles[seat]]));
        runCpuStep(game, seat, PROFILES[profiles[seat]]);
        if (game.commands.length === before) break; // 進まなかった
        if (stable(game.commands.at(-1).command) !== intended) fallbacks++;
        steps++;
    }
    return { game, fallbacks };
}

export function runMatches({ games, profiles, seedBase = 1 }) {
    const n = profiles.length;
    const result = { finished: 0, stuck: 0, fallbacks: 0, wins: Array(n).fill(0), totals: Array.from({ length: n }, () => []), turns: [] };
    for (let i = 0; i < games; i++) {
        const { game, fallbacks } = playMatch({ profiles, seed: seedBase + i });
        result.fallbacks += fallbacks;
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        game.players.forEach((p, seat) => result.totals[seat].push(p.score));
        result.turns.push(game.turn);
        game.winners.forEach(id => { result.wins[id] += 1 / game.winners.length; });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const profiles = (process.argv[3] ?? 'normal,normal').split(',');
    if (profiles.some(p => !PROFILES[p])) throw new Error(`強さは ${Object.keys(PROFILES).join('・')} のどれかです`);
    const started = Date.now();
    const r = runMatches({ games, profiles });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${profiles.join(' 対 ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・手が断られた ${r.fallbacks}・手番の数 平均 ${avg(r.turns)}`);
    profiles.forEach((p, i) => console.log(`席${i}（${p}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%・平均 ${avg(r.totals[i])}点`));
}
