/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（開始の局面と指した手。チェスに隠す情報はない）だけを見て決める
 * ゲームに乱数はなく、CPU の判断にもゲームの乱数は使わない。迷いを足すときは、ビューから作った別の乱数を使う（同じ局面なら同じ手）
 *
 * 強さ（読みは engine.js。深さと局面の数で打ち切り、時間は使わない）
 * - やさしい：1手先＋取り合いだけを読み、点に大きな迷いを足す（駒をただで取られる手をときどき指す）
 * - ふつう：3手先まで（局面 2万まで）。点に少し迷いを足す
 * - つよい：局面 15万まで深く（ふつうの局面で7手ほど）
 * - とてもつよい：局面 60万まで深く（ふつうの局面で9手ほど）
 * 局面の上限は、スマホで1手が数秒以内に収まるように決めた（README に測った値を書く）
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { search, positionFrom, MATE } from './engine.js';
import { moveToUci } from './rules.js';

export const CPU_LEVELS = ['easy', 'normal', 'strong', 'expert'];
export const LEVELS = {
    easy: { maxDepth: 1, nodeLimit: 20000, scoreAll: true, noise: 220, nullMove: false },
    normal: { maxDepth: 3, nodeLimit: 20000, scoreAll: true, noise: 35 },
    strong: { maxDepth: 30, nodeLimit: 150000 },
    expert: { maxDepth: 30, nodeLimit: 600000 }
};
// 引き分けの提案に答えるための読み
const DRAW_THINK = { maxDepth: 30, nodeLimit: 40000 };

const cpuRandom = (view) => {
    let seed = Math.imul(view.ply + 1, 0x9E3779B1);
    for (const ch of view.fen) seed = Math.imul(seed ^ ch.charCodeAt(0), 0x165667B1);
    return createRandom(seed >>> 0);
};

export const isCpuTurn = (game) => {
    const seat = game.actors()[0];
    return seat !== undefined && !!game.players[seat]?.isCPU;
};

export function think(view, level = 'normal') {
    const opt = LEVELS[level] ?? LEVELS.normal;
    const { pos, keys } = positionFrom(view.startFen, view.uci);
    return search(pos, opt, keys);
}

export function chooseMove(view, level = 'normal') {
    const opt = LEVELS[level] ?? LEVELS.normal;
    const result = think(view, level);
    if (!result.move) return null;
    let move = result.move;
    if (result.scored && opt.noise) {
        const random = cpuRandom(view);
        let bestValue = -Infinity;
        result.scored.forEach(({ move: m, score }) => {
            // メイトが決まる手・決まってしまう手には迷いを足さない
            const decided = Math.abs(score) > MATE - 200;
            const value = score + (decided ? 0 : random() * opt.noise);
            if (value > bestValue) {
                bestValue = value;
                move = m;
            }
        });
    }
    const uci = moveToUci(move);
    return { from: uci.slice(0, 2), to: uci.slice(2, 4), promo: uci[4] ?? null };
}

// 引き分けの提案を受けるか。CPU から見て形勢が悪いか、長い対局で互角なら受ける。やさしいは少し不利でなければ受ける
export function wantsDraw(view, level = 'normal') {
    const { pos, keys } = positionFrom(view.startFen, view.uci);
    // 手番は提案した側なので、点を裏返して CPU から見た点にする
    const score = -search(pos, DRAW_THINK, keys).score;
    if (level === 'easy') return score < 50;
    if (score <= -150) return true;
    return view.ply >= 60 && Math.abs(score) <= 30;
}

export function decide(view, level = 'normal') {
    if (view.over || view.actor !== view.you) return null;
    if (view.drawOffer !== null) return { type: wantsDraw(view, level) ? 'acceptDraw' : 'declineDraw' };
    const move = chooseMove(view, level);
    if (!move) return null;
    return move.promo ? { type: 'move', from: move.from, to: move.to, promo: move.promo } : { type: 'move', from: move.from, to: move.to };
}

// CPU の番なら1手打つ（引き分けの提案への答えも含む）。打てたら true
export function runCpuStep(game) {
    if (!isCpuTurn(game)) return false;
    const seat = game.actors()[0];
    const view = createGameView(game, seat);
    return applyDecision(game, seat, view, decide(view, game.players[seat].cpuLevel ?? 'normal'));
}

// 決めた操作を送る。断られたら、いちばん単純な答え（最初の合法手か、提案を断る）で必ず進める
export function applyDecision(game, seat, view, command) {
    if (command && game.applyCommand(seat, command)) return true;
    if (game.drawOffer !== null) return game.applyCommand(seat, { type: 'declineDraw' });
    const first = view.moves[0];
    if (!first) return false;
    return game.applyCommand(seat, first.promo ? { type: 'move', from: first.from, to: first.to, promo: first.promo } : { type: 'move', from: first.from, to: first.to });
}
