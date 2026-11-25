/**
 * CPU 同士を多数回対戦させて、勝率・コイン・手数・終わり方を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（easy,normal）]
 *   例: node scripts/cpu-match.mjs 200 4 normal,easy,easy,easy
 * 最初の手番はシードで変わるので、席による有利・不利は試合数で均される
 */

import Game from '../public/js/game.js';
import { runCpuStep, cpuActors, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 20000;

export function playMatch({ profiles, seed }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true, cpuLevel: p })), { seed });
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
    const wins = Array(count).fill(0);
    const result = { finished: 0, stuck: 0, steps: [], coins: Array.from({ length: count }, () => []), wins };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ profiles, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.steps.push(game.commands.length);
        game.players.forEach(p => result.coins[p.id].push(p.coins));
        game.winners.forEach(id => { wins[id] += 1 / game.winners.length; });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const count = Number(process.argv[3] ?? 4);
    const profiles = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    if (profiles.length !== count) throw new Error('席の数と強さの数が合いません');
    if (profiles.some(p => !PROFILES[p])) throw new Error(`強さは ${Object.keys(PROFILES).join('・')} のどれかです`);
    const started = Date.now();
    const r = runMatches({ games, profiles });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    const sorted = [...r.steps].sort((a, b) => a - b);
    console.log(`${games}試合（${count}人：${profiles.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}`);
    console.log(`手数 平均 ${avg(r.steps)}（最短 ${sorted[0]}・中央 ${sorted[Math.floor(sorted.length / 2)]}・最長 ${sorted.at(-1)}）`);
    profiles.forEach((p, i) => console.log(`席${i}（${p}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%・コインの平均 ${avg(r.coins[i])}`));
}
