/**
 * CPU 同士を多数回対戦させて、強さごとの勝率・決着のしかた・進まなくなった試合を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [最初のシード]
 *   強さの組（やさしい・ふつう・つよい）ごとに、先手と後手を入れ替えて半分ずつ遊ぶ
 */

import Game from '../public/js/game.js';
import { chooseCommand, LEVELS, LEVEL_NAMES } from '../public/js/cpu-player.js';

const MAX_STEPS = 2000;

// levels[seat] の強さで、終局まで打つ
export function playMatch({ levels, seed, first = 0 }) {
    const game = new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], { seed, first });
    let steps = 0;
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = game.actors()[0];
        const command = chooseCommand(game, seat, levels[seat]);
        if (!command || !game.applyCommand(seat, command)) break;
        steps++;
    }
    return game;
}

// a と b の強さで games 試合。a の勝ち・負け・引き分けと、KO・判定の数、進まなくなった数
export function runMatches({ a, b, games, seedBase = 1 }) {
    const r = { wins: 0, losses: 0, draws: 0, ko: 0, time: 0, stuck: 0, rounds: 0 };
    for (let n = 0; n < games; n++) {
        const aSeat = n % 2;
        const levels = aSeat === 0 ? [a, b] : [b, a];
        const game = playMatch({ levels, seed: seedBase + Math.floor(n / 2), first: 0 });
        if (!game.isOver()) {
            r.stuck++;
            continue;
        }
        const w = game.result.winner;
        if (w === null) r.draws++;
        else if (w === aSeat) r.wins++;
        else r.losses++;
        r[game.result.reason]++;
        r.rounds += game.round;
    }
    return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 40);
    const seedBase = Number(process.argv[3] ?? 1);
    const pairs = [['normal', 'easy'], ['hard', 'easy'], ['hard', 'normal'], ['hard', 'hard']];
    let stuck = 0;
    for (const [a, b] of pairs) {
        const started = Date.now();
        const r = runMatches({ a, b, games, seedBase });
        stuck += r.stuck;
        const done = games - r.stuck;
        console.log(`${LEVEL_NAMES[a]} 対 ${LEVEL_NAMES[b]}・${games}試合（${((Date.now() - started) / 1000).toFixed(1)}秒）`
            + `：${r.wins}勝 ${r.losses}敗 ${r.draws}分（勝率 ${(100 * r.wins / Math.max(1, done)).toFixed(0)}%）`
            + ` KO ${r.ko}・判定 ${r.time}・平均 ${(r.rounds / Math.max(1, done)).toFixed(1)}ターン${r.stuck ? `・進まなくなった ${r.stuck}` : ''}`);
    }
    if (stuck) process.exitCode = 1;
    console.log(`強さ：${LEVELS.map(l => LEVEL_NAMES[l]).join(' < ')}`);
}
