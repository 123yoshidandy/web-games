/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（盤・手番・コウ・アゲハマ。隠す情報はない）だけを見て決める
 * 乱数はゲームのものを使わず、盤から作ったシードを使う（同じ局面なら同じ手）
 *
 * 強さはプレイアウトの回数で決める（engine.js の MCTS）。盤が大きいほど1回が重いので、回数を減らす
 * - パス：相手がパスしたあと、今終わっても勝っているならパスする。探索でパスが一番良いときもパスする
 * - 投了：つよい以上で、中盤を過ぎて勝つ見込みがほとんどないとき
 * - 死に石を決める段階では、人の指定にそのまま同意する（確定する）
 * 持ち時間があるときは、残りの時間から1手に使う時間を決め（clock.js の cpuBudget）、読みをその時間で打ち切る（時間切れにならない）
 */

import { search, boardSeed } from './engine.js';
import { scoreJapanese } from './rules.js';
import { estimateDead } from './game.js';
import { createGameView } from './game-view.js';
import { cpuBudget } from './clock.js';

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
const THINK_SHARE = 0.7;   // 1手の時間のうち、読みに使う割合（残りは死に石の見込み・手を見せる間・やり取りの分）

export const isCpuTurn = (game) => game.actors().some(seat => game.players[seat]?.isCPU);

// CPU が動く席（死に石を決める段階では、確定していない CPU の席）
export const cpuSeat = (game) => game.actors().find(seat => game.players[seat]?.isCPU);

// 今2人ともパスで終わったときの、color から見た点差
function passScore(view, color) {
    const dead = estimateDead(view.board, view.size, view.options.komi);
    const { diff } = scoreJapanese(view.board, view.size, { dead, prisoners: view.prisoners, komi: view.options.komi });
    return color === 1 ? diff : -diff;
}

// 持ち時間があるとき、CPU（手番の席）がこの1手に使ってよい時間。時計なし・時計が止まっているときは null
// 残りの手数は、盤の広さの半分から打った手数の半分を引いて見込む（少なくとも20手）
export function clockBudget(view) {
    const clock = view.clock;
    if (!clock || clock.running === null || clock.running === undefined) return null;
    const moves = Math.max(20, Math.round(view.size * view.size * 0.5 - view.moveNumber / 2));
    return cpuBudget(clock.config, clock.sides[clock.running], { moves });
}

// 読みを打ち切る時間
const thinkMs = (view) => {
    const budget = clockBudget(view);
    return budget === null ? MAX_MS : Math.max(10, Math.min(MAX_MS, Math.floor(budget * THINK_SHARE)));
};

export function think(view, level = 'normal') {
    const size = view.size;
    const playouts = (PLAYOUTS[level] ?? PLAYOUTS.normal)[size];
    const late = view.moveNumber >= size * size * 0.45;
    return search({
        board: view.board, size, toPlay: view.toPlay, ko: view.ko, komi: view.options.komi, placed: view.placed,
        lastMove: view.lastMove ? view.lastMove.sq : -1, passes: view.passes, ply: view.moveNumber
    }, { playouts, seed: boardSeed(view.board, view.moveNumber * 7 + view.toPlay), maxMs: thinkMs(view), allowPass: late || view.passes > 0 });
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
// elapsed：持ち時間があるとき、この手番に CPU がかけた時間（考える前までの分。考えた時間は足して記録する）
// 時間を使い切っていたら、時間切れで終える（死に石を決める段階は時計が止まっている）
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

// 決めた操作を送る。決められなかった・断られたときは、いちばん単純な答え（パスか確定）で進める
export function applyDecision(game, seat, command, elapsed = 0) {
    if (game.isFlagged(elapsed)) return game.timeout(game.clockSeat(), elapsed);
    if (command && game.applyCommand(seat, command, elapsed)) return true;
    return game.applyCommand(seat, game.phase === 'scoring' ? { type: 'confirm' } : { type: 'pass' }, elapsed);
}

// ヒント：人の手番に、CPU（ふつうの読み）が選ぶ手（打つ点かパス）を返す。盤は全員に見えているので、隠す情報はない
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (game.phase !== 'play') return null;
    const view = createGameView(game, seat);
    if (view.over || !view.myTurn) return null;
    // ヒントは持ち時間に関係なく、いつもと同じだけ読む
    return decide({ ...view, clock: null }, 'normal');
}
