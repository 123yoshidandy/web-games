/**
 * CPU だけで多数回遊ばせて、勝率・負け方・進まなくなった試合を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数（1・2・3・4・all）] [階数（1・2・3・all）] [最初のシード]
 *   例: node scripts/cpu-match.mjs 200 all all
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { FLOOR_LEVELS } from '../public/js/data.js';

const MAX_STEPS = 4000;

export function playMatch({ count, floors, seed }) {
    const players = Array.from({ length: count }, (_, i) => ({ name: `CPU${i + 1}`, isCPU: true }));
    const game = new Game(players, { seed, floors });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break;
        steps++;
    }
    return game;
}

export function runMatches({ games, count, floors, seedBase = 1 }) {
    const r = { games, wins: 0, stuck: 0, turns: 0, safes: 0 };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ count, floors, seed: seedBase + i });
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        if (game.result.won) r.wins++;
        r.turns += game.turnNo;
        r.safes += game.floors.filter(fl => fl.safe.cracked).length;
    }
    return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const countArg = process.argv[3] ?? 'all';
    const floorArg = process.argv[4] ?? 'all';
    const seedBase = Number(process.argv[5] ?? 1);
    const counts = countArg === 'all' ? [1, 2, 3, 4] : [Number(countArg)];
    const floorList = floorArg === 'all' ? [1, 2, 3] : [Number(floorArg)];
    floorList.forEach(floors => counts.forEach(count => {
        const started = Date.now();
        const r = runMatches({ games, count, floors, seedBase });
        const done = games - r.stuck;
        console.log(`${FLOOR_LEVELS[floors].name}・${count}人・${games}試合（${((Date.now() - started) / 1000).toFixed(1)}秒）`
            + `：勝率 ${(100 * r.wins / games).toFixed(1)}%`
            + `（捕まった ${done - r.wins}${r.stuck ? `・進まなくなった ${r.stuck}` : ''}）`
            + ` 平均 ${(r.turns / Math.max(1, done)).toFixed(1)}手番・開けた金庫 ${(r.safes / Math.max(1, done)).toFixed(2)}`);
    }));
}
