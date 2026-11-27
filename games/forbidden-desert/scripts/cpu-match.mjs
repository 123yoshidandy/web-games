/**
 * CPU だけで多数回遊ばせて、勝率・負け方・進まなくなった試合を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数（2〜5・all）] [難易度（novice・normal・elite・legendary・all）] [最初のシード]
 *   例: node scripts/cpu-match.mjs 200 all all
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { LEVELS, MIN_PLAYERS, MAX_PLAYERS } from '../public/js/data.js';

const MAX_STEPS = 5000;

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
    const r = { games, wins: 0, stuck: 0, reasons: {}, turns: 0, parts: 0 };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ count, level, seed: seedBase + i });
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        if (game.result.won) r.wins++;
        r.reasons[game.result.reason] = (r.reasons[game.result.reason] ?? 0) + 1;
        r.turns += game.turnNo;
        r.parts += game.partsFound();
    }
    return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const countArg = process.argv[3] ?? 'all';
    const levelArg = process.argv[4] ?? 'all';
    const seedBase = Number(process.argv[5] ?? 1);
    const counts = countArg === 'all' ? Array.from({ length: MAX_PLAYERS - MIN_PLAYERS + 1 }, (_, i) => MIN_PLAYERS + i) : [Number(countArg)];
    const levels = levelArg === 'all' ? Object.keys(LEVELS) : [levelArg];
    const names = { won: '勝ち', thirst: '渇き', sand: '砂', storm: '嵐' };
    levels.forEach(level => {
        let wins = 0;
        let total = 0;
        counts.forEach(count => {
            const started = Date.now();
            const r = runMatches({ games, count, level, seedBase });
            const done = games - r.stuck;
            wins += r.wins;
            total += games;
            console.log(`${LEVELS[level].name}・${count}人（${games}試合・${((Date.now() - started) / 1000).toFixed(1)}秒）`
                + `：勝率 ${(100 * r.wins / games).toFixed(1)}%`
                + `（${Object.entries(r.reasons).map(([k, v]) => `${names[k]} ${v}`).join('・')}`
                + `${r.stuck ? `・進まなくなった ${r.stuck}` : ''}）`
                + ` 平均 ${(r.turns / Math.max(1, done)).toFixed(1)}手番・部品 ${(r.parts / Math.max(1, done)).toFixed(2)}個`);
        });
        if (counts.length > 1) console.log(`${LEVELS[level].name}：全体の勝率 ${(100 * wins / total).toFixed(1)}%`);
    });
}
