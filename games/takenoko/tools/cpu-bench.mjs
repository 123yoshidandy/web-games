/**
 * CPU の強さと試合の長さを測る
 *   node tools/cpu-bench.mjs [試合数] [名前で絞り込み]
 *
 * easy / normal：画面で使う CPU（見落としとぶれあり）
 * strong：見落としもぶれもない同じ CPU（比べる相手）
 * random：打てる手からランダムに選ぶ（ただし達成できる目標は達成する）
 */

import Game from '../public/js/game.js';
import { chooseCommand, CPU_STYLES } from '../public/js/cpu-player.js';
import { randomCommand } from '../test/helpers.js';
import { createRandom } from '../public/js/random.js';

const GAMES = Number(process.argv[2] ?? 100);
const only = process.argv[3];
const MAX_COMMANDS = 4000;

const strategies = {
    easy: game => chooseCommand(game, game.current, CPU_STYLES.easy),
    normal: game => chooseCommand(game, game.current, CPU_STYLES.normal),
    strong: game => chooseCommand(game, game.current, CPU_STYLES.strong),
    random: (game, random) => randomCommand(game, random)
};

function bench(lineup) {
    const stats = Object.fromEntries([...new Set(lineup)].map(n => [n, { wins: 0, games: 0, score: 0, done: 0 }]));
    let turns = 0;
    let stalls = 0;
    let finished = 0;
    const start = performance.now();
    for (let i = 0; i < GAMES; i++) {
        const shift = i % lineup.length;
        const names = lineup.map((_, k) => lineup[(k + shift) % lineup.length]);
        const game = new Game(names.map((n, k) => ({ name: `${n}${k}`, isCPU: true })), { seed: 1000 + i * 7919 });
        const random = createRandom(i);
        let steps = 0;
        while (!game.isOver && steps < MAX_COMMANDS) {
            steps++;
            if (!game.applyCommand(game.current, strategies[names[game.current]](game, random))) {
                throw new Error(`${game.lastError} seed=${game.seed}`);
            }
        }
        if (!game.isOver) { stalls++; continue; }
        finished++;
        turns += game.commands.filter(c => c.command.type === 'endTurn').length;
        names.forEach((name, seat) => {
            const s = game.result.standings.find(e => e.seat === seat);
            stats[name].games++;
            stats[name].score += s.total;
            stats[name].done += s.count;
            if (game.result.winners.includes(seat)) stats[name].wins += 1 / game.result.winners.length;
        });
    }
    const ms = performance.now() - start;
    console.log(`[${lineup.join(' vs ')}] ${GAMES}試合（終わらない ${stalls}）/ 平均 ${(turns / Math.max(1, finished)).toFixed(1)}手番 / ${(ms / GAMES).toFixed(0)}ms/試合`);
    console.log(`  ${Object.entries(stats).map(([n, s]) => `${n}: 勝率 ${(100 * s.wins / Math.max(1, s.games)).toFixed(1)}% 平均 ${(s.score / Math.max(1, s.games)).toFixed(1)}点 目標 ${(s.done / Math.max(1, s.games)).toFixed(1)}枚`).join(' / ')}`);
}

const lineups = [
    ['normal', 'normal'], ['normal', 'normal', 'normal'], ['normal', 'normal', 'normal', 'normal'],
    ['easy', 'easy'], ['normal', 'strong'], ['easy', 'normal'], ['normal', 'random'], ['easy', 'random']
];
for (const lineup of lineups) {
    if (!only || lineup.includes(only)) bench(lineup);
}
