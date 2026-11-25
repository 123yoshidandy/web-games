/**
 * CPU 同士を多数回対戦させて、得点の平均・内訳・勝ち数・進まなくなった試合を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [強さ（normal・easy・mixed）]
 *   mixed は、席ごとに強さを交互に変え、「ふつう」と「やさしい」の得点と勝ち数を比べる
 *   例: node scripts/cpu-match.mjs 100 4 mixed
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

const MAX_STEPS = 3000;
const PARTS = ['total', 'routes', 'ticketPlus', 'ticketMinus', 'bonus', 'ticketsDone', 'tickets', 'trains'];

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
    const result = { finished: 0, stuck: 0, turns: 0, byLevel: {} };
    for (let i = 0; i < games; i++) {
        const levels = Array.from({ length: count }, (_, seat) => (level === 'mixed' ? ((seat + i) % 2 ? 'easy' : 'normal') : level));
        const game = playMatch({ count, levels, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.turns += game.turnCount / count;
        game.results.forEach((r, seat) => {
            const s = result.byLevel[levels[seat]] ?? (result.byLevel[levels[seat]] = Object.fromEntries([['n', 0], ['wins', 0], ...PARTS.map(k => [k, 0])]));
            s.n++;
            if (game.winners.includes(seat)) s.wins++;
            ['total', 'routes', 'ticketPlus', 'ticketMinus', 'bonus', 'ticketsDone'].forEach(k => { s[k] += r[k]; });
            s.tickets += game.players[seat].tickets.length;
            s.trains += game.players[seat].trains;
        });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 50);
    const count = Number(process.argv[3] ?? 2);
    const level = process.argv[4] ?? 'normal';
    const started = Date.now();
    const r = runMatches({ games, count, level });
    console.log(`${games}試合（${count}人・${level}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・1人あたり平均 ${(r.turns / Math.max(1, r.finished)).toFixed(1)}手番`);
    Object.entries(r.byLevel).forEach(([lv, s]) => {
        const avg = (k) => (s[k] / s.n).toFixed(1);
        console.log(`${lv === 'easy' ? 'やさしい' : 'ふつう'}：平均 ${avg('total')}点（路線 ${avg('routes')}・目的地 +${avg('ticketPlus')} −${avg('ticketMinus')}・最長 ${avg('bonus')}）目的地 ${avg('ticketsDone')}/${avg('tickets')}枚・残りの列車 ${avg('trains')}両・勝ち ${s.wins}/${s.n}`);
    });
}
