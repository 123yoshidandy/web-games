/**
 * CPU 同士を多数回対戦させて、役割ごとの勝率・手番の数・進まなくなった試合を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [強さ（normal・easy・mixed）]
 *   mixed は、席ごとに強さを交互に変え、同じ役割での「ふつう」と「やさしい」の勝率を比べる
 *   例: node scripts/cpu-match.mjs 1000 5 normal
 */

import Game, { ROLE_NAMES } from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

const MAX_STEPS = 5000;

export function playMatch({ count, levels, seed }) {
    const game = new Game(Array.from({ length: count }, (_, i) => ({ name: `CPU${i}`, isCPU: true })), { seed });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = game.actors()[0];
        if (!runCpuStep(game, levels[seat])) break;
        steps++;
    }
    return game;
}

export function runMatches({ games, count, level = 'normal', seedBase = 1 }) {
    const result = { finished: 0, stuck: 0, turns: [], sides: {}, roles: {} };
    for (let i = 0; i < games; i++) {
        const seed = seedBase + i;
        const levels = Array.from({ length: count }, (_, seat) => (level === 'mixed' ? ((seat + i) % 2 ? 'easy' : 'normal') : level));
        const game = playMatch({ count, levels, seed });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.turns.push(game.turnCount);
        result.sides[game.winnerSide] = (result.sides[game.winnerSide] ?? 0) + 1;
        game.players.forEach((p, seat) => {
            const key = `${p.role}:${levels[seat]}`;
            const r = result.roles[key] ?? (result.roles[key] = { won: 0, total: 0 });
            r.total++;
            if (game.winners.includes(seat)) r.won++;
        });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 500);
    const count = Number(process.argv[3] ?? 5);
    const level = process.argv[4] ?? 'normal';
    const started = Date.now();
    const r = runMatches({ games, count, level });
    const pct = (a, b) => `${(a / Math.max(1, b) * 100).toFixed(1)}%`;
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    const sideNames = { law: '保安官側', outlaw: '無法者', renegade: '裏切り者', deputy: '副保安官', outlaw3: '無法者', null: '勝者なし' };
    console.log(`${games}試合（${count}人・${level}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・手番の数 平均 ${avg(r.turns)}・最大 ${Math.max(...r.turns)}`);
    console.log('勝った側：' + Object.entries(r.sides).map(([k, v]) => `${sideNames[k] ?? k} ${pct(v, r.finished)}`).join('・'));
    console.log('役割ごとの勝率：' + Object.entries(r.roles).sort().map(([k, v]) => {
        const [role, lv] = k.split(':');
        return `${ROLE_NAMES[role]}${level === 'mixed' ? `（${lv === 'easy' ? 'やさしい' : 'ふつう'}）` : ''} ${pct(v.won, v.total)}`;
    }).join('・'));
}
