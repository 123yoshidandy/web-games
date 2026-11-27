/**
 * CPU だけで多数回遊ばせて、勝率・負け方・進まなくなった試合を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [難易度（initiation・normal・nightmare・all）] [最初のシード]
 *   例: node scripts/cpu-match.mjs 200 all
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { LEVELS } from '../public/js/data.js';

const MAX_STEPS = 4000;

export function playMatch({ level, seed }) {
    const players = Array.from({ length: 4 }, (_, i) => ({ name: `CPU${i + 1}`, isCPU: true }));
    const game = new Game(players, { seed, level });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break;
        steps++;
    }
    return game;
}

export function runMatches({ games, level, seedBase = 1 }) {
    const r = { games, wins: 0, stuck: 0, reasons: {}, turns: 0, haunted: 0, dead: 0 };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ level, seed: seedBase + i });
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        if (game.result.won) r.wins++;
        r.reasons[game.result.reason] = (r.reasons[game.result.reason] ?? 0) + 1;
        r.turns += game.turnNo;
        r.haunted += game.hauntedCount();
        r.dead += game.players.filter(p => !p.alive).length;
    }
    return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const arg = process.argv[3] ?? 'all';
    const seedBase = Number(process.argv[4] ?? 1);
    const levels = arg === 'all' ? Object.keys(LEVELS) : [arg];
    const names = { wufeng: '勝ち', haunted: '呪い', dead: '全滅', deck: '山切れ' };
    levels.forEach(level => {
        const started = Date.now();
        const r = runMatches({ games, level, seedBase });
        const done = Math.max(1, games - r.stuck);
        console.log(`${LEVELS[level].name}（${games}試合・${((Date.now() - started) / 1000).toFixed(1)}秒）`
            + `：勝率 ${(100 * r.wins / games).toFixed(1)}%`
            + `（${Object.entries(r.reasons).map(([k, v]) => `${names[k]} ${v}`).join('・')}`
            + `${r.stuck ? `・進まなくなった ${r.stuck}` : ''}）`
            + ` 平均 ${(r.turns / done).toFixed(1)}手番・呪われたタイル ${(r.haunted / done).toFixed(2)}・倒れた僧 ${(r.dead / done).toFixed(2)}`);
    });
}
