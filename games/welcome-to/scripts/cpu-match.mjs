/**
 * CPU 同士を多数回対戦させて、得点の平均・内訳・勝ち数・進まなくなった試合を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [強さ（normal・easy・mixed）]
 *   mixed は、席ごとに強さを交互に変え、「ふつう」と「やさしい」の得点と勝ち数を比べる
 *   例: node scripts/cpu-match.mjs 100 4 mixed
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

const MAX_STEPS = 5000;
const PARTS = ['total', 'plans', 'parks', 'pools', 'temps', 'estates', 'bis', 'refusals'];

export function playMatch({ count, levels, seed }) {
    const game = new Game(Array.from({ length: count }, (_, i) => ({ name: `CPU${i}`, isCPU: true })), { seed });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = game.actors()[0];
        if (!runCpuStep(game, levels[seat], seat)) break;
        steps++;
    }
    return game;
}

export function runMatches({ games, count, level = 'normal', seedBase = 1 }) {
    const result = { finished: 0, stuck: 0, turns: 0, byLevel: {}, reasons: {} };
    for (let i = 0; i < games; i++) {
        const levels = Array.from({ length: count }, (_, seat) => (level === 'mixed' ? ((seat + i) % 2 ? 'easy' : 'normal') : level));
        const game = playMatch({ count, levels, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.turns += game.turnNo;
        const reason = game.endReason.replace(/^CPU\d+(の|が)/, '');
        result.reasons[reason] = (result.reasons[reason] ?? 0) + 1;
        game.results.forEach((r, seat) => {
            const s = result.byLevel[levels[seat]] ?? (result.byLevel[levels[seat]] = Object.fromEntries([['n', 0], ['wins', 0], ...PARTS.map(k => [k, 0])]));
            s.n++;
            if (game.winners.includes(seat)) s.wins++;
            PARTS.forEach(k => { s[k] += r[k]; });
        });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 50);
    const count = Number(process.argv[3] ?? 4);
    const level = process.argv[4] ?? 'normal';
    const started = Date.now();
    const r = runMatches({ games, count, level });
    console.log(`${games}試合（${count}人・${level}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・平均 ${(r.turns / Math.max(1, r.finished)).toFixed(1)}手`);
    console.log(`終わり方：${Object.entries(r.reasons).map(([k, v]) => `${k} ${v}`).join('・')}`);
    Object.entries(r.byLevel).forEach(([lv, s]) => {
        const avg = (k) => (s[k] / s.n).toFixed(1);
        console.log(`${lv === 'easy' ? 'やさしい' : 'ふつう'}：平均 ${avg('total')}点（計画 ${avg('plans')}・公園 ${avg('parks')}・プール ${avg('pools')}・派遣 ${avg('temps')}・家並み ${avg('estates')}・ビス −${avg('bis')}・断り −${avg('refusals')}）勝ち ${s.wins}/${s.n}`);
    });
}
