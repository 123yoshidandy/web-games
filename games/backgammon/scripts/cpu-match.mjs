/**
 * CPU 同士を多数回対戦させて、勝率・点数・手数・1手の考える時間を数える
 * 席を入れ替えながら対戦させる。1試合は1マッチ（matchLength 点先取）
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さA,強さB] [何点先取（1・3・5・7）] [キューブ（on・off）]
 *   例: node scripts/cpu-match.mjs 200 normal,easy 1
 */

import Game from '../public/js/game.js';
import { runCpuStep, PROFILES } from '../public/js/cpu-player.js';

export const MAX_COMMANDS = 3000; // これを超えたら「長引いた」として数える（ルール上の終わりではない）

export function playMatch({ profiles, seed, matchLength = 1, cube = true }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true })), { seed, matchLength, cube });
    let steps = 0;
    let slowest = 0;
    const kinds = { 0: 0, 1: 0, 2: 0, 3: 0 };
    let doubles = 0;
    let lastSeq = 0;
    while (!game.isOver() && steps < MAX_COMMANDS) {
        const seat = game.actors()[0];
        const started = Date.now();
        if (!runCpuStep(game, seat, PROFILES[profiles[seat]])) break; // 進まなかった
        slowest = Math.max(slowest, Date.now() - started);
        steps++;
        for (const e of game.events) {
            if (e.seq <= lastSeq) continue;
            if (e.type === 'gameEnd') kinds[e.kind]++;
            if (e.type === 'double') doubles++;
        }
        lastSeq = game.eventSeq;
    }
    return { game, steps, slowest, kinds, doubles };
}

export function runMatches({ games, profiles, matchLength = 1, cube = true, seedBase = 1 }) {
    // wins[i]：profiles[i] の勝ち数（席を入れ替えても、強さごとに数える）。points[i]：profiles[i] が取った点
    const result = { wins: [0, 0], points: [0, 0], long: 0, stuck: 0, steps: [], slowest: 0, kinds: { 0: 0, 1: 0, 2: 0, 3: 0 }, doubles: 0 };
    for (let i = 0; i < games; i++) {
        const swap = i % 2 === 1;
        const seated = swap ? [profiles[1], profiles[0]] : profiles;
        const { game, steps, slowest, kinds, doubles } = playMatch({ profiles: seated, seed: seedBase + i, matchLength, cube });
        result.slowest = Math.max(result.slowest, slowest);
        Object.keys(kinds).forEach(k => { result.kinds[k] += kinds[k]; });
        result.doubles += doubles;
        game.players.forEach(p => { result.points[swap ? 1 - p.id : p.id] += game.score[p.id]; });
        if (!game.isOver()) {
            if (steps >= MAX_COMMANDS) result.long++;
            else result.stuck++;
            continue;
        }
        result.steps.push(steps);
        const w = game.winner;
        result.wins[swap ? 1 - w : w]++;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 20);
    const profiles = (process.argv[3] ?? 'normal,easy').split(',');
    const matchLength = Number(process.argv[4] ?? 1);
    const cube = (process.argv[5] ?? 'on') !== 'off';
    if (profiles.length !== 2 || profiles.some(p => !PROFILES[p])) throw new Error('強さを2つ（easy・normal・random）');
    const started = Date.now();
    const r = runMatches({ games, profiles, matchLength, cube });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${profiles.join(' 対 ')}、${matchLength}点先取、キューブ${cube ? 'あり' : 'なし'}）${Math.round((Date.now() - started) / 1000)}秒`);
    console.log(`${profiles[0]} ${r.wins[0]}勝・${profiles[1]} ${r.wins[1]}勝・長引いた ${r.long}・進まなくなった ${r.stuck}`);
    console.log(`点 ${profiles[0]} ${r.points[0]}・${profiles[1]} ${r.points[1]}・勝ちの種類 シングル ${r.kinds[1]}・ギャモン ${r.kinds[2]}・バックギャモン ${r.kinds[3]}・降りた ${r.kinds[0]}・ダブル ${r.doubles}`);
    console.log(`操作の数 平均 ${avg(r.steps)}・1手の考える時間の最長 ${r.slowest}ms`);
}
