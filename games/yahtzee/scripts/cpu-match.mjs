/**
 * CPU 同士を多数回対戦させて、得点の平均・分布・ボーナスの率・勝率を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [席ごとの強さ（easy,normal,strong,random）]
 *   例: node scripts/cpu-match.mjs 1000 strong          （1人で遊んだときの平均点）
 *       node scripts/cpu-match.mjs 1000 normal,easy     （2人の勝率）
 */

import Game from '../public/js/game.js';
import { runCpuStep, cpuActors, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 1000;

export function playMatch({ profiles, seed }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true })), { seed });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = cpuActors(game)[0];
        if (seat === undefined || !runCpuStep(game, seat, PROFILES[profiles[seat]])) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, profiles, seedBase = 1 }) {
    const count = profiles.length;
    const seats = () => Array.from({ length: count }, () => []);
    const result = { finished: 0, stuck: 0, totals: seats(), bonus: Array(count).fill(0), yahtzee: Array(count).fill(0), wins: Array(count).fill(0) };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ profiles, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        game.results().forEach(r => {
            result.totals[r.seat].push(r.total);
            if (r.upperBonus > 0) result.bonus[r.seat]++;
        });
        game.players.forEach(p => { if (p.scores.yahtzee === 50) result.yahtzee[p.id]++; });
        game.winners.forEach(id => { result.wins[id] += 1 / game.winners.length; });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 500);
    const profiles = (process.argv[3] ?? 'strong').split(',');
    if (profiles.some(p => !PROFILES[p])) throw new Error(`強さは ${Object.keys(PROFILES).join('・')} のどれかです`);
    const started = Date.now();
    const r = runMatches({ games, profiles });
    const pct = (n) => `${(n / Math.max(1, r.finished) * 100).toFixed(1)}%`;
    console.log(`${games}試合（${profiles.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}`);
    profiles.forEach((p, i) => {
        const list = [...r.totals[i]].sort((a, b) => a - b);
        const avg = list.reduce((s, v) => s + v, 0) / Math.max(1, list.length);
        const sd = Math.sqrt(list.reduce((s, v) => s + (v - avg) ** 2, 0) / Math.max(1, list.length));
        const q = (x) => list[Math.floor((list.length - 1) * x)];
        const win = profiles.length > 1 ? `・勝率 ${pct(r.wins[i])}` : '';
        console.log(`席${i}（${p}）平均 ${avg.toFixed(1)}（標準偏差 ${sd.toFixed(1)}・中央 ${q(0.5)}・最低 ${list[0]}・最高 ${list.at(-1)}）`
            + `・上段ボーナス ${pct(r.bonus[i])}・ヤッツィー ${pct(r.yahtzee[i])}${win}`);
    });
}
