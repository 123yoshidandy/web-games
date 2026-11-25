/**
 * CPU 同士を多数回対戦させて、金鉱掘りとお邪魔者の勝ち数・ラウンドの手数・正体の当たり方を数える
 * 使い方: node scripts/cpu-match.mjs [試合数] [人数] [強さ（normal・strong・random。全員同じ）]
 *   例: node scripts/cpu-match.mjs 100 5 normal
 */

import Game from '../public/js/game.js';
import { createGameView } from '../public/js/game-view.js';
import { runCpuStep, suspicions, PROFILES } from '../public/js/cpu-player.js';

const MAX_STEPS = 3000;

export function playMatch({ count, profile, seed, profiles }) {
    const game = new Game(Array.from({ length: count }, (_, i) => ({ name: `CPU${i}`, isCPU: true })), { seed });
    let steps = 0;
    // 正体の当たり方：金鉱掘りの CPU の手番ごとに、いちばん疑った人がお邪魔者だったか（中盤：山札20〜35枚、終盤：10枚未満）
    const guesses = { right: 0, total: 0, midRight: 0, midTotal: 0 };
    while (!game.isOver() && steps < MAX_STEPS) {
        const seat = game.current;
        const p = profiles ? PROFILES[profiles[seat]] : PROFILES[profile];
        if (game.players[seat].role === 'digger' && game.players.some(x => x.role === 'saboteur')) {
            const view = createGameView(game, seat);
            const s = suspicions(view);
            s[seat] = -Infinity;
            const top = s.indexOf(Math.max(...s));
            if (game.deck.length < 10) {
                guesses.total++;
                if (game.players[top].role === 'saboteur') guesses.right++;
            } else if (game.deck.length >= 20 && game.deck.length <= 35) {
                guesses.midTotal++;
                if (game.players[top].role === 'saboteur') guesses.midRight++;
            }
        }
        if (!runCpuStep(game, seat, p)) break; // 進まなかった
        steps++;
    }
    return { game, guesses };
}

export function runMatches({ games, count, profile = 'normal', seedBase = 1 }) {
    const result = { finished: 0, stuck: 0, rounds: 0, diggers: 0, saboteurs: 0, turns: [], right: 0, total: 0, midRight: 0, midTotal: 0 };
    for (let i = 0; i < games; i++) {
        const { game, guesses } = playMatch({ count, profile, seed: seedBase + i });
        if (!game.isOver()) {
            result.stuck++;
            continue;
        }
        result.finished++;
        game.history.forEach(h => {
            result.rounds++;
            if (h.winner === 'diggers') result.diggers++;
            else result.saboteurs++;
        });
        result.turns.push(game.commands.length / game.history.length);
        result.right += guesses.right;
        result.total += guesses.total;
        result.midRight += guesses.midRight;
        result.midTotal += guesses.midTotal;
    }
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 100);
    const count = Number(process.argv[3] ?? 5);
    const profile = process.argv[4] ?? 'normal';
    const started = Date.now();
    const r = runMatches({ games, count, profile });
    const avg = (list) => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${games}試合（${count}人・${profile}）${Date.now() - started}ms`);
    console.log(`終わった ${r.finished}・進まなくなった ${r.stuck}`);
    console.log(`ラウンド ${r.rounds}：金鉱掘りの勝ち ${(r.diggers / Math.max(1, r.rounds) * 100).toFixed(1)}%・お邪魔者の勝ち ${(r.saboteurs / Math.max(1, r.rounds) * 100).toFixed(1)}%・1ラウンドの手数 平均 ${avg(r.turns)}`);
    console.log(`金鉱掘りがいちばん疑った人がお邪魔者だった割合（中盤） ${(r.midRight / Math.max(1, r.midTotal) * 100).toFixed(1)}%（${r.midTotal}回）`);
    console.log(`金鉱掘りがいちばん疑った人がお邪魔者だった割合（終盤） ${(r.right / Math.max(1, r.total) * 100).toFixed(1)}%（${r.total}回）`);
}
