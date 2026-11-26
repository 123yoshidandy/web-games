/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（盤・両者の手札・脇のカード。どれも公開）だけを見て決める
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。同じ点の手の選び分けは、ビューから作った別の乱数で決める
 *
 * 読み：アルファベータ法のミニマックス（ネガマックス）。読む深さは手の数で決め、時間では打ち切らない（端末の速さで手が変わらないように）
 * - やさしい：2手（自分の手と相手の返し）。勝てる手と、すぐ負ける手は必ず分かる。点に大きな迷いを足す
 * - ふつう：3手
 * - つよい：必ず5手まで読み、そのあとは読んだ局面の数が上限（NODE_LIMIT）に届くまで、1手ずつ深くする（8手まで）
 *   1手ずつ深くするとき、前の読みで良かった手から試す。上限に届いた読みは捨て、その前の深さの答えを使う
 * 勝ちは早いほど、負けは遅いほど良いとする。千日手の引き分けは読まない（局面の点で選ぶ）
 *
 * 局面の点（手番の側から見る）：弟子1つ 100。師匠が相手の神殿の門に近いほど、また相手の師匠に近いほどよい。
 * 動ける手の数（両者の手札）、前に出た弟子、相手の駒に効いているマスを少し足す
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { CARDS, CELLS, TEMPLE, legalMoves, applyMove, isMaster, rowOf, colOf, target } from './rules.js';

export const CPU_LEVELS = ['easy', 'normal', 'strong'];
export const DEPTH = { easy: { min: 2, max: 2 }, normal: { min: 3, max: 3 }, strong: { min: 5, max: 8 } };
export const NODE_LIMIT = 150000;
const ABORT = Symbol('abort');
export const WIN = 100000;

// 点の重み（scripts/cpu-match.mjs で勝率を比べて決めた）
export const TUNING = { student: 100, templeNear: 6, mobility: 2, advance: 3, threat: 8, noise: 60 };

const cpuRandom = (view) => {
    let seed = Math.imul(view.ply + 1, 0x9E3779B1) ^ Math.imul(view.you + 1, 0x85EBCA6B);
    view.board.forEach((p, i) => { if (p) seed = Math.imul(seed ^ (p * 31 + i), 0x165667B1); });
    return createRandom(seed >>> 0);
};

export const isCpuTurn = (game) => !game.isOver() && game.players[game.current]?.isCPU;

const dist = (a, b) => Math.max(Math.abs(rowOf(a) - rowOf(b)), Math.abs(colOf(a) - colOf(b)));

// 行き先の表：TARGETS[席][カード][マス] = 行ける先のマスの配列（盤の外は除く）。読みの中で何度も使うので、最初に作っておく
const TARGETS = [0, 1].map(seat => Object.fromEntries(Object.entries(CARDS).map(([id, card]) => [id,
    Array.from({ length: CELLS }, (_, from) => card.moves.map(d => target(seat, from, d)).filter(to => to >= 0))])));

// 席 s の、動ける手の数と、相手の駒に効いている数（師匠は3、弟子は1と数える）
function reach(board, hands, s) {
    let moves = 0;
    let hits = 0;
    for (let k = 0; k < 2; k++) {
        const table = TARGETS[s][hands[s][k]];
        for (let from = 0; from < CELLS; from++) {
            const p = board[from];
            if (!p || ((p - 1) >> 1) !== s) continue;
            const list = table[from];
            for (let i = 0; i < list.length; i++) {
                const q = board[list[i]];
                if (!q) moves++;
                else if (((q - 1) >> 1) !== s) {
                    moves++;
                    hits += (q === 2 || q === 4) ? 3 : 1;
                }
            }
        }
    }
    return { moves, hits };
}

// seat から見た局面の点
export function evaluate(state, seat) {
    const other = 1 - seat;
    const { board } = state;
    const master = [-1, -1];
    const count = [0, 0];
    const advance = [0, 0];
    for (let sq = 0; sq < CELLS; sq++) {
        const p = board[sq];
        if (!p) continue;
        const s = (p - 1) >> 1;
        if (p === 2 || p === 4) master[s] = sq;
        else {
            count[s]++;
            advance[s] += s === 0 ? 4 - rowOf(sq) : rowOf(sq);
        }
    }
    if (master[other] < 0) return WIN;
    if (master[seat] < 0) return -WIN;
    let score = TUNING.student * (count[seat] - count[other]);
    score += TUNING.templeNear * (dist(master[other], TEMPLE[seat]) - dist(master[seat], TEMPLE[other]));
    score += TUNING.advance * (advance[seat] - advance[other]) / 4;
    const mine = reach(board, state.hands, seat);
    const theirs = reach(board, state.hands, other);
    score += TUNING.mobility * (mine.moves - theirs.moves) / 2;
    // 相手の駒に効いているマス（手番の側は次に取れる。相手の効きは脅し）
    score += TUNING.threat * (mine.hits - theirs.hits * 0.5);
    return score;
}

// 勝ちになる手（相手の師匠を取る・神殿の門に入る）と取る手を先に試す
function ordered(state, seat, moves, first) {
    const other = 1 - seat;
    const key = (m) => {
        if (first && m.card === first.card && m.from === first.from && m.to === first.to) return -1000;
        const victim = state.board[m.to];
        if (isMaster(victim)) return -900;
        if (isMaster(state.board[m.from]) && m.to === TEMPLE[other]) return -800;
        return victim ? -100 : 0;
    };
    return [...moves].sort((a, b) => key(a) - key(b));
}

// ネガマックス。戻り値は seat（手番の側）から見た点
function search(state, seat, depth, alpha, beta, ply, budget) {
    if (++budget.nodes > budget.limit) throw ABORT;
    if (depth === 0) return evaluate(state, seat);
    let moves = legalMoves(state, seat);
    if (!moves.length) moves = state.hands[seat].map(card => ({ card, pass: true }));
    let best = -Infinity;
    for (const m of ordered(state, seat, moves, null)) {
        const r = applyMove(state, seat, m);
        const score = r.win ? WIN - ply : -search(r.state, 1 - seat, depth - 1, -beta, -alpha, ply + 1, budget);
        if (score > best) best = score;
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
    }
    return best;
}

// 根の手それぞれの点（読みの深さ depth）
export function scoreMoves(view, level = 'normal') {
    const seat = view.you;
    const state = { board: view.board, hands: view.hands, side: view.side };
    let moves = view.moves.length ? view.moves : view.hands[seat].map(card => ({ card, pass: true }));
    const { min, max } = DEPTH[level] ?? DEPTH.normal;
    const budget = { nodes: 0, limit: Infinity };
    let reached = 0;
    // ふつう・つよいは、一番良い手より 1 以上悪い手の点は上限だけ分かればよい（枝刈り）。やさしいは迷いを足すので、全部の点を正しく出す
    const margin = level === 'easy' ? Infinity : 1;
    let scored = moves.map(m => ({ move: m, score: 0 }));
    // 1手ずつ深くして、前の読みで良かった手から試す（枝刈りが効く）
    for (let d = min > 2 ? 1 : min; d <= max; d++) {
        // 決めた深さまでは必ず読み切る。それより深い読みは、上限に届いたら捨てる
        budget.limit = d > min ? NODE_LIMIT : Infinity;
        const order = [...scored].sort((a, b) => b.score - a.score).map(s => s.move);
        let alpha = -Infinity;
        try {
            scored = ordered(state, seat, order, order[0]).map(m => {
                const r = applyMove(state, seat, m);
                const score = r.win ? WIN : -search(r.state, 1 - seat, d - 1, -Infinity, -alpha + margin, 1, budget);
                if (score > alpha) alpha = score;
                return { move: m, score };
            });
            reached = d;
        } catch (error) {
            if (error !== ABORT) throw error;
            break;
        }
        // 勝ちか負けが決まったら、それ以上読まない
        if (scored.some(x => x.score > WIN / 2) || scored.every(x => x.score < -WIN / 2)) break;
    }
    return { scored, nodes: budget.nodes, depth: reached };
}

export function chooseMove(view, level = 'normal') {
    const random = cpuRandom(view);
    const { scored } = scoreMoves(view, level);
    const noise = level === 'easy' ? TUNING.noise : 0.5;
    let best = null;
    let bestScore = -Infinity;
    scored.forEach(({ move, score }) => {
        // 勝ち負けの決まった手には迷いを足さない
        const decided = Math.abs(score) > WIN / 2;
        const value = score + (decided ? 0 : random() * noise);
        if (value > bestScore) {
            bestScore = value;
            best = move;
        }
    });
    return best;
}

export function decide(view, level = 'normal') {
    const move = chooseMove(view, level);
    if (!move) return null;
    return move.pass ? { type: 'pass', card: move.card } : { type: 'move', card: move.card, from: move.from, to: move.to };
}

// CPU の番なら1手打つ。打てたら true
export function runCpuStep(game) {
    if (!isCpuTurn(game)) return false;
    const seat = game.current;
    const view = createGameView(game, seat);
    const command = decide(view, game.players[seat].cpuLevel ?? 'normal');
    if (command && game.applyCommand(seat, command)) return true;
    // 思わぬ答えで断られたら、いちばん単純な手で進める
    const m = view.moves[0];
    const fallback = m ? { type: 'move', card: m.card, from: m.from, to: m.to } : { type: 'pass', card: view.hands[seat][0] };
    return game.applyCommand(seat, fallback);
}


// ヒント：人の番に、CPU（いちばん強い設定）が選ぶ手を返す。CPU と同じく、その席から見える情報だけで決める
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (!(!game.isOver() && game.current === seat)) return null;
    return decide(createGameView(game, seat), 'strong');
}
