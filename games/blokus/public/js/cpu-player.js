/**
 * CPU の判断（DOM に依存しない）
 * ブロックスには隠す情報がないので、盤をそのまま見る。ゲームの乱数は使わない（使うと記録の再現がずれる）
 * 迷いは、ゲームが持つ cpuSalt と手数から作った別の乱数で決める
 *
 * ふつう：置ける手をすべて試し、「ピースの大きさ・自分の置ける角の増え方・相手の置ける角を塞いだ数・序盤は盤の中央へ」を点にして選ぶ
 *        5マスのピースを先に使い、終盤は大きいものから置く。4色目（3人のとき）は、相手の角を塞ぐことだけを考える
 * やさしい：大きいピースほど選びやすく、置ける手から気まぐれに選ぶ
 */

import { createRandom } from './random.js';
import { SIZE, COLORS, PIECES, SHARED, anchors, placedCells } from './game.js';

export const CPU_LEVELS = ['easy', 'normal'];
const CENTER = (SIZE - 1) / 2;
const SAMPLE = 400;  // ふつうが詳しく調べる手の数の上限（大きいピースから）

// 置いたあとの盤で、色ごとの起点の数を数える
function anchorCount(board, color, first) {
    return anchors(board, color, first).length;
}

// その色の味方と相手の色
function sides(game, color) {
    const owner = game.owners[color];
    const seat = game.seatOf(color);
    const friends = owner === SHARED ? [] : COLORS.map((_, i) => i).filter(i => game.owners[i] === owner);
    const enemies = COLORS.map((_, i) => i).filter(i => !friends.includes(i) && i !== color && game.owners[i] !== SHARED && game.owners[i] !== seat && !game.colors[i].out);
    return { friends: owner === SHARED ? [] : friends, enemies };
}

function normalScore(game, color, move, before, enemyBefore) {
    const board = [...game.board];
    const cells = placedCells(move.piece, move.orient, move.x, move.y);
    cells.forEach(([x, y]) => { board[y * SIZE + x] = color; });
    const { friends, enemies } = sides(game, color);
    const shared = game.owners[color] === SHARED;
    const size = PIECES[move.piece].size;
    const left = game.colors[color].pieces.length;
    let score = 0;
    if (!shared) {
        score += size * 4;
        const mine = anchorCount(board, color, false);
        score += (mine - before) * 1.2 + mine * 0.3;
        // 序盤は中央へ伸ばす
        if (left > 14) {
            const reach = Math.min(...cells.map(([x, y]) => Math.abs(x - CENTER) + Math.abs(y - CENTER)));
            score -= reach * 0.8;
        }
        // 味方の色の角も塞がない
        friends.filter(f => f !== color).forEach(f => { score -= Math.max(0, enemyBefore[f] - anchorCount(board, f, game.isFirst(f))) * 0.8; });
        // 最後に1マスを残せると、上級の得点法で+5点
        if (game.options.scoring === 'advanced' && move.piece === 'I1' && left > 1) score -= 3;
    }
    enemies.forEach(e => { score += Math.max(0, enemyBefore[e] - anchorCount(board, e, game.isFirst(e))) * (shared ? 2 : 1.4); });
    return score;
}

// CPU の席 seat が次に打つ操作
export function chooseCommand(game, seat, level = game.players[seat].cpuLevel ?? 'normal') {
    if (game.isOver() || !game.actors().includes(seat)) return null;
    const color = game.current;
    const moves = game.movesFor(color);
    if (!moves.length) return null;
    const random = createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1)) >>> 0);
    const command = (m) => ({ type: 'place', piece: m.piece, orient: m.orient, x: m.x, y: m.y });
    if (level === 'easy') {
        // 大きいピースほど選びやすく
        const weights = moves.map(m => PIECES[m.piece].size ** 2);
        let r = random() * weights.reduce((s, w) => s + w, 0);
        for (let i = 0; i < moves.length; i++) {
            r -= weights[i];
            if (r <= 0) return command(moves[i]);
        }
        return command(moves.at(-1));
    }
    // 大きいピースから、調べる数を絞る（同じ大きさの中では、並びを迷いでばらす）
    const ranked = moves.map(m => ({ m, k: PIECES[m.piece].size * 10 + random() })).sort((a, b) => b.k - a.k).slice(0, SAMPLE).map(x => x.m);
    const before = anchorCount(game.board, color, game.isFirst(color));
    const enemyBefore = COLORS.map((_, i) => (game.colors[i].out ? 0 : anchorCount(game.board, i, game.isFirst(i))));
    let best = null;
    let bestScore = -Infinity;
    for (const m of ranked) {
        const s = normalScore(game, color, m, before, enemyBefore) + random() * 0.01;
        if (s > bestScore) {
            best = m;
            bestScore = s;
        }
    }
    return command(best);
}

export function nextCpuSeat(game) {
    const seat = game.actors()[0];
    return seat !== undefined && game.players[seat].isCPU ? seat : null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// CPU の1手を打つ。断られたら、置ける手の最初のもので必ず進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null || seat === undefined) return null;
    const command = chooseCommand(game, seat, level);
    if (command && game.applyCommand(seat, command)) return command;
    const fallback = game.movesFor(game.current, { limit: 1 })[0];
    if (fallback) {
        const c = { type: 'place', ...fallback };
        if (game.applyCommand(seat, c)) return c;
    }
    return null;
}
