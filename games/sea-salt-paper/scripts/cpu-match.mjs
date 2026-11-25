/**
 * CPU 同士を多数回対戦させて、勝率・ラウンドの数・ラウンドの終わり方を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（easy,normal,strong）]
 *   例: node scripts/cpu-match.mjs 400 2 easy,normal
 * 席の並びによる有利・不利をならすため、最初の手番は試合ごとに入れ替える
 */

import Game from '../public/js/game.js';
import { runCpuStep, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 20000;

export function playMatch({ count, profiles, seed }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true, cpuLevel: p })), { seed, startPlayer: seed % count });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const before = game.commands.length;
        const seat = game.current;
        runCpuStep(game, seat, PROFILES[profiles[seat]]);
        if (game.commands.length === before) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, count, profiles, seedBase = 1 }) {
    const wins = Array(count).fill(0);
    const result = { finished: 0, stuck: 0, rounds: [], scores: [], mermaids: 0, reasons: { stop: 0, lastChance: 0, deckEmpty: 0 }, lastChanceWon: 0, wins };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ count, profiles, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        if (game.endReason === 'mermaids') result.mermaids++;
        result.rounds.push(game.round);
        result.scores.push(Math.max(...game.players.map(p => p.score)));
        game.winners.forEach(id => { wins[id] += 1; });
        replayReasons(game, result);
    }
    return result;
}

// ラウンドの終わり方を数える（記録から作り直して、ラウンドごとの結果を拾う）
function replayReasons(game, result) {
    const copy = new Game(game.persist().players, game.options);
    let seen = 0;
    for (const { playerId, command } of game.commands) {
        copy.applyCommand(playerId, command);
        if (copy.history.length > seen) {
            seen = copy.history.length;
            const r = copy.roundResult;
            result.reasons[r.reason]++;
            if (r.reason === 'lastChance' && r.success) result.lastChanceWon++;
        }
    }
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 200);
    const count = Number(process.argv[3] ?? 2);
    const profiles = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    if (profiles.length !== count) throw new Error('席の数と強さの数が合いません');
    const started = Date.now();
    const r = runMatches({ games, count, profiles });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    const rs = r.reasons;
    console.log(`${games}試合（${count}人：${profiles.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・人魚4枚で勝った ${r.mermaids}`);
    console.log(`ラウンドの数 平均 ${avg(r.rounds)}・勝者の点 平均 ${avg(r.scores)}`);
    console.log(`ラウンドの終わり方 ストップ ${rs.stop}・ラストチャンス ${rs.lastChance}（成功 ${r.lastChanceWon}）・山札切れ ${rs.deckEmpty}`);
    profiles.forEach((p, i) => console.log(`席${i}（${p}）の勝率 ${(r.wins[i] / Math.max(1, r.finished) * 100).toFixed(1)}%`));
}
