/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（盤と手番。隠す情報はない）だけを見て決める
 * 読みは ai.js。乱数はゲームのものを使わず、盤から作ったシードを使う（同じ局面なら同じ手）
 *
 * 強さ
 * - やさしい：五は逃さない。相手の四はときどき見落とし、よさそうな手の中から乱数で選ぶ
 * - ふつう：五・四の止め、短い VCF（四の連続で勝つ筋）、3手先までの αβ 探索
 * - つよい：長い VCF、6手先までの αβ 探索。相手に VCF が残る手を避ける
 * 持ち時間があるときは、残りの時間から1手に使う時間を決め（clock.js の cpuBudget）、読みをその時間で打ち切る（時間切れにならない）
 */

import { chooseMove } from './ai.js';
import { EMPTY } from './rules.js';
import { createGameView } from './game-view.js';
import { cpuBudget } from './clock.js';

export const CPU_LEVELS = ['easy', 'normal', 'strong'];
export const LEVEL_NAMES = { easy: 'やさしい', normal: 'ふつう', strong: 'つよい' };
const MAX_MS = 8000;      // 安全弁。ふつうは読みの手数で終わる
const THINK_SHARE = 0.7;  // 1手の時間のうち、読みに使う割合（残りは手を見せる間・やり取りの分）

export const isCpuTurn = (game) => game.actors().some(seat => game.players[seat]?.isCPU);

export const cpuSeat = (game) => game.actors().find(seat => game.players[seat]?.isCPU);

// 持ち時間があるとき、CPU（手番の席）がこの1手に使ってよい時間。時計なしは null
// 残りの手数は、30手から打った手数の半分を引いて見込む（少なくとも12手）
export function clockBudget(view) {
    const clock = view.clock;
    if (!clock || clock.running === null || clock.running === undefined) return null;
    const moves = Math.max(12, Math.round(30 - view.moveNumber / 4));
    return cpuBudget(clock.config, clock.sides[clock.running], { moves });
}

// 読みを打ち切る時間
const thinkMs = (view) => {
    const budget = clockBudget(view);
    return budget === null ? MAX_MS : Math.max(10, Math.min(MAX_MS, Math.floor(budget * THINK_SHARE)));
};

export function decide(view, level = 'normal') {
    if (view.over || !view.myTurn) return null;
    const choice = chooseMove(view.board, view.size, view.toPlay, { level, maxMs: thinkMs(view) });
    return choice ? { type: 'move', sq: choice.sq } : null;
}

// CPU の番なら1つ進める。進めたら true
// elapsed：持ち時間があるとき、この手番に CPU がかけた時間（考える前までの分。考えた時間は足して記録する）
export function runCpuStep(game, { elapsed = 0 } = {}) {
    const seat = cpuSeat(game);
    if (seat === undefined) return false;
    const view = createGameView(game, seat);
    const started = Date.now();
    let command = null;
    try {
        command = decide(view, game.players[seat].cpuLevel ?? 'normal');
    } catch (error) {
        console.error(error);
    }
    return applyDecision(game, seat, command, elapsed + (Date.now() - started));
}

// 決めた操作を送る。時間を使い切っていたら時間切れで終える。決められなかった・断られたときは、空いている点に置いて進める
export function applyDecision(game, seat, command, elapsed = 0) {
    if (game.isFlagged(elapsed)) return game.timeout(game.clockSeat(), elapsed);
    if (command && game.applyCommand(seat, command, elapsed)) return true;
    const free = game.board.indexOf(EMPTY);
    return free >= 0 && game.applyCommand(seat, { type: 'move', sq: free }, elapsed);
}

// ヒント：人の手番に、CPU（ふつうの読み）が選ぶ手を返す。盤は全員に見えているので、隠す情報はない
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    const view = createGameView(game, seat);
    if (view.over || !view.myTurn) return null;
    // ヒントは持ち時間に関係なく、いつもと同じだけ読む
    return decide({ ...view, clock: null }, 'normal');
}
