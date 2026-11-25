/**
 * CPU の強さと試合の長さを測る
 *   node tools/cpu-bench.mjs [試合数] [名前で絞り込み] [--rules]
 *
 * easy / normal：画面で使う CPU（見落としとぶれあり）
 * strong：見落としもぶれもない同じ CPU（比べる相手）
 * simple：その場の得点がいちばん増える場所に置き、王冠の多いドミノを選ぶだけ（素朴な人の打ち方の目安）
 * random：打てる手からランダムに選ぶ
 * --rules を付けると、中王国と調和を入れて測る
 */

import Game, { DOMINOES, legalPlacements, scoreKingdom, dominoCells, cellKey } from '../public/js/game.js';
import { chooseCommand, CPU_STYLES } from '../public/js/cpu-player.js';
import { createRandom } from '../public/js/random.js';

const args = process.argv.slice(2);
const RULES = args.includes('--rules');
const [gamesArg, only] = args.filter(a => !a.startsWith('--'));
const GAMES = Number(gamesArg ?? 300);
const OPTIONS = RULES ? { middleKingdom: true, harmony: true } : {};

const pickRandom = (list, random) => list[Math.floor(random() * list.length)];
const freeSlots = game => game.pickLine.map((s, i) => (s.king === null ? i : -1)).filter(i => i >= 0);

function simpleCommand(game, random) {
    if (game.pickLine) {
        const free = freeSlots(game);
        const crowns = i => DOMINOES[game.pickLine[i].domino].halves.reduce((s, h) => s + h.crowns, 0);
        const most = Math.max(...free.map(crowns));
        return { type: 'pick', index: free.find(i => crowns(i) === most) };
    }
    const grid = game.players[game.currentSeat].grid;
    const domino = game.activeDomino;
    const moves = legalPlacements(grid, domino);
    if (!moves.length) return { type: 'discard' };
    const base = scoreKingdom(grid).points;
    let best = [];
    let bestValue = -Infinity;
    for (const m of moves) {
        const after = { ...grid };
        dominoCells(m.x, m.y, m.dir).forEach(([x, y], i) => { after[cellKey(x, y)] = domino.halves[i]; });
        const value = scoreKingdom(after).points - base;
        if (value > bestValue) { bestValue = value; best = [m]; } else if (value === bestValue) best.push(m);
    }
    return { type: 'place', ...pickRandom(best, random) };
}

const strategies = {
    easy: game => chooseCommand(game, game.currentSeat, CPU_STYLES.easy),
    normal: game => chooseCommand(game, game.currentSeat, CPU_STYLES.normal),
    strong: game => chooseCommand(game, game.currentSeat, CPU_STYLES.strong),
    simple: (game, random) => simpleCommand(game, random),
    random: (game, random) => {
        if (game.pickLine) return { type: 'pick', index: pickRandom(freeSlots(game), random) };
        const moves = game.getLegalPlacements();
        return moves.length ? { type: 'place', ...pickRandom(moves, random) } : { type: 'discard' };
    }
};

function play(names, seed) {
    const game = new Game(names.map((name, i) => ({ name: `${name}${i}`, isCPU: true })), { seed, ...OPTIONS });
    const random = createRandom(seed ^ 0x5bd1e995);
    let steps = 0;
    while (!game.isOver) {
        if (++steps > 500) throw new Error(`終わらない試合 seed=${seed}`);
        const seat = game.currentSeat;
        if (!game.applyCommand(seat, strategies[names[seat]](game, random))) throw new Error(game.lastError);
    }
    return game;
}

// 並びを試合ごとに回して、席の有利不利をならす
function bench(lineup) {
    const stats = Object.fromEntries([...new Set(lineup)].map(name => [name, { wins: 0, games: 0, score: 0, discarded: 0 }]));
    let turns = 0;
    const start = performance.now();
    for (let i = 0; i < GAMES; i++) {
        const shift = i % lineup.length;
        const names = lineup.map((_, k) => lineup[(k + shift) % lineup.length]);
        const game = play(names, 1000 + i * 7919);
        turns += game.commands.length;
        names.forEach((name, seat) => {
            const s = stats[name];
            s.games++;
            s.score += game.result.standings.find(e => e.seat === seat).total;
            s.discarded += game.players[seat].discarded;
            if (game.result.winners.includes(seat)) s.wins += 1 / game.result.winners.length;
        });
    }
    const ms = performance.now() - start;
    console.log(`[${lineup.join(' vs ')}] ${GAMES}試合 / 平均 ${(turns / GAMES).toFixed(1)} 手 / ${(ms / GAMES).toFixed(1)}ms/試合`);
    console.log(`  ${Object.entries(stats).map(([name, s]) =>
        `${name}: 勝率 ${(100 * s.wins / s.games).toFixed(1)}% 平均 ${(s.score / s.games).toFixed(1)}点 捨て ${(s.discarded / s.games).toFixed(2)}枚`).join(' / ')}`);
}

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
    ['normal', 'simple', 'simple', 'simple']
];
if (RULES) console.log('中王国・調和あり');
for (const lineup of lineups) {
    if (!only || lineup.includes(only)) bench(lineup);
}
