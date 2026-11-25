import Game, { FIRST } from '../public/js/game.js';
import { createRandom } from '../public/js/random.js';

export const PLAYERS = n => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: false }));

export const newGame = (n = 2, seed = 1) => new Game(PLAYERS(n), { seed });

// 壁を文字列から作る（'x' が置いてある場所）
export const wallFrom = rows => rows.map(row => [...row].map(ch => ch === 'x'));

// 全部のタイルの数（袋・ふた・工房・中央・パターンライン・壁・床）
export function countTiles(game) {
    let total = game.bag.length + game.lid.length + game.center.length;
    for (const f of game.factories) total += f.length;
    for (const p of game.players) {
        total += p.lines.reduce((sum, line) => sum + line.count, 0);
        total += p.wall.flat().filter(Boolean).length;
        total += p.floor.filter(item => item !== FIRST).length;
    }
    return total;
}

// 打てる手からランダムに選んで、最後まで進める
export function playRandom(game, seed, maxSteps = 2000) {
    const random = createRandom(seed);
    let steps = 0;
    while (!game.isOver && steps < maxSteps) {
        const moves = game.getLegalMoves();
        const move = moves[Math.floor(random() * moves.length)];
        const ok = game.applyCommand(game.current, { type: 'take', source: move.source, color: move.color, line: move.line });
        if (!ok) throw new Error(game.lastError);
        steps++;
    }
    return steps;
}

// ロジックの状態を比べるための JSON（乱数の関数は除く）
export const snapshot = game => JSON.stringify({
    bag: game.bag, lid: game.lid, factories: game.factories, center: game.center, firstInCenter: game.firstInCenter,
    firstTakenBy: game.firstTakenBy, startSeat: game.startSeat, current: game.current, round: game.round,
    phase: game.phase, players: game.players, commands: game.commands, result: game.result
});
