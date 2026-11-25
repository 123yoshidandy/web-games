/**
 * CPU 同士を多数回対戦させて、勝率・失点・ラウンドの数・終わり方を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [席ごとの強さ（easy,normal,strong,random を4つ）]
 *   例: node scripts/cpu-match.mjs 500 normal,easy,easy,easy
 * 渡す先は席の並びで決まるので、席による有利・不利がないように、強さの並びを試合ごとに回す
 */

import Game from '../public/js/game.js';
import { runCpuStep, cpuActors, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 20000;

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

// 結果は、強さの並び（profiles の位置）ごとに数える
export function runMatches({ games, profiles, seedBase = 1 }) {
    const count = profiles.length;
    const wins = Array(count).fill(0);
    const result = { finished: 0, stuck: 0, steps: [], scores: Array.from({ length: count }, () => []), wins };
    for (let i = 0; i < games; i++) {
        const shift = i % count;
        const seated = profiles.map((_, seat) => profiles[(seat + shift) % count]);
        const game = playMatch({ profiles: seated, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        const slot = (seat) => (seat + shift) % count;
        result.finished++;
        result.steps.push(game.round);
        game.players.forEach(p => result.scores[slot(p.id)].push(p.score));
        game.winners.forEach(id => { wins[slot(id)] += 1 / game.winners.length; });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 500);
    const profiles = (process.argv[3] ?? 'normal,normal,normal,normal').split(',');
    const count = profiles.length;
    if (count !== 4) throw new Error('強さは4つ指定します');
    if (profiles.some(p => !PROFILES[p])) throw new Error(`強さは ${Object.keys(PROFILES).join('・')} のどれかです`);
    const started = Date.now();
    const r = runMatches({ games, profiles });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    const sorted = [...r.steps].sort((a, b) => a - b);
    console.log(`${games}試合（${count}人：${profiles.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}`);
    console.log(`ラウンドの数 平均 ${avg(r.steps)}（最短 ${sorted[0]}・中央 ${sorted[Math.floor(sorted.length / 2)]}・最長 ${sorted.at(-1)}）`);
    profiles.forEach((p, i) => console.log(`${i + 1}番目（${p}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%・失点の平均 ${avg(r.scores[i])}`));
}
