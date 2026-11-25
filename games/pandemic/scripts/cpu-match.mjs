/**
 * CPU だけで多数回遊ばせて、勝率・負け方・進まなくなった試合を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [難易度（intro・standard・heroic・all）] [最初のシード]
 *   例: node scripts/cpu-match.mjs 200 4 all
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { LEVELS } from '../public/js/cities.js';

const MAX_STEPS = 3000;

export function playMatch({ count, level, seed, roles }) {
    const players = Array.from({ length: count }, (_, i) => ({ name: `CPU${i + 1}`, isCPU: true }));
    const game = new Game(players, { seed, level, roles });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break;
        steps++;
    }
    return game;
}

export function runMatches({ games, count, level, seedBase = 1 }) {
    const r = { games, wins: 0, stuck: 0, reasons: {}, turns: 0, cures: 0 };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ count, level, seed: seedBase + i });
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        if (game.result.won) r.wins++;
        r.reasons[game.result.reason] = (r.reasons[game.result.reason] ?? 0) + 1;
        r.turns += game.turnNo;
        r.cures += game.cures.filter(Boolean).length;
    }
    return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const count = Number(process.argv[3] ?? 4);
    const arg = process.argv[4] ?? 'all';
    const seedBase = Number(process.argv[5] ?? 1);
    const levels = arg === 'all' ? Object.keys(LEVELS) : [arg];
    const names = { won: '勝ち', outbreaks: 'アウトブレイク', cubes: '駒切れ', deck: '山札切れ' };
    levels.forEach(level => {
        const started = Date.now();
        const r = runMatches({ games, count, level, seedBase });
        const done = games - r.stuck;
        console.log(`${LEVELS[level].name}（伝染${LEVELS[level].epidemics}枚・${count}人・${games}試合・${((Date.now() - started) / 1000).toFixed(1)}秒）`
            + `：勝率 ${(100 * r.wins / games).toFixed(1)}%`
            + `（${Object.entries(r.reasons).map(([k, v]) => `${names[k]} ${v}`).join('・')}`
            + `${r.stuck ? `・進まなくなった ${r.stuck}` : ''}）`
            + ` 平均 ${(r.turns / Math.max(1, done)).toFixed(1)}手番・治療薬 ${(r.cures / Math.max(1, done)).toFixed(2)}色`);
    });
}
