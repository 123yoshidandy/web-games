/**
 * CPU（DOM に依存しない）
 *
 * 打てる手を全部挙げ、手ごとに「このラウンドで得られそうな点数」を見積もって、いちばん高い手を選ぶ。
 * 強すぎないように、人間らしい見落としを入れる：
 *   - 工房や中央をいくつか見落とす（見ていない場所の手は選ばない）
 *   - 見積もりにぶれを足す
 * CPU の判断は記録されないので、ゲームの乱数は使わない。状態から作ったシード付きの別の乱数を使う。
 */

import {
    floorPenaltyFor, placementScore, wallColumn, BONUS
} from './game.js';
import { createRandom } from './random.js';

// 強さの設定。overlook：場所ごとの見落としの確率、noise：見積もりのぶれ（点）
export const CPU_STYLES = {
    easy: { overlook: 0.4, noise: 3.5 },
    normal: { overlook: 0.22, noise: 1.6 },
    strong: { overlook: 0, noise: 0 } // 強さを測るときの比べる相手。画面では使わない
};

function cpuRandom(game, seat) {
    let seed = (game.seed ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0;
    return createRandom(seed);
}

// 場に見えているその色の枚数（取ったあとに残る分）
function visibleCount(game, color, exceptSource) {
    let total = 0;
    game.factories.forEach((tiles, index) => {
        if (index !== exceptSource) total += tiles.filter(t => t === color).length;
    });
    if (exceptSource !== 'center') total += game.center.filter(t => t === color).length;
    return total;
}

// このラウンドの終わりに壁に入る予定の場所（埋まっている段）
function pendingWall(player) {
    const wall = player.wall.map(row => [...row]);
    player.lines.forEach((line, row) => {
        if (line.count === row + 1) wall[row][wallColumn(row, line.color)] = true;
    });
    return wall;
}

// 壁に置いたときの点数と、列・色がそろうことへの上乗せ
function wallValue(wall, row, col, color, rounds) {
    const placed = wall.map(r => [...r]);
    placed[row][col] = true;
    let value = placementScore(placed, row, col);
    const columnCount = placed.filter(r => r[col]).length;
    const colorCount = [0, 1, 2, 3, 4].filter(r => placed[r][wallColumn(r, color)]).length;
    const rowCount = placed[row].filter(Boolean).length;
    // 終盤ほど、そろう見込みのボーナスを重く見る
    const weight = Math.min(1, 0.35 + rounds * 0.12);
    value += weight * (columnCount === 5 ? BONUS.column : columnCount * 0.45);
    value += weight * (colorCount === 5 ? BONUS.color : colorCount * 0.4);
    value += rowCount === 5 ? BONUS.row : 0;
    return value;
}

// 1手の見積もり
export function evaluateMove(game, seat, move) {
    const player = game.players[seat];
    const tookFirst = move.source === 'center' && game.firstInCenter;
    let placed = 0;
    let value = 0;
    const rounds = game.round;

    if (move.line !== 'floor') {
        const row = move.line;
        const line = player.lines[row];
        const capacity = row + 1;
        placed = Math.min(move.count, capacity - line.count);
        const filled = line.count + placed;
        const col = wallColumn(row, move.color);
        const wall = pendingWall(player);
        const gain = wallValue(wall, row, col, move.color, rounds);
        if (filled === capacity) {
            value += gain;
        } else {
            // 埋まらない段：このラウンドで残りがそろいそうなら高め、次のラウンドに持ち越すなら低め
            const remaining = capacity - filled;
            const available = visibleCount(game, move.color, move.source);
            const chance = available >= remaining ? 0.65 : 0.4;
            value += gain * chance * (filled / capacity) + placed * 0.2;
            // 大きな段に少しだけ置いて塞ぐのは、ラウンドの後半ほど損
            value -= remaining * 0.15;
        }
    }
    const overflow = move.count - placed;
    const floorAdded = overflow + (tookFirst ? 1 : 0);
    value += floorPenaltyFor(player.floor.length, floorAdded);
    if (tookFirst) value += 0.8; // 次のラウンドに先に選べる
    return value;
}

// CPU の手を選ぶ（{ type: 'take', source, color, line }）
export function chooseMove(game, seat = game.current, style = CPU_STYLES.normal) {
    const moves = game.getLegalMoves(seat);
    if (moves.length === 0) return null;
    const random = cpuRandom(game, seat);

    // 見落とし：場所ごとに、見たかどうかを決める（少なくとも1か所は見る）
    const sources = [...new Set(moves.map(m => m.source))];
    let seen = sources.filter(() => random() >= style.overlook);
    if (seen.length === 0) seen = [sources[Math.floor(random() * sources.length)]];
    const candidates = moves.filter(m => seen.includes(m.source));

    let best = null;
    let bestValue = -Infinity;
    for (const move of candidates) {
        const value = evaluateMove(game, seat, move) + (random() * 2 - 1) * style.noise;
        if (value > bestValue) {
            bestValue = value;
            best = move;
        }
    }
    return { type: 'take', source: best.source, color: best.color, line: best.line };
}

// ヒント：人の番に、CPU（ふつう）が選ぶ手（袋の中以外はすべて公開）。手は打たない
export function suggest(game, seat) {
    if (game.isOver || game.current !== seat) return null;
    return chooseMove(game, seat, CPU_STYLES.normal);
}

export const isCpuTurn = game => game.phase === 'offer' && game.getCurrentPlayer().isCPU;

// CPU の番なら1手進める。進めたら true
export function runCpuStep(game, style = CPU_STYLES.normal) {
    if (!isCpuTurn(game)) return false;
    const seat = game.current;
    const move = chooseMove(game, seat, style);
    if (move && game.applyCommand(seat, move)) return true;
    // 想定していない形で断られたら、取れる最初のタイルを床へ置いて必ず進める
    const [fallback] = game.getSources();
    return game.applyCommand(seat, { type: 'take', source: fallback.source, color: fallback.color, line: 'floor' });
}
