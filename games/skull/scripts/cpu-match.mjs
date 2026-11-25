/**
 * CPU 同士を多数回対戦させて、強さごとの勝率・ラウンドの数・挑戦の成功率を数える
 * 席の並びは試合ごとにずらす（最初に始める人の有利をならす）
 * 使い方: node scripts/cpu-match.mjs [試合数] [席ごとの強さ（normal,easy,...）]
 *   例: node scripts/cpu-match.mjs 200 normal,easy,easy,easy
 */

import Game from '../public/js/game.js';
import { runCpuStep, cpuActor, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 20000;

export function playMatch({ profiles, seed }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true })), { seed });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = cpuActor(game);
        if (seat === null || !runCpuStep(game, seat, PROFILES[profiles[seat]])) break;
        steps++;
    }
    return game;
}

export function runMatches({ games, profiles, seedBase = 1 }) {
    const names = [...new Set(profiles)];
    const result = { wins: Object.fromEntries(names.map(n => [n, 0])), seats: Object.fromEntries(names.map(n => [n, 0])), stuck: 0, rounds: [], tries: Object.fromEntries(names.map(n => [n, { made: 0, ok: 0 }])) };
    for (let i = 0; i < games; i++) {
        const shift = i % profiles.length;
        const seated = profiles.map((_, s) => profiles[(s + shift) % profiles.length]);
        seated.forEach(p => { result.seats[p]++; });
        const game = playMatch({ profiles: seated, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.wins[seated[game.winner]]++;
        result.rounds.push(game.round);
        for (const e of game.events) {
            if (e.type === 'reveal') result.tries[seated[e.seat]].made++;
            if (e.type === 'success') result.tries[seated[e.seat]].ok++;
        }
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const profiles = (process.argv[3] ?? 'normal,easy,easy').split(',');
    if (profiles.length < 3 || profiles.length > 6 || profiles.some(p => !PROFILES[p])) throw new Error('3〜6席の強さ（easy・normal・random）');
    const started = Date.now();
    const r = runMatches({ games, profiles });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${profiles.join(' / ')}）${Math.round((Date.now() - started) / 1000)}秒・進まなくなった ${r.stuck}・ラウンドの数 平均 ${avg(r.rounds)}`);
    for (const name of Object.keys(r.wins)) {
        // 1席あたりの勝率（同じ強さが何席あるかでならす）
        const perSeat = r.wins[name] / Math.max(1, r.seats[name]) * 100;
        const t = r.tries[name];
        console.log(`${name}：勝ち ${r.wins[name]}（1席あたり ${perSeat.toFixed(1)}%）・挑戦の成功 ${t.ok}/${t.made}`);
    }
}
