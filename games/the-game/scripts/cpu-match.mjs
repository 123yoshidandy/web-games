/**
 * CPU だけで多数回遊ばせて、残りの枚数の分布を数える（協力ゲームなので、勝ち負けではなく残りで測る）
 * 止まった試合（手数の上限まで終わらない）も数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [強さ]（easy・normal・strong・all）
 *   例: node scripts/cpu-match.mjs 300 3 all
 */

import Game, { EXCELLENT } from '../public/js/game.js';
import { runCpuStep, LEVELS } from '../public/js/cpu.js';

const MAX_STEPS = 3000;

export function playGame({ count, level, seed }) {
    const players = Array.from({ length: count }, (_, i) => ({ name: `CPU${i + 1}`, isCPU: true, level }));
    const game = new Game(players, { seed });
    let steps = 0;
    while (!game.isOver && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break;
        steps++;
    }
    return game;
}

export function runMatches({ games, count, level, seedBase = 1 }) {
    const result = { finished: 0, stuck: 0, remaining: [], wins: 0, excellent: 0 };
    for (let i = 0; i < games; i++) {
        const game = playGame({ count, level, seed: seedBase + i });
        if (!game.isOver) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.remaining.push(game.result.remaining);
        if (game.result.win) result.wins++;
        if (game.result.remaining <= EXCELLENT) result.excellent++;
    }
    return result;
}

// 残りの枚数の分布（0・1〜5・6〜10・11〜15・16〜20・21〜30・31以上）
export function histogram(list) {
    const bins = [[0, 0], [1, 5], [6, 10], [11, 15], [16, 20], [21, 30], [31, 98]];
    return bins.map(([lo, hi]) => ({ label: lo === hi ? `${lo}` : `${lo}〜${hi}`, n: list.filter(v => v >= lo && v <= hi).length }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const count = Number(process.argv[3] ?? 3);
    const arg = process.argv[4] ?? 'all';
    const levels = arg === 'all' ? LEVELS : [arg];
    for (const level of levels) {
        const started = Date.now();
        const r = runMatches({ games, count, level });
        const sorted = [...r.remaining].sort((a, b) => a - b);
        const avg = sorted.reduce((s, v) => s + v, 0) / Math.max(1, sorted.length);
        const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
        const pct = n => `${(n / Math.max(1, r.finished) * 100).toFixed(1)}%`;
        console.log(`${count}人・${level}・${games}試合（${Date.now() - started}ms）終わった ${r.finished}・止まった ${r.stuck}`);
        console.log(`  残り 平均 ${avg.toFixed(1)}・中央 ${median}・出し切り ${r.wins}（${pct(r.wins)}）・10枚以下 ${r.excellent}（${pct(r.excellent)}）`);
        console.log(`  分布 ${histogram(sorted).map(b => `${b.label}:${b.n}`).join('  ')}`);
    }
}
