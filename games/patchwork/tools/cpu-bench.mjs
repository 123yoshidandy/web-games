/**
 * CPU の強さと試合の長さを測る
 *   node tools/cpu-bench.mjs [試合数] [名前で絞り込み]
 *
 * easy / normal：画面で使う CPU（見落としとぶれあり）
 * strong：見落としもぶれもない同じ CPU（比べる相手）
 * simple：買えるパッチのうち「面積 − 値段」が一番大きいものを、左上から詰めて置く。買えなければ進む
 * random：打てる手からランダムに選ぶ
 */

import Game, { legalPlacements, patchArea } from '../public/js/game.js';
import { chooseCommand, CPU_STYLES } from '../public/js/cpu-player.js';
import { PATCHES } from '../public/js/patches.js';
import { createRandom } from '../public/js/random.js';

const GAMES = Number(process.argv[2] ?? 300);
const only = process.argv[3];

function leatherAnywhere(game) {
    const q = game.players[game.current].quilt;
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (q[y][x] === null) return { type: 'leather', x, y };
    return null;
}

const strategies = {
    easy: game => chooseCommand(game, game.current, CPU_STYLES.easy),
    normal: game => chooseCommand(game, game.current, CPU_STYLES.normal),
    strong: game => chooseCommand(game, game.current, CPU_STYLES.strong),
    simple: game => {
        if (game.pendingLeather) return leatherAnywhere(game);
        let best = null;
        let bestValue = 0;
        game.offer.forEach((id, choice) => {
            if (!game.canBuy(game.current, choice)) return;
            const value = patchArea(id) - PATCHES[id].cost;
            if (value > bestValue) {
                bestValue = value;
                best = { type: 'buy', choice, ...legalPlacements(game.players[game.current].quilt, id)[0] };
            }
        });
        return best ?? { type: 'advance' };
    },
    random: (game, random) => {
        if (game.pendingLeather) return leatherAnywhere(game);
        const options = [{ type: 'advance' }];
        game.offer.forEach((id, choice) => {
            if (!game.canBuy(game.current, choice)) return;
            const list = legalPlacements(game.players[game.current].quilt, id);
            options.push({ type: 'buy', choice, ...list[Math.floor(random() * list.length)] });
        });
        return options[Math.floor(random() * options.length)];
    }
};

function bench(a, b) {
    const stats = { [a]: { wins: 0, score: 0, empty: 0 }, [b]: { wins: 0, score: 0, empty: 0 } };
    let turns = 0;
    const start = performance.now();
    for (let i = 0; i < GAMES; i++) {
        const names = i % 2 === 0 ? [a, b] : [b, a];
        const game = new Game(names.map((n, k) => ({ name: `${n}${k}`, isCPU: true })), { seed: 1000 + i * 7919 });
        const random = createRandom(i);
        let steps = 0;
        while (!game.isOver) {
            if (++steps > 400) throw new Error(`終わらない試合 seed=${game.seed}`);
            if (!game.applyCommand(game.current, strategies[names[game.current]](game, random))) throw new Error(game.lastError);
        }
        turns += game.commands.length;
        names.forEach((name, seat) => {
            const s = game.result.standings.find(e => e.seat === seat);
            stats[name].score += s.total;
            stats[name].empty += s.empty;
            if (game.result.winner === seat) stats[name].wins++;
        });
    }
    const ms = performance.now() - start;
    const line = name => `${name}: 勝率 ${(100 * stats[name].wins / GAMES).toFixed(1)}% 平均 ${(stats[name].score / GAMES).toFixed(1)}点 空き ${(stats[name].empty / GAMES).toFixed(1)}マス`;
    if (a === b) {
        console.log(`[${a} 同士] ${GAMES}試合 / 平均 ${(turns / GAMES).toFixed(1)}手 / ${(ms / GAMES).toFixed(1)}ms  平均 ${(stats[a].score / GAMES / 2).toFixed(1)}点 空き ${(stats[a].empty / GAMES / 2).toFixed(1)}マス`);
    } else {
        console.log(`[${a} vs ${b}] ${GAMES}試合 / 平均 ${(turns / GAMES).toFixed(1)}手 / ${(ms / GAMES).toFixed(1)}ms`);
        console.log(`  ${line(a)} / ${line(b)}`);
    }
}

const pairs = [
    ['normal', 'normal'], ['easy', 'easy'], ['normal', 'strong'], ['easy', 'normal'],
    ['normal', 'simple'], ['easy', 'simple'], ['strong', 'simple'], ['normal', 'random'], ['simple', 'simple']
];
for (const [a, b] of pairs) {
    if (!only || a === only || b === only) bench(a, b);
}
