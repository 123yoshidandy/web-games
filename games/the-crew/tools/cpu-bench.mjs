// CPU だけで各ミッションを遊び、成功の割合を数える。止まったゲームがないかも確かめる
// 使い方：node tools/cpu-bench.mjs --players 4 --games 20 --missions 1-50 --style normal
import Game from '../public/js/game.js';
import { runCpuStep } from '../public/js/cpu.js';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, xs) => (a.startsWith('--') ? [...acc, [a.slice(2), xs[i + 1]]] : acc), []));
const players = Number(args.players ?? 4);
const games = Number(args.games ?? 20);
const style = args.style ?? 'normal';
const [from, to] = (args.missions ?? '1-50').split('-').map(Number);

let stalls = 0;
let totalWins = 0;
let totalGames = 0;
const started = Date.now();
for (let mission = from; mission <= (to ?? from); mission++) {
    let wins = 0;
    for (let i = 0; i < games; i++) {
        const seed = (mission * 1000 + i * 7 + players * 100000) >>> 0;
        const game = new Game(Array.from({ length: players }, (_, k) => ({ name: `CPU${k + 1}`, isCPU: true })), { seed, mission });
        let steps = 0;
        while (!game.isOver && steps < 2000) {
            if (!runCpuStep(game, style)) break;
            steps++;
        }
        if (!game.isOver) {
            stalls++;
            console.log(`止まった：ミッション${mission} シード${seed} ${game.phase} ${game.lastError}`);
            continue;
        }
        if (game.result.success) wins++;
    }
    totalWins += wins;
    totalGames += games;
    console.log(`ミッション${String(mission).padStart(2)}：${String(Math.round((wins / games) * 100)).padStart(3)}%（${wins}/${games}）`);
}
console.log(`合計：${Math.round((totalWins / totalGames) * 100)}%（${totalWins}/${totalGames}） 止まった：${stalls} 時間：${((Date.now() - started) / 1000).toFixed(1)}秒`);
