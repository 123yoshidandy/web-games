/**
 * CPU 同士を多数回対戦させて、勝率・手数・1手の考える時間を数える
 * 強さを2つ並べると2人戦、4つ並べると4人戦。試合ごとに席を回す（どの強さも、どの席・手番も同じだけ受け持つ）
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さ,強さ(,強さ,強さ)]
 *   例: node scripts/cpu-match.mjs 100 normal,easy
 *       node scripts/cpu-match.mjs 40 normal,easy,easy,easy
 */

import Game from '../public/js/game.js';
import { runCpuStep, PROFILES } from '../public/js/cpu-player.js';

export const MAX_PLIES = 600; // これを超えたら「長引いた」として数える（ルール上の終わりではない）

export function playMatch({ profiles, seed }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true })), { seed });
    let plies = 0;
    let slowest = 0;
    while (!game.isOver() && plies < MAX_PLIES) {
        const started = Date.now();
        if (!runCpuStep(game, game.current, PROFILES[profiles[game.current]])) break; // 進まなかった
        slowest = Math.max(slowest, Date.now() - started);
        plies++;
    }
    return { game, plies, slowest };
}

export function runMatches({ games, profiles, seedBase = 1 }) {
    const n = profiles.length;
    // wins[i]：profiles[i] の勝ち数（席を回しても、並べた順で数える）
    const result = { wins: profiles.map(() => 0), long: 0, stuck: 0, plies: [], slowest: 0, firstWins: 0, wallsUsed: profiles.map(() => 0) };
    for (let i = 0; i < games; i++) {
        const shift = i % n;
        // 席 s には profiles[(s + shift) % n] が座る
        const seated = profiles.map((_, s) => profiles[(s + shift) % n]);
        const { game, plies, slowest } = playMatch({ profiles: seated, seed: seedBase + i });
        result.slowest = Math.max(result.slowest, slowest);
        game.state.placed.forEach(w => { result.wallsUsed[(w.seat + shift) % n]++; });
        if (!game.isOver()) {
            if (plies >= MAX_PLIES) result.long++;
            else result.stuck++;
            continue;
        }
        result.plies.push(plies);
        const w = game.winner;
        if (w === game.first) result.firstWins++;
        result.wins[(w + shift) % n]++;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 20);
    const profiles = (process.argv[3] ?? 'normal,easy').split(',');
    if (![2, 4].includes(profiles.length) || profiles.some(p => !PROFILES[p])) throw new Error('強さを2つか4つ（easy・normal・random）');
    const started = Date.now();
    const r = runMatches({ games, profiles });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${profiles.join(' 対 ')}）${Math.round((Date.now() - started) / 1000)}秒`);
    console.log(profiles.map((p, i) => `${p}${profiles.length > 2 ? `#${i}` : ''} ${r.wins[i]}勝（壁 平均${(r.wallsUsed[i] / games).toFixed(1)}枚）`).join('・') + `・長引いた ${r.long}・進まなくなった ${r.stuck}`);
    console.log(`手数 平均 ${avg(r.plies)}・最初の手番の人の勝ち ${r.firstWins}・1手の考える時間の最長 ${r.slowest}ms`);
}
