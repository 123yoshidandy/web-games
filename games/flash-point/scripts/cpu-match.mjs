/**
 * CPU だけで多数回遊ばせて、勝率・負け方・進まなくなった試合を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [遊び方（family・recruit・veteran・heroic・all）] [最初のシード]
 *   例: node scripts/cpu-match.mjs 100 4 all
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { LEVELS } from '../public/js/board.js';

const MAX_STEPS = 6000;

export function playMatch({ count, mode, level, seed }) {
    const players = Array.from({ length: count }, (_, i) => ({ name: `CPU${i + 1}`, isCPU: true }));
    const game = new Game(players, { seed, mode, level });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break;
        steps++;
    }
    return game;
}

export function runMatches({ games, count, mode, level, seedBase = 1 }) {
    const r = { games, wins: 0, stuck: 0, reasons: {}, turns: 0, rescued: 0, lost: 0, damage: 0 };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ count, mode, level, seed: seedBase + i });
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        if (game.result.won) r.wins++;
        r.reasons[game.result.reason] = (r.reasons[game.result.reason] ?? 0) + 1;
        r.turns += game.turnNo;
        r.rescued += game.rescued;
        r.lost += game.lost;
        r.damage += game.damage;
    }
    return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 50);
    const count = Number(process.argv[3] ?? 4);
    const arg = process.argv[4] ?? 'all';
    const seedBase = Number(process.argv[5] ?? 1);
    const kinds = arg === 'all' ? ['family', ...Object.keys(LEVELS)] : [arg];
    const names = { won: '勝ち', lost: '4人を失う', collapse: '倒壊' };
    kinds.forEach(kind => {
        const mode = kind === 'family' ? 'family' : 'experienced';
        const level = kind === 'family' ? undefined : kind;
        const started = Date.now();
        const r = runMatches({ games, count, mode, level, seedBase });
        const done = Math.max(1, games - r.stuck);
        const label = kind === 'family' ? '家族向け' : `上級・${LEVELS[kind].name}`;
        console.log(`${label}（${count}人・${games}試合・${((Date.now() - started) / 1000).toFixed(1)}秒）`
            + `：勝率 ${(100 * r.wins / games).toFixed(1)}%`
            + `（${Object.entries(r.reasons).map(([k, v]) => `${names[k]} ${v}`).join('・')}`
            + `${r.stuck ? `・進まなくなった ${r.stuck}` : ''}）`
            + ` 平均 ${(r.turns / done).toFixed(1)}手番・救出 ${(r.rescued / done).toFixed(1)}・犠牲 ${(r.lost / done).toFixed(1)}・ダメージ ${(r.damage / done).toFixed(1)}`);
    });
}
