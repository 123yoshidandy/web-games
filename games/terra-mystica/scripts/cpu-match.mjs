/**
 * CPU 同士を多数回対戦させて、勝率・得点・手数・終わり方を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（easy,normal,strong）]
 *   例: node scripts/cpu-match.mjs 50 4 normal,easy,easy,easy
 * 勢力と手番の順はシードで変わるので、席による有利・不利は試合数で均される
 */

import Game from '../public/js/game.js';
import { runCpuStep, cpuActors, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 4000;

export function playMatch({ profiles, seed, factions }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true })), { seed, factions });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = cpuActors(game)[0];
        if (seat === undefined || !runCpuStep(game, seat, PROFILES[profiles[seat]])) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, profiles, seedBase = 1, onGame }) {
    const count = profiles.length;
    const wins = Array(count).fill(0);
    const result = { finished: 0, stuck: 0, steps: [], scores: Array.from({ length: count }, () => []), wins, factionScores: {}, factionWins: {} };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ profiles, seed: seedBase + i });
        onGame?.(game, i);
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.steps.push(game.commands.length);
        game.players.forEach(p => {
            result.scores[p.id].push(p.res.VP);
            (result.factionScores[p.faction] ??= []).push(p.res.VP);
        });
        game.state.winners.forEach(id => {
            wins[id] += 1 / game.state.winners.length;
            const f = game.players[id].faction;
            result.factionWins[f] = (result.factionWins[f] ?? 0) + 1 / game.state.winners.length;
        });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 20);
    const count = Number(process.argv[3] ?? 4);
    const profiles = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    if (profiles.length !== count) throw new Error('席の数と強さの数が合いません');
    if (profiles.some(p => !PROFILES[p])) throw new Error(`強さは ${Object.keys(PROFILES).join('・')} のどれかです`);
    const started = Date.now();
    const r = runMatches({ games, profiles, seedBase: Number(process.argv[5] ?? 1) });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    const sorted = [...r.steps].sort((a, b) => a - b);
    console.log(`${games}試合（${count}人：${profiles.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}`);
    console.log(`操作の数 平均 ${avg(r.steps)}（最少 ${sorted[0]}・中央 ${sorted[Math.floor(sorted.length / 2)]}・最多 ${sorted.at(-1)}）`);
    profiles.forEach((p, i) => console.log(`席${i}（${p}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%・得点の平均 ${avg(r.scores[i])}`));
    console.log('勢力ごとの得点の平均（試合数・勝率）：' + Object.entries(r.factionScores).sort().map(([f, list]) => `${f} ${avg(list)}（${list.length}・${((r.factionWins[f] ?? 0) / list.length * 100).toFixed(0)}%）`).join('、'));
}
