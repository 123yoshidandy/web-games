// CPU どうしの対戦：強さの組ごとに多くのシードで戦わせ、勝率・当たりとまちがいのベル・試合の長さを出す。止まる試合がないかも確かめる
// 使い方: node scripts/cpu-match.mjs [--games 200] [--players 2]
import Game from '../public/js/game.js';
import { runUntil } from '../public/js/cpu-player.js';

const args = process.argv.slice(2);
const option = (name, fallback) => (args.includes(name) ? Number(args[args.indexOf(name) + 1]) || fallback : fallback);
const GAMES = option('--games', 200);
const PLAYERS = Math.min(6, Math.max(2, option('--players', 2)));
const PAIRS = [['easy', 'normal'], ['normal', 'hard'], ['easy', 'hard'], ['normal', 'normal']];
const NAMES = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };
const MAX_EVENTS = 20000;
const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

let stalls = 0;
for (const pair of PAIRS) {
    const wins = [0, 0];
    let draws = 0;
    const bells = [0, 0];
    const misses = [0, 0];
    let time = 0;
    let byLast = 0;
    for (let i = 0; i < GAMES; i++) {
        // 席の並びの有利をなくすため、組の2つを席に交互に割り当て、半分は始まりの席をずらす
        const shift = i % 2;
        const levels = Array.from({ length: PLAYERS }, (_, seat) => pair[(seat + shift) % 2]);
        const game = new Game(levels.map((_, seat) => ({ name: `C${seat}`, isCPU: true })), { seed: 1000 + i, mode: 'cpu', level: 'normal' });
        runUntil(game, Infinity, MAX_EVENTS, levels);
        if (!game.isOver) {
            stalls++;
            console.log(`止まった試合：シード ${1000 + i}（${levels.join(' / ')}）`);
            continue;
        }
        const side = (seat) => (seat + shift) % 2; // 席 → 組の何番目か
        const { winners, reason } = game.result;
        const sides = new Set(winners.map(side));
        if (sides.size > 1) draws++;
        else wins[[...sides][0]]++;
        game.players.forEach((player, seat) => {
            bells[side(seat)] += player.bells;
            misses[side(seat)] += player.misses;
        });
        time += game.result.time;
        if (reason === 'last') byLast++;
    }
    const rate = (n) => `${((n / GAMES) * 100).toFixed(1)}%`;
    const avg = (n) => (n / GAMES).toFixed(1);
    console.log(`${NAMES[pair[0]]} 対 ${NAMES[pair[1]]}（${PLAYERS}人）：${rate(wins[0])} / ${rate(wins[1])}（引き分け ${rate(draws)}）`
        + `　当たり ${avg(bells[0])} / ${avg(bells[1])}　まちがい ${avg(misses[0])} / ${avg(misses[1])}`
        + `　平均の長さ ${fmt(time / GAMES)}　最後の1人で決着 ${rate(byLast)}`);
}
console.log(stalls ? `止まった試合が ${stalls} 件` : `止まった試合はありません（${PAIRS.length * GAMES} 試合）`);
process.exitCode = stalls ? 1 : 0;
