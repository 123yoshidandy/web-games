/**
 * CPU 同士を多数回対戦させて、勝率・手番の数・勝ち方を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [席0の強さ] [席1の強さ]
 *   例: node scripts/cpu-match.mjs 400 normal strong
 *   強さ: easy・normal（画面で選べる）、strong（見落としのない比較用）
 * 先手の有利・不利をならすため、先手は試合ごとに入れ替える
 */

import Game from '../public/js/game.js';
import { runCpuStep, chooseCpuCommand, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 3000;

export function playMatch({ profiles, seed }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true, cpuLevel: p })), { seed, startPlayer: seed % 2 });
    let steps = 0, fallbacks = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const before = game.commands.length;
        const seat = game.current;
        const intended = JSON.stringify(chooseCpuCommand(game, seat, PROFILES[profiles[seat]]));
        runCpuStep(game, seat, PROFILES[profiles[seat]]);
        if (game.commands.length === before) break; // 進まなかった
        if (JSON.stringify(game.commands.at(-1).command) !== intended) fallbacks++;
        steps++;
    }
    return { game, fallbacks };
}

export function runMatches({ games, profiles, seedBase = 1 }) {
    const result = { finished: 0, stalled: 0, stuck: 0, fallbacks: 0, turns: [], wins: [0, 0], reasons: {}, firstWins: 0 };
    for (let i = 0; i < games; i++) {
        const { game, fallbacks } = playMatch({ profiles, seed: seedBase + i });
        result.fallbacks += fallbacks;
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        if (game.endReason === 'stalled') result.stalled++;
        result.reasons[game.endReason] = (result.reasons[game.endReason] ?? 0) + 1;
        result.turns.push(game.turn);
        game.winners.forEach(id => {
            result.wins[id] += 1 / game.winners.length;
            if (id === game.startPlayer) result.firstWins += 1 / game.winners.length;
        });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const profiles = [process.argv[3] ?? 'normal', process.argv[4] ?? 'normal'];
    if (profiles.some(p => !PROFILES[p])) throw new Error(`強さは ${Object.keys(PROFILES).join('・')} のどれかです`);
    const started = Date.now();
    const r = runMatches({ games, profiles });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    const sorted = [...r.turns].sort((a, b) => a - b);
    const pct = (n) => `${(n / Math.max(1, r.finished) * 100).toFixed(1)}%`;
    console.log(`${games}試合（${profiles.join(' 対 ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・何もできずに終わった ${r.stalled}・進まなくなった ${r.stuck}・手が断られた ${r.fallbacks}`);
    console.log(`手番の数 平均 ${avg(r.turns)}（最短 ${sorted[0]}・中央 ${sorted[Math.floor(sorted.length / 2)]}・最長 ${sorted.at(-1)}）`);
    console.log(`勝ち方 ${Object.entries(r.reasons).map(([k, v]) => `${k} ${v}`).join('・')}・先手の勝率 ${pct(r.firstWins)}`);
    profiles.forEach((p, i) => console.log(`席${i}（${p}）の勝率 ${pct(r.wins[i])}`));
}
