/**
 * CPU 同士を多数回対戦させて、陣営ごとの勝率・得点・巡の数・終わり方を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [陣営（marquise,eyrie,alliance,vagabond のうち2〜4つ）]
 *   例: node scripts/cpu-match.mjs 200 marquise,eyrie,alliance,vagabond
 * 席の順と最初の手番はシードで変わるので、席による有利・不利は試合数で均される
 */

import Game from '../public/js/game.js';
import { runCpuStep, cpuActors } from '../public/js/cpu-player.js';
import { FACTION_INFO } from '../public/js/data.js';
import { createRandom, shuffle } from '../public/js/random.js';

const MAX_STEPS = 20000;

export function playMatch({ factions, seed }) {
    const order = shuffle([...factions], createRandom(seed ^ 0x5bd1e995));
    const game = new Game(order.map(f => ({ name: FACTION_INFO[f].name, faction: f, isCPU: true })), { seed });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = cpuActors(game)[0];
        if (seat === undefined || !runCpuStep(game, seat)) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, factions, seedBase = 1 }) {
    const wins = Object.fromEntries(factions.map(f => [f, 0]));
    const scores = Object.fromEntries(factions.map(f => [f, []]));
    const result = { finished: 0, stuck: 0, rounds: [], reasons: {}, wins, scores, steps: [] };
    for (let i = 0; i < games; i++) {
        const game = playMatch({ factions, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        result.rounds.push(game.round);
        result.steps.push(game.commands.length);
        result.reasons[game.endReason] = (result.reasons[game.endReason] ?? 0) + 1;
        game.players.forEach(p => scores[p.faction].push(p.score));
        game.winners.forEach(id => { wins[game.players[id].faction] += 1 / game.winners.length; });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const factions = (process.argv[3] ?? 'marquise,eyrie,alliance,vagabond').split(',');
    if (factions.some(f => !FACTION_INFO[f])) throw new Error('陣営は marquise・eyrie・alliance・vagabond のどれかです');
    const started = Date.now();
    const r = runMatches({ games, factions });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${factions.map(f => FACTION_INFO[f].name).join('・')}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}・巡の数の平均 ${avg(r.rounds)}・手数の平均 ${avg(r.steps)}`);
    console.log(`終わり方 ${Object.entries(r.reasons).map(([k, v]) => `${{ score: '30点', dominance: '支配', rounds: '巡の上限' }[k]} ${v}`).join('・')}`);
    factions.forEach(f => console.log(`${FACTION_INFO[f].name}の勝率 ${(r.wins[f] / Math.max(1, r.finished) * 100).toFixed(1)}%・得点の平均 ${avg(r.scores[f])}`));
}
