/**
 * CPU 同士を多数回対戦させて、席ごとの勝率と終わり方を数える（CPU の強さの差を確かめる）
 * 使い方: node scripts/cpu-match.mjs [試合数] [席ごとの強さ（easy,normal）] [最初のシード]
 *   例: node scripts/cpu-match.mjs 500 normal,easy
 * 最初の手番はシードで変わるので、席による有利・不利は試合数で均される
 */

import Game from '../public/js/game.js';
import { runLeveledCpuStep, LEVELS } from '../public/js/cpu-level.js';

const MAX_STEPS = 2000;

export function playMatch({ levels, seed }) {
    const game = new Game(levels.map((level, i) => ({ name: `${level}${i}`, isCPU: true })), { seed });
    let steps = 0;
    while (game.phase === 'play' && steps < MAX_STEPS) {
        if (!runLeveledCpuStep(game, levels[game.currentPlayerIndex])) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, levels, seedBase = 1 }) {
    const wins = Array(levels.length).fill(0);
    const result = { finished: 0, stuck: 0, complete: 0, poolEmpty: 0, steps: [], wins };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ levels, seed: seedBase + i });
        if (game.phase !== 'end') {
            result.stuck++;
            continue;
        }
        result.finished++;
        result[game.result.reason]++;
        result.steps.push(game.commands.length);
        game.result.winnerIds.forEach(id => { wins[id] += 1 / game.result.winnerIds.length; });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const levels = (process.argv[3] ?? 'normal,easy').split(',');
    if (levels.length < 2 || levels.length > 4) throw new Error('席は2〜4つです');
    if (levels.some(level => !LEVELS[level])) throw new Error(`強さは ${Object.keys(LEVELS).join('・')} のどれかです`);
    const started = Date.now();
    const r = runMatches({ games, levels, seedBase: Number(process.argv[4] ?? 1) });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${levels.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}（庭の完成 ${r.complete}・山札切れ ${r.poolEmpty}）・進まなくなった ${r.stuck}`);
    console.log(`操作の数の平均 ${avg(r.steps)}`);
    levels.forEach((level, i) => console.log(`席${i}（${LEVELS[level]}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%`));
}
