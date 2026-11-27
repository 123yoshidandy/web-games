// CPU どうしの対戦：強さの組ごとに多くのシードで戦わせ、勝率・取ったセット・試合の長さを出す。止まる試合がないかも確かめる
// 使い方: node scripts/cpu-match.mjs [--games 200]
import Game, { findSets } from '../public/js/game.js';
import { runCpuUntil } from '../public/js/cpu-player.js';

const args = process.argv.slice(2);
const GAMES = Number(args[args.indexOf('--games') + 1]) || 200;
const PAIRS = [['easy', 'normal'], ['normal', 'hard'], ['easy', 'hard'], ['normal', 'normal']];
const NAMES = { easy: 'やさしい', normal: 'ふつう', hard: 'つよい' };
const MAX_COMMANDS = 200;
const fmt = (ms) => `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`;

let stalls = 0;
for (const pair of PAIRS) {
    const wins = [0, 0];
    let draws = 0;
    const sets = [0, 0];
    let time = 0;
    for (let i = 0; i < GAMES; i++) {
        // 席の並びの有利をなくすため、半分は席を入れ替える
        const swap = i % 2 === 1;
        const levels = swap ? [pair[1], pair[0]] : [...pair];
        const game = new Game([{ name: 'A', isCPU: true }, { name: 'B', isCPU: true }], { seed: 1000 + i, mode: 'cpu', level: 'normal' });
        runCpuUntil(game, Infinity, MAX_COMMANDS, levels);
        if (!game.isOver || findSets(game.board).length > 0) {
            stalls++;
            console.log(`止まった試合：シード ${1000 + i}（${levels.join(' / ')}）`);
            continue;
        }
        const of = (seat) => (swap ? 1 - seat : seat); // 席 → 組の何番目か
        const { winners } = game.result;
        if (winners.length > 1) draws++;
        else wins[of(winners[0])]++;
        game.players.forEach((player, seat) => { sets[of(seat)] += player.sets; });
        time += game.result.time;
    }
    const rate = (n) => `${((n / GAMES) * 100).toFixed(1)}%`;
    console.log(`${NAMES[pair[0]]} 対 ${NAMES[pair[1]]}：${rate(wins[0])} / ${rate(wins[1])}（引き分け ${rate(draws)}）`
        + `　平均セット ${(sets[0] / GAMES).toFixed(1)} / ${(sets[1] / GAMES).toFixed(1)}　平均の長さ ${fmt(time / GAMES)}`);
}
console.log(stalls ? `止まった試合が ${stalls} 件` : `止まった試合はありません（${PAIRS.length * GAMES} 試合）`);
process.exitCode = stalls ? 1 : 0;
