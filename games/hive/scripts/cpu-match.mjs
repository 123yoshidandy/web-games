/**
 * CPU 同士を多数回対戦させて、勝率・引き分け・手数・1手の考える時間を数える
 * 席を入れ替えながら（先手・後手を半分ずつ）対戦させる
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さA,強さB] [拡張の駒（例 LMP、なしは -）]
 *   例: node scripts/cpu-match.mjs 40 normal,easy LMP
 */

import Game from '../public/js/game.js';
import { runCpuStep, PROFILES } from '../public/js/cpu-player.js';

export const MAX_PLIES = 300; // これを超えたら「長引いた」として数える（ルール上の終わりではない）

export function playMatch({ profiles, seed, expansions = [] }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true })), { seed, expansions });
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

export function runMatches({ games, profiles, expansions = [], seedBase = 1 }) {
    // wins[i]：profiles[i] の勝ち数（席を入れ替えても、強さごとに数える）
    const result = { wins: [0, 0], draws: 0, long: 0, stuck: 0, plies: [], slowest: 0, firstWins: 0 };
    for (let i = 0; i < games; i++) {
        const swap = i % 2 === 1;
        const seated = swap ? [profiles[1], profiles[0]] : profiles;
        const { game, plies, slowest } = playMatch({ profiles: seated, seed: seedBase + i, expansions });
        result.slowest = Math.max(result.slowest, slowest);
        if (!game.isOver()) {
            if (plies >= MAX_PLIES) result.long++;
            else result.stuck++;
            continue;
        }
        result.plies.push(plies);
        const w = game.winner;
        if (w === null) {
            result.draws++;
            continue;
        }
        if (w === game.first) result.firstWins++;
        result.wins[swap ? 1 - w : w]++;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 20);
    const profiles = (process.argv[3] ?? 'normal,easy').split(',');
    const expansions = (process.argv[4] ?? '-').replace('-', '').split('').filter(Boolean);
    if (profiles.length !== 2 || profiles.some(p => !PROFILES[p])) throw new Error('強さを2つ（easy・normal・random）');
    const started = Date.now();
    const r = runMatches({ games, profiles, expansions });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${profiles.join(' 対 ')}、拡張 ${expansions.join('') || 'なし'}）${Math.round((Date.now() - started) / 1000)}秒`);
    console.log(`${profiles[0]} ${r.wins[0]}勝・${profiles[1]} ${r.wins[1]}勝・引き分け ${r.draws}・長引いた ${r.long}・進まなくなった ${r.stuck}`);
    console.log(`手数 平均 ${avg(r.plies)}・先手の勝ち ${r.firstWins}・1手の考える時間の最長 ${r.slowest}ms`);
}
