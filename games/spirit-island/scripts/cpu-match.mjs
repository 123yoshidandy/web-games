/**
 * CPU の精霊だけで多数回遊ばせて、勝率・勝ち方と負け方・進まなくなった試合を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [難易度（easy・normal・hard・all）] [最初のシード]
 *   例: node scripts/cpu-match.mjs 40 2 all
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { LEVELS } from '../public/js/data.js';

const MAX_STEPS = 4000;

export function playMatch({ count, level, seed }) {
    const players = Array.from({ length: count }, (_, i) => ({ name: `CPU${i + 1}`, isCPU: true }));
    const game = new Game(players, { seed, level });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break;
        steps++;
    }
    return { game, steps };
}

export function runMatches({ games, count, level, seedBase = 1 }) {
    const r = { games, wins: 0, stuck: 0, reasons: {}, turns: 0, steps: 0 };
    for (let i = 0; i < games; i++) {
        const { game, steps } = playMatch({ count, level, seed: seedBase + i });
        r.steps += steps;
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        if (game.result.won) r.wins++;
        const key = `${game.result.won ? '勝ち' : '負け'}:${game.result.reason}`;
        r.reasons[key] = (r.reasons[key] ?? 0) + 1;
        r.turns += game.s.turn;
    }
    return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 20);
    const count = Number(process.argv[3] ?? 2);
    const arg = process.argv[4] ?? 'all';
    const seedBase = Number(process.argv[5] ?? 1);
    const levels = arg === 'all' ? Object.keys(LEVELS) : [arg];
    const names = { '勝ち:terror': '勝ち（恐怖）', '勝ち:fear': '勝ち（恐怖カード尽き）', '負け:blight': '負け（荒廃）', '負け:presence': '負け（存在）', '負け:time': '負け（時間切れ）' };
    levels.forEach(level => {
        const started = Date.now();
        const r = runMatches({ games, count, level, seedBase });
        const done = games - r.stuck;
        console.log(`${LEVELS[level].name}（${count}人・${games}試合・${((Date.now() - started) / 1000).toFixed(1)}秒）`
            + `：勝率 ${(100 * r.wins / games).toFixed(1)}%`
            + `（${Object.entries(r.reasons).map(([k, v]) => `${names[k] ?? k} ${v}`).join('・')}`
            + `${r.stuck ? `・進まなくなった ${r.stuck}` : ''}）`
            + ` 平均 ${(r.turns / Math.max(1, done)).toFixed(1)}ターン・${(r.steps / games).toFixed(0)}手`);
    });
    if (levels.some(() => false)) process.exit(1);
}
