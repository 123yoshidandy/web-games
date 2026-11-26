/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（盤・手番・コウ・アゲハマ。隠す情報はない）だけを見て決める
 * 乱数はゲームのものを使わず、盤から作ったシードを使う（同じ局面なら同じ手）
 *
 * 強さはプレイアウトの回数で決める（engine.js の MCTS）。盤が大きいほど1回が重いので、回数を減らす
 * - パス：相手がパスしたあと、今終わっても勝っているならパスする。探索でパスが一番良いときもパスする
 * - 投了：つよい以上で、中盤を過ぎて勝つ見込みがほとんどないとき
 * - 死に石を決める段階では、人の指定にそのまま同意する（確定する）
 */

import { search, boardSeed } from './engine.js';
import { scoreJapanese } from './rules.js';
import { estimateDead } from './game.js';
import { createGameView } from './game-view.js';

export const CPU_LEVELS = ['easy', 'normal', 'strong', 'expert'];
export const LEVEL_NAMES = { easy: 'やさしい', normal: 'ふつう', strong: 'つよい', expert: 'とてもつよい' };
export const PLAYOUTS = {
    easy: { 9: 300, 13: 300, 19: 300 },
    normal: { 9: 2000, 13: 1500, 19: 1500 },
    strong: { 9: 7000, 13: 5000, 19: 4000 },
    expert: { 9: 20000, 13: 12000, 19: 8000 }
};
const RESIGN_LEVELS = ['strong', 'expert'];
const RESIGN_RATE = 0.05;
const MAX_MS = 12000;   // 安全弁。ふつうは回数で終わる

export const isCpuTurn = (game) => game.actors().some(seat => game.players[seat]?.isCPU);

// CPU が動く席（死に石を決める段階では、確定していない CPU の席）
export const cpuSeat = (game) => game.actors().find(seat => game.players[seat]?.isCPU);

// 今2人ともパスで終わったときの、color から見た点差
function passScore(view, color) {
    const dead = estimateDead(view.board, view.size, view.options.komi);
    const { diff } = scoreJapanese(view.board, view.size, { dead, prisoners: view.prisoners, komi: view.options.komi });
    return color === 1 ? diff : -diff;
}

export function think(view, level = 'normal') {
    const size = view.size;
    const playouts = (PLAYOUTS[level] ?? PLAYOUTS.normal)[size];
    const late = view.moveNumber >= size * size * 0.45;
    return search({
        board: view.board, size, toPlay: view.toPlay, ko: view.ko, komi: view.options.komi, placed: view.placed,
        lastMove: view.lastMove ? view.lastMove.sq : -1, passes: view.passes, ply: view.moveNumber
    }, { playouts, seed: boardSeed(view.board, view.moveNumber * 7 + view.toPlay), maxMs: MAX_MS, allowPass: late || view.passes > 0 });
}

export function decide(view, level = 'normal') {
    if (view.over) return null;
    if (view.phase === 'scoring') return view.agreed[view.you] ? null : { type: 'confirm' };
    const size = view.size;
    const color = view.toPlay;
    // 長すぎる対局は、パスで終わらせる（三コウなどで終わらない形の安全弁）
    if (view.moveNumber >= size * size * 2.5) return { type: 'pass' };
    if (view.passes > 0 && passScore(view, color) > 0) return { type: 'pass' };
    const result = think(view, level);
    if (RESIGN_LEVELS.includes(level) && view.moveNumber > size * size * 0.4 && result.winrate < RESIGN_RATE) return { type: 'resign' };
    if (result.move < 0) return { type: 'pass' };
    // 相手がパスしたあと、パスしても形勢が変わらないならパスする
    if (view.passes > 0) {
        const pass = result.children.find(ch => ch.move < 0);
        const best = result.children[0];
        if (pass && pass.n > 0 && pass.q >= best.q - 0.03) return { type: 'pass' };
    }
    return { type: 'move', sq: result.move };
}

// CPU の番なら1つ進める。進めたら true
export function runCpuStep(game) {
    const seat = cpuSeat(game);
    if (seat === undefined) return false;
    const view = createGameView(game, seat);
    let command = null;
    try {
        command = decide(view, game.players[seat].cpuLevel ?? 'normal');
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    // 決められなかった・断られたときは、いちばん単純な答えで進める
    return game.applyCommand(seat, game.phase === 'scoring' ? { type: 'confirm' } : { type: 'pass' });
}

// ヒント：人の手番に、CPU（ふつうの読み）が選ぶ手（打つ点かパス）を返す。盤は全員に見えているので、隠す情報はない
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (game.phase !== 'play') return null;
    const view = createGameView(game, seat);
    if (view.over || !view.myTurn) return null;
    return decide(view, 'normal');
}
