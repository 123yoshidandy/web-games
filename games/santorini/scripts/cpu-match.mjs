/**
 * CPU 同士を多数回対戦させて、勝率・手番の数・1手番の考える時間を数える
 * 強さを2つ並べると2人戦、3つ並べると3人戦。試合ごとに席を回す（どの強さも、どの席・手番も同じだけ受け持つ）
 * 神（2人戦だけ）：強さと同じ順に並べる。'random' はおまかせ、'-' はなし。'all' は試合ごとに両者おまかせ
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さ,強さ(,強さ)] [神,神 | all | -]
 *   例: node scripts/cpu-match.mjs 100 normal,easy
 *       node scripts/cpu-match.mjs 40 normal,easy all
 *       node scripts/cpu-match.mjs 20 normal,normal apollo,pan
 */

import Game from '../public/js/game.js';
import { runCpuStep, PROFILES } from '../public/js/cpu-player.js';

export const MAX_TURNS = 400; // これを超えたら「長引いた」として数える（ルール上の終わりではない）

export function playMatch({ profiles, seed, gods = null }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true })), { seed, gods });
    let turns = 0;
    let slowest = 0;
    while (!game.isOver() && turns < MAX_TURNS) {
        const started = Date.now();
        if (!runCpuStep(game, game.current, PROFILES[profiles[game.current]])) break; // 進まなかった
        slowest = Math.max(slowest, Date.now() - started);
        turns++;
    }
    return { game, turns, slowest };
}

export function runMatches({ games, profiles, gods = null, seedBase = 1 }) {
    const n = profiles.length;
    const result = { wins: profiles.map(() => 0), long: 0, stuck: 0, turns: [], slowest: 0, firstWins: 0, reasons: {}, godWins: {} };
    for (let i = 0; i < games; i++) {
        const shift = i % n;
        // 席 s には profiles[(s + shift) % n] が座る
        const seated = profiles.map((_, s) => profiles[(s + shift) % n]);
        const seatedGods = gods === 'all' ? profiles.map(() => 'random') : gods ? profiles.map((_, s) => gods[(s + shift) % n]) : null;
        const { game, turns, slowest } = playMatch({ profiles: seated, seed: seedBase + i, gods: seatedGods });
        result.slowest = Math.max(result.slowest, slowest);
        if (!game.isOver()) {
            if (turns >= MAX_TURNS) result.long++;
            else result.stuck++;
            continue;
        }
        result.turns.push(turns);
        const w = game.winner;
        if (w === game.first) result.firstWins++;
        result.wins[(w + shift) % n]++;
        const reason = game.state.result.reason;
        result.reasons[reason] = (result.reasons[reason] ?? 0) + 1;
        if (game.gods[w]) result.godWins[game.gods[w]] = (result.godWins[game.gods[w]] ?? 0) + 1;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 20);
    const profiles = (process.argv[3] ?? 'normal,easy').split(',');
    const godArg = process.argv[4] ?? '-';
    const gods = godArg === '-' ? null : godArg === 'all' ? 'all' : godArg.split(',').map(g => g === '-' ? null : g);
    if (![2, 3].includes(profiles.length) || profiles.some(p => !PROFILES[p])) throw new Error('強さを2つか3つ（easy・normal・random）');
    const started = Date.now();
    const r = runMatches({ games, profiles, gods });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${profiles.join(' 対 ')}、神 ${godArg}）${Math.round((Date.now() - started) / 1000)}秒`);
    console.log(profiles.map((p, i) => `${p}${profiles.length > 2 ? `#${i}` : ''} ${r.wins[i]}勝`).join('・') + `・長引いた ${r.long}・進まなくなった ${r.stuck}`);
    console.log(`手番 平均 ${avg(r.turns)}・最初の手番の人の勝ち ${r.firstWins}・決まり手 ${JSON.stringify(r.reasons)}・1手番の考える時間の最長 ${r.slowest}ms`);
    if (Object.keys(r.godWins).length) console.log(`神ごとの勝ち ${JSON.stringify(r.godWins)}`);
}
