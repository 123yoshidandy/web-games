/**
 * CPU 同士を多数回対戦させて、チームの勝率・ラウンドの数・宣言の成功率を数える
 * チーム A（席0と2）とチーム B（席1と3）の強さを決め、試合ごとに席を入れ替える
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さA,強さB] [目標点]
 *   例: node scripts/cpu-match.mjs 40 normal,easy 1000
 */

import Game, { teamOf } from '../public/js/game.js';
import { runCpuStep, cpuActor, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 200000;

export function playMatch({ profiles, seed, target = 1000 }) {
    // profiles：チームごとの強さ [チーム0, チーム1]
    const game = new Game([0, 1, 2, 3].map(s => ({ name: `${profiles[teamOf(s)]}${s}`, isCPU: true })), { seed, target });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = cpuActor(game);
        if (seat === null || !runCpuStep(game, seat, PROFILES[profiles[teamOf(seat)]])) break;
        steps++;
    }
    return game;
}

export function runMatches({ games, profiles, target = 1000, seedBase = 1 }) {
    const result = { wins: [0, 0], stuck: 0, rounds: [], calls: [{ made: 0, ok: 0 }, { made: 0, ok: 0 }], grands: [{ made: 0, ok: 0 }, { made: 0, ok: 0 }], doubles: [0, 0] };
    for (let i = 0; i < games; i++) {
        const swap = i % 2 === 1;
        const seated = swap ? [profiles[1], profiles[0]] : profiles;
        const game = playMatch({ profiles: seated, seed: seedBase + i, target });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        const side = (team) => (swap ? 1 - team : team); // チーム → 強さの番号
        result.wins[side(game.winner)]++;
        result.rounds.push(game.rounds.length);
        for (const r of game.rounds) {
            if (r.detail === 'double') result.doubles[side(teamOf(r.finished[0]))]++;
            r.calls.forEach((call, s) => {
                if (!call) return;
                const bucket = (call === 'grand' ? result.grands : result.calls)[side(teamOf(s))];
                bucket.made++;
                if (r.finished[0] === s) bucket.ok++;
            });
        }
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 20);
    const profiles = (process.argv[3] ?? 'normal,easy').split(',');
    const target = Number(process.argv[4] ?? 1000);
    if (profiles.length !== 2 || profiles.some(p => !PROFILES[p])) throw new Error('強さを2つ（easy・normal・random）');
    const started = Date.now();
    const r = runMatches({ games, profiles, target });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    const rate = (b) => `${b.ok}/${b.made}`;
    console.log(`${games}試合（${profiles.join(' 対 ')}、${target}点）${Math.round((Date.now() - started) / 1000)}秒`);
    console.log(`${profiles[0]} ${r.wins[0]}勝・${profiles[1]} ${r.wins[1]}勝・進まなくなった ${r.stuck}・ラウンドの数 平均 ${avg(r.rounds)}`);
    profiles.forEach((p, i) => console.log(`${p}：ティチュー成功 ${rate(r.calls[i])}・大ティチュー成功 ${rate(r.grands[i])}・ダブル勝利 ${r.doubles[i]}`));
}
