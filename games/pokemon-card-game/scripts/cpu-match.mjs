/**
 * CPU 同士を、構築済みデッキの総当たりで対戦させて、デッキごとの勝率と終わり方を数える
 * （CPU の強さは1つだけなので、デッキの強さの差と、止まらずに決着するかを確かめる）
 * 使い方: node scripts/cpu-match.mjs [1組あたりの試合数] [デッキのID（カンマ区切り、省くと全部）] [最初のシード]
 *   例: node scripts/cpu-match.mjs 4 dragapult,garchomp
 * 1組の試合は、先の席とあとの席を交互に入れ替える
 */

import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu-player.js';
import { DECKS, expandDeck } from '../public/js/decks.js';

const MAX_STEPS = 5000;

export function playMatch({ deckIds, seed }) {
    const players = deckIds.map(id => ({ name: id, isCPU: true }));
    const decks = deckIds.map(id => expandDeck(DECKS.find(deck => deck.id === id)));
    const game = new Game(players, { seed, decks });
    game.setup();
    let steps = 0;
    while (game.phase !== 'end' && steps < MAX_STEPS) {
        if (!runCpuStep(game)) break; // 進まなかった
        steps++;
    }
    return game;
}

export function runMatches({ games, deckIds, seedBase = 1 }) {
    const stats = Object.fromEntries(deckIds.map(id => [id, { wins: 0, played: 0 }]));
    const result = { finished: 0, stuck: 0, draws: 0, reasons: {}, turns: [], stats };
    let seed = seedBase;
    deckIds.forEach((a, i) => deckIds.slice(i + 1).forEach(b => {
        for (let k = 0; k < games; k++) {
            const seats = k % 2 === 0 ? [a, b] : [b, a];
            const game = playMatch({ deckIds: seats, seed: seed++ });
            if (game.phase !== 'end') {
                result.stuck++;
                continue;
            }
            result.finished++;
            result.reasons[game.endReason] = (result.reasons[game.endReason] ?? 0) + 1;
            result.turns.push(game.turn);
            seats.forEach(id => { stats[id].played++; });
            if (game.winner === 'draw') {
                result.draws++;
                seats.forEach(id => { stats[id].wins += 0.5; });
            } else {
                stats[seats[game.winner]].wins++;
            }
        }
    }));
    return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    const games = Number(process.argv[2] ?? 2);
    const deckIds = process.argv[3] ? process.argv[3].split(',') : DECKS.map(deck => deck.id);
    const unknown = deckIds.filter(id => !DECKS.some(deck => deck.id === id));
    if (unknown.length) throw new Error(`デッキ ${unknown.join('・')} はない（${DECKS.map(deck => deck.id).join('・')}）`);
    if (deckIds.length < 2) throw new Error('デッキは2つ以上');
    const started = Date.now();
    const r = runMatches({ games, deckIds, seedBase: Number(process.argv[4] ?? 1) });
    const avg = list => (list.reduce((s, v) => s + v, 0) / Math.max(1, list.length)).toFixed(1);
    console.log(`${deckIds.length}デッキの総当たり、1組 ${games} 試合（${Date.now() - started}ms）`);
    console.log(`終わった ${r.finished}（引き分け ${r.draws}）・進まなくなった ${r.stuck}`);
    console.log(`終わり方 ${Object.entries(r.reasons).map(([reason, n]) => `${reason} ${n}`).join('・')}`);
    console.log(`番の数の平均 ${avg(r.turns)}`);
    deckIds
        .map(id => ({ id, name: DECKS.find(deck => deck.id === id).name, ...r.stats[id] }))
        .sort((x, y) => y.wins / Math.max(1, y.played) - x.wins / Math.max(1, x.played))
        .forEach(s => console.log(`${s.name}（${s.id}）の勝率 ${(s.wins / Math.max(1, s.played) * 100).toFixed(1)}%（${s.played} 試合）`));
}
