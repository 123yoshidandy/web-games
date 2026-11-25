/**
 * CPU 同士を多数回対戦させて、勝率・得点・手数・終わり方を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（easy,normal）]
 *   例: node scripts/cpu-match.mjs 100 2 normal,easy
 * 勢力とマットは試合ごとにランダム。手番の順はマットで決まるので、強さは席ではなく名前で数える
 */

import Game from '../public/js/game.js';
import { runCpuStep, cpuActors, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 6000;

export function playMatch({ profiles, seed }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}#${i}`, isCPU: true })), { seed });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = cpuActors(game)[0];
        const level = game.players[seat]?.name.split('#')[0];
        if (seat === undefined || !runCpuStep(game, seat, PROFILES[level])) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, profiles, seedBase = 1 }) {
    const wins = Array(profiles.length).fill(0);
    const result = { finished: 0, stuck: 0, capped: 0, turns: [], scores: profiles.map(() => []), stars: profiles.map(() => []), wins, combats: 0 };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ profiles, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        if (game.endReason?.includes('上限')) result.capped++;
        result.turns.push(game.turnCount / profiles.length);
        result.combats += game.logs.filter(l => l.startsWith('戦闘：')).length;
        const results = game.results();
        game.players.forEach(p => {
            const index = Number(p.name.split('#')[1]);
            result.scores[index].push(results[p.id].total);
            result.stars[index].push(p.starCount);
            if (game.winners.includes(p.id)) wins[index] += 1 / game.winners.length;
        });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 50);
    const count = Number(process.argv[3] ?? 2);
    const profiles = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    if (profiles.length !== count) throw new Error('席の数と強さの数が合いません');
    if (profiles.some(p => !PROFILES[p])) throw new Error(`強さは ${Object.keys(PROFILES).join('・')} のどれかです`);
    const started = Date.now();
    const r = runMatches({ games, profiles });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    const sorted = [...r.turns].sort((a, b) => a - b);
    console.log(`${games}試合（${count}人：${profiles.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}（うち手番の上限 ${r.capped}）・進まなくなった ${r.stuck}・戦闘 平均${(r.combats / Math.max(1, r.finished)).toFixed(1)}回`);
    console.log(`1人あたりの手番 平均 ${avg(r.turns)}（最短 ${sorted[0]}・中央 ${sorted[Math.floor(sorted.length / 2)]}・最長 ${sorted.at(-1)}）`);
    profiles.forEach((p, i) => console.log(`${i}番（${p}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%・得点の平均 ${avg(r.scores[i])}・星の平均 ${avg(r.stars[i])}`));
}
