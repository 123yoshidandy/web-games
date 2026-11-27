/**
 * CPU だけで多数回遊ばせて、勝率・負け方・進まなくなった試合を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数（2・3・4・all）] [難易度（novice・normal・elite・legendary・all）] [最初のシード]
 *   例: node scripts/cpu-match.mjs 200 all all（試合数の既定は 30）
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { LEVELS } from '../public/js/data.js';

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
    const r = { games, wins: 0, stuck: 0, reasons: {}, turns: 0, captured: 0 };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ count, level, seed: seedBase + i });
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        if (game.result.won) r.wins++;
        r.reasons[game.result.reason] = (r.reasons[game.result.reason] ?? 0) + 1;
        r.turns += game.turnNo;
        r.captured += game.captured.filter(Boolean).length;
    }
    return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 30);
    const countArg = process.argv[3] ?? 'all';
    const levelArg = process.argv[4] ?? 'all';
    const seedBase = Number(process.argv[5] ?? 1);
    const counts = countArg === 'all' ? [2, 3, 4] : [Number(countArg)];
    const levels = levelArg === 'all' ? Object.keys(LEVELS) : [levelArg];
    const names = { won: '勝ち', fools: '発着場', temple: '神殿', drown: '泳げない', water: '水位' };
    levels.forEach(level => counts.forEach(count => {
        const started = Date.now();
        const r = runMatches({ games, count, level, seedBase });
        const done = games - r.stuck;
        console.log(`${LEVELS[level].name}（水位${LEVELS[level].water}・${count}人・${games}試合・${((Date.now() - started) / 1000).toFixed(1)}秒）`
            + `：勝率 ${(100 * r.wins / games).toFixed(1)}%`
            + `（${Object.entries(r.reasons).map(([k, v]) => `${names[k]} ${v}`).join('・')}`
            + `${r.stuck ? `・進まなくなった ${r.stuck}` : ''}）`
            + ` 平均 ${(r.turns / Math.max(1, done)).toFixed(1)}手番・宝 ${(r.captured / Math.max(1, done)).toFixed(2)}個`);
    }));
}
