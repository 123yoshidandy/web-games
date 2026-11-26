/**
 * CPU 同士を多数回対戦させて、席ごとの勝ち数・ターン数・進まなくなった試合を数える
 * CPU の強さは1つなので、席（手番の順）による偏りと、ゲームが最後まで進むかを確かめる
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [拡張（+ でつなぐ。省略するとすべて）]
 *   例: node scripts/cpu-match.mjs 40 2 base+intrigue
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';

export const MAX_STEPS = 20000; // これを超えたら「長引いた」として数える（ルール上の終わりではない）

export function playMatch({ players, seed, cardSets }) {
    const names = Array.from({ length: players }, (_, i) => ({ name: `CPU${i + 1}`, isCPU: true }));
    const game = new Game(names, { seed, ...(cardSets ? { cardSets } : {}) });
    game.setup();
    let steps = 0;
    while (game.phase !== 'end' && steps < MAX_STEPS) {
        runCpuStep(game);
        steps++;
    }
    return { game, steps };
}

export function runMatches({ games, players, cardSets, seedBase = 1 }) {
    // wins[i]：i 番目の席の勝ち数（同点の1位はそれぞれに数える）
    const result = { wins: Array(players).fill(0), long: 0, turns: [], points: [] };
    for (let i = 0; i < games; i++) {
        const { game } = playMatch({ players, seed: seedBase + i, cardSets });
        if (game.phase !== 'end') {
            result.long++;
            continue;
        }
        result.turns.push(game.turnCount);
        const best = Math.max(...game.result.map(r => r.points));
        game.result.forEach(r => {
            result.points.push(r.points);
            if (r.points === best) result.wins[r.playerId]++;
        });
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 20);
    const players = Number(process.argv[3] ?? 2);
    const cardSets = process.argv[4]?.split('+');
    if (![2, 3, 4].includes(players)) throw new Error('人数は2〜4');
    const started = Date.now();
    const r = runMatches({ games, players, cardSets });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${players}人、${cardSets?.join('+') ?? 'すべての拡張'}）${Math.round((Date.now() - started) / 1000)}秒`);
    console.log(`席ごとの勝ち ${r.wins.map((w, i) => `${i + 1}番目 ${w}`).join('・')}・長引いた ${r.long}`);
    console.log(`ターン数 平均 ${avg(r.turns)}・勝利点 平均 ${avg(r.points)}`);
}
