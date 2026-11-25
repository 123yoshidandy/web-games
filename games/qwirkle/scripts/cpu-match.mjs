/**
 * CPU 同士を多数回対戦させて、平均点・勝ち数・進まなくなった試合を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [強さ（normal・easy・mixed）]
 *   mixed は、席ごとに強さを交互に変えて、ふつうとやさしいを比べる
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

const MAX_STEPS = 600;

export function playMatch({ count, levels, seed }) {
    const players = Array.from({ length: count }, (_, i) => ({ name: `CPU${i + 1}`, isCPU: true, level: levels[i] }));
    const game = new Game(players, { seed });
    for (let steps = 0; !game.isOver() && steps < MAX_STEPS; steps++) {
        if (!runCpuStep(game)) break;
    }
    return game;
}

export function runMatches({ games, count, level = 'normal', seedBase = 1 }) {
    const r = { finished: 0, stuck: 0, turns: 0, qwirkles: 0, byLevel: {}, reasons: {} };
    for (let i = 0; i < games; i++) {
        const levels = Array.from({ length: count }, (_, seat) => (level === 'mixed' ? ((seat + i) % 2 ? 'easy' : 'normal') : level));
        const game = playMatch({ count, levels, seed: seedBase + i });
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        r.finished++;
        r.turns += game.turnNo;
        r.reasons[game.endReason] = (r.reasons[game.endReason] ?? 0) + 1;
        game.players.forEach(p => {
            const s = r.byLevel[p.level] ?? (r.byLevel[p.level] = { n: 0, wins: 0, score: 0 });
            s.n++;
            s.score += p.score;
            if (game.winners.includes(p.id)) s.wins++;
        });
    }
    return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const count = Number(process.argv[3] ?? 2);
    const level = process.argv[4] ?? 'mixed';
    const started = Date.now();
    const r = runMatches({ games, count, level });
    console.log(`${games}試合（${count}人・${level}）${((Date.now() - started) / 1000).toFixed(1)}秒`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・平均 ${(r.turns / Math.max(1, r.finished)).toFixed(1)}手`
        + `（手札を出し切って終わり ${r.reasons.out ?? 0}・誰も置けず終わり ${r.reasons.stuck ?? 0}）`);
    Object.entries(r.byLevel).forEach(([lv, s]) => {
        console.log(`${lv === 'easy' ? 'やさしい' : 'ふつう'}：平均 ${(s.score / s.n).toFixed(1)}点・勝ち ${s.wins}/${s.n}`);
    });
}
