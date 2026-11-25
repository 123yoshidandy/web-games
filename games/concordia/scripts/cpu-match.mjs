/**
 * CPU 同士を多数回対戦させて、勝率・手番の数・終わり方・点を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [席ごとの強さ（easy,normal）]
 *   例: node scripts/cpu-match.mjs 200 2 easy,normal
 * 席の並びによる有利・不利をならすため、試合ごとに強さの並びを1つずつずらす
 */

import Game from '../public/js/game.js';
import { runCpuStep, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 5000;

export function playMatch({ profiles, seed }) {
    const game = new Game(profiles.map((p, i) => ({ name: `${p}${i}`, isCPU: true, cpuLevel: p })), { seed });
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

export function runMatches({ games, profiles, seedBase = 1 }) {
    const count = profiles.length;
    const wins = Object.fromEntries(profiles.map(p => [p, 0]));
    const seats = Array(count).fill(0);
    const result = { finished: 0, stuck: 0, turns: [], scores: [], houses: [], byConcordia: { houses: 0, market: 0 }, wins, seats, points: Object.fromEntries(profiles.map(p => [p, []])) };
    for (let i = 0; i < games; i++) {
        // 強さの並びを試合ごとにずらす
        const shift = i % count;
        const order = profiles.map((_, s) => profiles[(s + shift) % count]);
        const game = playMatch({ profiles: order, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.turns.push(game.turn);
        result.scores.push(Math.max(...game.results.map(r => r.total)));
        result.houses.push(...game.players.map(p => 15 - game.housesLeft(p.id)));
        if (game.housesLeft(game.concordiaBy) === 0) result.byConcordia.houses++;
        else result.byConcordia.market++;
        const winner = game.winners[0];
        wins[order[winner]] += 1 / profiles.filter(p => p === order[winner]).length;
        seats[winner]++;
        game.results.forEach(r => result.points[order[r.id]].push(r.total));
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const count = Number(process.argv[3] ?? 2);
    const profiles = (process.argv[4] ?? Array(count).fill('normal').join(',')).split(',');
    if (profiles.length !== count) throw new Error('席の数と強さの数が合いません');
    const started = Date.now();
    const r = runMatches({ games, profiles });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${count}人：${profiles.join(' / ')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}`);
    console.log(`手番の周回 平均 ${avg(r.turns)}・勝者の点 平均 ${avg(r.scores)}・家の数 平均 ${avg(r.houses)}`);
    console.log(`終わり方 15軒目 ${r.byConcordia.houses}・市場の最後 ${r.byConcordia.market}`);
    [...new Set(profiles)].forEach(p => console.log(`${p}：勝率 ${(r.wins[p] / Math.max(1, r.finished) * 100).toFixed(1)}%・平均点 ${avg(r.points[p])}`));
    console.log(`席ごとの勝ち ${r.seats.join(' / ')}`);
}
