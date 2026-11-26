/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（盤・手番。隠す情報はない）だけを見て決める。乱数はゲームのものを使わず、ビューから作る
 *
 * 強さ（読みは engine.js。深さと局面の数で打ち切り、時間は使わない）
 * - やさしい：2手読み（相手を全部返す手と、全部返される手は分かる）。点に大きな迷いを足す
 * - ふつう：3手読み。残り8マスから読み切る
 * - つよい：必ず4手、局面の上限まで深く（7手まで）。残り12マスから読み切る
 * - とてもつよい：必ず6手、局面の上限まで深く（9手まで）。残り14マスから読み切る（読み切れなければ中盤の読み）
 * 局面の上限は、スマホで1手1秒ほどに収まるように決めた（README に測った値を書く）
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { analyze, WIN } from './engine.js';
import { colorOf } from './rules.js';

export const CPU_LEVELS = ['easy', 'normal', 'strong', 'expert'];
export const LEVELS = {
    easy: { depth: 2, exact: 0, noise: 60, margin: Infinity },
    normal: { depth: 3, exact: 8 },
    strong: { depth: 4, maxDepth: 7, nodeLimit: 60000, exact: 12, exactLimit: 300000 },
    expert: { depth: 6, maxDepth: 9, nodeLimit: 200000, exact: 14, exactLimit: 350000 }
};

const cpuRandom = (view) => {
    let seed = Math.imul(view.ply + 1, 0x9E3779B1) ^ Math.imul(view.current + 1, 0x85EBCA6B);
    view.board.forEach((s, i) => { if (s) seed = Math.imul(seed ^ (s * 67 + i), 0x165667B1); });
    return createRandom(seed >>> 0);
};

export const isCpuTurn = (game) => !game.isOver() && game.players[game.current]?.isCPU;

export function think(view, level = 'normal') {
    const opt = LEVELS[level] ?? LEVELS.normal;
    return analyze(view.board, colorOf(view.current), opt);
}

export function chooseMove(view, level = 'normal') {
    const opt = LEVELS[level] ?? LEVELS.normal;
    const { scored } = think(view, level);
    if (!scored.length) return null;
    const random = cpuRandom(view);
    let best = null;
    let bestScore = -Infinity;
    scored.forEach(({ sq, score }) => {
        const decided = Math.abs(score) > WIN / 2;
        const value = score + (decided ? 0 : random() * (opt.noise ?? 0.5));
        if (value > bestScore) {
            bestScore = value;
            best = sq;
        }
    });
    return best;
}

export function decide(view, level = 'normal') {
    const sq = chooseMove(view, level);
    return sq === null ? null : { type: 'move', sq };
}

// 人の席のおすすめの手（ヒント）。CPU（つよい）と同じ読みを、その席のビューで出す。画面に出すだけで、記録には入れない
export function suggest(game, seat) {
    if (game.isOver() || game.current !== seat) return null;
    return decide(createGameView(game, seat), 'strong');
}

// CPU の番なら1手打つ。打てたら true
export function runCpuStep(game) {
    if (!isCpuTurn(game)) return false;
    const seat = game.current;
    const view = createGameView(game, seat);
    const command = decide(view, game.players[seat].cpuLevel ?? 'normal');
    if (command && game.applyCommand(seat, command)) return true;
    const fallback = view.moves[0];
    return fallback !== undefined && game.applyCommand(seat, { type: 'move', sq: fallback });
}
