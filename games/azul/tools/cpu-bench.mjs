/**
 * CPU の強さと試合の長さを測る
 *   node tools/cpu-bench.mjs [試合数]
 *
 * normal：画面で使う CPU（見落としとぶれあり）
 * strong：見落としもぶれもない同じ CPU（比べる相手）
 * simple：パターンラインに置ける枚数が多く、床に落ちる枚数が少ない手を選ぶだけ（素朴な人の打ち方の目安）
 * random：打てる手からランダムに選ぶ
 */

import Game from '../public/js/game.js';
import { chooseMove, CPU_STYLES } from '../public/js/cpu-player.js';
import { createRandom } from '../public/js/random.js';

const GAMES = Number(process.argv[2] ?? 400);
const MAX_STEPS = 1000;

function simpleMove(game, random) {
    const moves = game.getLegalMoves();
    let best = [];
    let bestValue = -Infinity;
    for (const m of moves) {
        const player = game.players[game.current];
        const placed = m.line === 'floor' ? 0 : Math.min(m.count, m.line + 1 - player.lines[m.line].count);
        const value = placed * 2 - (m.count - placed) * 3;
        if (value > bestValue) { bestValue = value; best = [m]; } else if (value === bestValue) best.push(m);
    }
    return best[Math.floor(random() * best.length)];
}

const strategies = {
    easy: game => chooseMove(game, game.current, CPU_STYLES.easy),
    normal: game => chooseMove(game, game.current, CPU_STYLES.normal),
    strong: game => chooseMove(game, game.current, CPU_STYLES.strong),
    simple: (game, random) => simpleMove(game, random),
    random: (game, random) => {
        const moves = game.getLegalMoves();
        return moves[Math.floor(random() * moves.length)];
    }
};

function play(names, seed) {
    const game = new Game(names.map((name, i) => ({ name: `${name}${i}`, isCPU: true })), { seed });
    const random = createRandom(seed ^ 0x5bd1e995);
    let steps = 0;
    while (!game.isOver) {
        if (++steps > MAX_STEPS) throw new Error(`終わらない試合 seed=${seed}`);
        const m = strategies[names[game.current]](game, random);
        if (!game.applyCommand(game.current, { type: 'take', source: m.source, color: m.color, line: m.line })) {
            throw new Error(game.lastError);
        }
    }
    return game;
}

// lineup の並びを試合ごとに回して、席の有利不利をならす
function bench(lineup, games = GAMES) {
    const stats = Object.fromEntries([...new Set(lineup)].map(name => [name, { wins: 0, games: 0, score: 0 }]));
    let rounds = 0;
    let turns = 0;
    const start = performance.now();
    for (let i = 0; i < games; i++) {
        const shift = i % lineup.length;
        const names = lineup.map((_, k) => lineup[(k + shift) % lineup.length]);
        const game = play(names, 1000 + i * 7919);
        rounds += game.round;
        turns += game.commands.length;
        const winners = game.result.winners;
        names.forEach((name, seat) => {
            stats[name].games++;
            stats[name].score += game.players[seat].score;
            if (winners.includes(seat)) stats[name].wins += 1 / winners.length;
        });
    }
    const ms = performance.now() - start;
    // 同じ名前が複数の席にいるときは、席ごとの勝率（勝ち数 ÷ 席の数）
    const parts = Object.entries(stats).map(([name, s]) =>
        `${name}: 勝率 ${(100 * s.wins / s.games).toFixed(1)}% 平均 ${(s.score / s.games).toFixed(1)}点`);
    console.log(`[${lineup.join(' vs ')}] ${games}試合 / 平均 ${(rounds / games).toFixed(2)} ラウンド・${(turns / games).toFixed(1)} 手 / ${(ms / games).toFixed(1)}ms/試合`);
    console.log(`  ${parts.join(' / ')}`);
}

const only = process.argv[3];
const lineups = [
    ['normal', 'normal'],
    ['normal', 'normal', 'normal'],
    ['normal', 'normal', 'normal', 'normal'],
    ['easy', 'easy'],
    ['normal', 'strong'],
    ['easy', 'normal'],
    ['normal', 'simple'],
    ['easy', 'simple'],
    ['normal', 'random'],
    ['strong', 'simple'],
    ['simple', 'simple'],
    ['normal', 'simple', 'simple', 'simple'],
    ['easy', 'simple', 'simple', 'simple']
];
for (const lineup of lineups) {
    if (!only || lineup.includes(only)) bench(lineup);
}
