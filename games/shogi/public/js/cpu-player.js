/**
 * CPU の判断（DOM に依存しない）
 * 将棋に隠す情報はないので、局面と、これまでの局面（千日手の判定に使う）を見て決める
 * 乱数はゲームのものを使わず、局面から作る（同じ局面なら同じ手）
 *
 * 強さ（読みは engine.js。深さと局面の数で打ち切り、時間は使わない）
 * - やさしい：1手読み（取り合いは読む）。点に大きな迷いを足す
 * - ふつう：2手読み。点に少し迷いを足す
 * - つよい：3手読み
 * - とてもつよい：必ず3手、局面の上限まで深く（6手まで）
 * 局面の上限は、スマホで1手数秒以内に収まるように決めた（README に測った値を書く）
 */

import { Position } from './rules.js';
import { createRandom } from './random.js';
import { analyze, MATE } from './engine.js';
import { moveInfo } from './game-view.js';
import { REPETITION, repetitionWinner } from './game.js';

export const CPU_LEVELS = ['easy', 'normal', 'strong', 'expert'];
export const LEVELS = {
    easy: { depth: 1, exact: true, noise: 300, qDepth: 2 },
    normal: { depth: 2, exact: true, noise: 40, qDepth: 4, nodeLimit: 40000 },
    strong: { depth: 3, nodeLimit: 60000 },
    expert: { depth: 3, maxDepth: 6, nodeLimit: 250000 }
};

export const isCpuTurn = (game) => !game.isOver() && game.players[game.current]?.isCPU;

const cpuRandom = (pos, ply) => createRandom(((pos.h1 ^ Math.imul(ply + 1, 0x9E3779B1)) >>> 0));

// 千日手で終わる手の点（指す側から見て）。引き分けは 0、連続王手で負けるなら負け
function repetitionScores(game, pos, moves) {
    const fixed = new Map();
    const counts = new Map();
    game.history.forEach(k => counts.set(k, (counts.get(k) ?? 0) + 1));
    const us = pos.side;
    for (const m of moves) {
        pos.make(m);
        const key = pos.toSfen();
        const check = pos.inCheck();
        pos.unmake(m);
        if ((counts.get(key) ?? 0) < REPETITION - 1) continue;
        const winner = repetitionWinner([...game.history, key], [...game.checks, check], key);
        fixed.set(m, winner === null ? 0 : winner === us ? MATE - 1 : -MATE + 1);
    }
    return fixed;
}

// 局面を読んで、手ごとの点を返す
export function think(game, level = 'normal') {
    const opt = LEVELS[level] ?? LEVELS.normal;
    const pos = game.pos.clone();
    const moves = pos.legalMoves();
    const seen = new Set(game.history.map(sfen => Position.fromSfen(sfen).key));
    return analyze(pos, { ...opt, seen, fixed: repetitionScores(game, pos, moves) });
}

export function chooseMove(game, level = 'normal') {
    const opt = LEVELS[level] ?? LEVELS.normal;
    const { scored } = think(game, level);
    if (!scored.length) return null;
    const random = cpuRandom(game.pos, game.ply);
    let best = null;
    let bestScore = -Infinity;
    scored.forEach(({ move, score }) => {
        const decided = Math.abs(score) > MATE - 1000;
        const value = score + (decided ? 0 : random() * (opt.noise ?? 0));
        if (value > bestScore) {
            bestScore = value;
            best = move;
        }
    });
    return best;
}

// 手を操作の形にする
export function toCommand(m) {
    const info = moveInfo(m);
    return info.drop ? { type: 'drop', piece: info.drop, to: info.to } : { type: 'move', from: info.from, to: info.to, promote: info.promote };
}

export function decide(game, level = 'normal') {
    const m = chooseMove(game, level);
    return m === null ? null : toCommand(m);
}

// 人の番のおすすめの手（ヒント）。CPU（つよい）と同じ読み。画面に出すだけで、記録には入れない
export function suggest(game, seat) {
    if (game.isOver() || game.current !== seat) return null;
    return decide(game, 'strong');
}

// CPU の番なら1手指す。指せたら true
export function runCpuStep(game) {
    if (!isCpuTurn(game)) return false;
    const seat = game.current;
    const command = decide(game, game.players[seat].cpuLevel ?? 'normal');
    if (command && game.applyCommand(seat, command)) return true;
    const fallback = game.legalMoves()[0];
    return fallback !== undefined && game.applyCommand(seat, toCommand(fallback));
}
