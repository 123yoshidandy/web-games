/**
 * CPU 同士を多数回対戦させて、勝率・手番の数・勝ち方を数える
 * 席による有利・不利を消すため、試合ごとに席を入れ替える
 * 使い方: node scripts/cpu-match.mjs [試合数] [強さA] [強さB] [tactics]（easy・normal・strong・random）
 *   例: node scripts/cpu-match.mjs 400 normal easy tactics
 */

import Game from '../public/js/game.js';
import { runCpuStep, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 3000;

export function playMatch({ profiles, seed, tactics = false }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true })), { seed, tactics });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = game.actor();
        if (!runCpuStep(game, seat, PROFILES[profiles[seat]])) break; // 進まなかった
        steps++;
    }
    return game;
}

// A と B を、席を入れ替えながら対戦させる。wins は [A, B]
export function runMatches({ games, a, b, tactics = false, seedBase = 1 }) {
    const result = { finished: 0, stuck: 0, turns: [], wins: [0, 0], draws: 0, reasons: { count: 0, adjacent: 0, stalled: 0 } };
    for (let i = 0; i < games; i++) {
        const swap = i % 2 === 1;
        const game = playMatch({ profiles: swap ? [b, a] : [a, b], seed: seedBase + i, tactics });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.turns.push(game.turn);
        result.reasons[game.winReason]++;
        if (game.winner === null) {
            result.draws++;
            continue;
        }
        const winnerIsA = (game.winner === 0) !== swap;
        result.wins[winnerIsA ? 0 : 1]++;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const a = process.argv[3] ?? 'normal';
    const b = process.argv[4] ?? 'easy';
    const tactics = process.argv[5] === 'tactics';
    const started = Date.now();
    const r = runMatches({ games, a, b, tactics });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${a} 対 ${b}、戦術カード${tactics ? 'あり' : 'なし'}、席は交互）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・引き分け ${r.draws}`);
    console.log(`手番の数 平均 ${avg(r.turns)}。決まり方 5つ ${r.reasons.count}・隣り合う3つ ${r.reasons.adjacent}・行き詰まり ${r.reasons.stalled}`);
    console.log(`${a} の勝率 ${(r.wins[0] / Math.max(1, r.finished) * 100).toFixed(1)}%（${r.wins[0]}勝${r.wins[1]}敗）`);
}
