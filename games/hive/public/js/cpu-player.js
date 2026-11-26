/**
 * CPU の手を決める（DOM に依存しない）
 * - ハイブには隠す情報がないので、盤の状態をそのまま読む
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 方針：アルファベータ法で先を読む（やさしい：自分の1手だけ、ふつう：相手の応手まで2手）
 *   局面の値打ち＝相手の女王蜂のふさがり具合 − 自分の女王蜂のふさがり具合（ふさがるほど急に重く）
 *              ＋動ける駒の数（駒の種類で重みを付ける。アリ・カブトムシは重い）＋手持ちの駒の余裕
 * - 1手の考える時間は TIME_LIMIT_MS まで。読み切れなかったら、それまでで一番良い手にする
 * - やさしいは、評価の揺れが大きく、ときどき3番目までの手を選ぶ。どちらも、すぐ勝てる手は見逃さない
 */

import { legalActions, applyAction, articulationPoints, queenCell, neighbors, parseKey, positionKey, REPETITION_LIMIT, KINDS } from './rules.js';
import { createRandom } from './random.js';

export const PROFILES = {
    easy: { depth: 1, noise: 6, sloppy: 0.35 },
    normal: { depth: 2, noise: 1, sloppy: 0 },
    random: { random: true } // 通る手からでたらめに選ぶ（強さを測る比較用）
};

export const TIME_LIMIT_MS = 800;
const WIN = 100000;
// 女王蜂のまわりのふさがったマスの数ごとの重み（6 は負け）
const SURROUND = [0, 1, 3, 7, 15, 32, WIN];
// 動ける駒の重み
const FREE_WEIGHT = { Q: 1.5, B: 2, G: 1.5, S: 1, A: 3, L: 2, M: 2, P: 1.5 };
const HAND_WEIGHT = 0.3;
const PRESSURE_WEIGHT = 3;
const DEFENSE_WEIGHT = 3.4; // 自分の女王蜂は少し重く守る
const APPROACH_WEIGHT = 0.4; // 相手の女王蜂に近づく駒の重み（1マス近いごと）
const REPEAT_PENALTY = 3; // 前に出た局面へ戻る手を下げる量（1回につき）

function hexDistance(a, b) {
    const [q1, r1] = parseKey(a);
    const [q2, r2] = parseKey(b);
    return (Math.abs(q1 - q2) + Math.abs(r1 - r2) + Math.abs(q1 + r1 - q2 - r2)) / 2;
}

export const isCpuTurn = (game) => !game.isOver() && game.players[game.current].isCPU;

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// 局面の値打ち（color の側から見て）
export function evaluate(state, color) {
    const r = state.result;
    if (r) return r.winner === null ? 0 : r.winner === color ? WIN : -WIN;
    const board = state.board;
    const cut = articulationPoints(board);
    let score = 0;
    const queens = [queenCell(board, 0), queenCell(board, 1)];
    for (const side of [0, 1]) {
        const sign = side === color ? 1 : -1;
        let value = 0;
        // 相手の女王蜂に近い駒ほど少し良い（攻めに向かう）
        const target = queens[1 - side];
        if (target !== null) {
            for (const k in board) {
                const stack = board[k];
                if (stack[stack.length - 1].owner === side) value += Math.max(0, 4 - hexDistance(k, target)) * APPROACH_WEIGHT;
            }
        }
        // 動ける駒（巣を分けず、上に乗られていない、動けなくされていない）
        for (const k in board) {
            const stack = board[k];
            const top = stack[stack.length - 1];
            if (top.owner !== side || top.id === state.frozen) continue;
            if (stack.length > 1 || !cut.has(k)) {
                // 女王蜂は、まわりに空きがないと動けない
                if (top.kind === 'Q' && neighbors(k).every(n => board[n])) continue;
                value += FREE_WEIGHT[top.kind];
                // カブトムシが相手の女王蜂の上にいると、強い
                if (stack.length > 1 && stack.some(p => p.kind === 'Q' && p.owner !== side)) value += 4;
            }
        }
        const hand = state.hands[side];
        value += KINDS.reduce((s, kind) => s + (hand[kind] ?? 0), 0) * HAND_WEIGHT;
        // 女王蜂のまわり：自分の女王蜂がふさがると減り、相手の女王蜂がふさがると増える
        const q = queenCell(board, side);
        if (q !== null) {
            const n = neighbors(q).filter(c => board[c]).length;
            value -= SURROUND[n] * (side === color ? DEFENSE_WEIGHT : PRESSURE_WEIGHT);
        }
        score += sign * value;
    }
    return score;
}

// 先に調べると枝刈りが効きやすい順（相手の女王蜂に近づく手・置く手を先に）
function orderActions(state, actions, color) {
    const target = queenCell(state.board, 1 - color);
    const near = target ? new Set(neighbors(target)) : new Set();
    return actions.map(a => ({ a, k: (a.to && near.has(a.to) ? 2 : 0) + (a.type === 'move' ? 1 : 0) })).sort((x, y) => y.k - x.k).map(x => x.a);
}

class TimeUp extends Error {}

// ネガマックス（state.current の側から見た値打ち）
function search(state, depth, alpha, beta, deadline) {
    if (state.result || depth === 0) return evaluate(state, state.current);
    if (Date.now() > deadline) throw new TimeUp();
    const actions = orderActions(state, legalActions(state), state.current);
    let best = -Infinity;
    for (const action of actions) {
        const next = applyAction(state, action, { trackHistory: false });
        const v = -search(next, depth - 1, -beta, -alpha, deadline);
        if (v > best) best = v;
        if (v > alpha) alpha = v;
        if (alpha >= beta) break;
    }
    return best;
}

// 手ごとの値打ちを並べる（手番の側から見て）。時間切れなら、そこまでの深さの結果を返す
export function scoreActions(state, depth, { deadline = Date.now() + TIME_LIMIT_MS } = {}) {
    const color = state.current;
    const actions = orderActions(state, legalActions(state), color);
    // まず1手だけ読んで並べ替え（2手読みの枝刈りが効くように、時間切れのときの答えにも使う）
    let scored = actions.map(action => {
        const next = applyAction(state, action, { trackHistory: false });
        return { action, next, score: evaluate(next, color) };
    }).sort((a, b) => b.score - a.score);
    if (depth >= 2) {
        const deeper = [];
        let alpha = -Infinity;
        try {
            for (const item of scored) {
                // すぐ勝てる手は読まない
                const v = item.next.result ? item.score : -search(item.next, depth - 1, -Infinity, -alpha + 0.001, deadline);
                deeper.push({ ...item, score: v });
                if (v > alpha) alpha = v;
            }
            // 枝刈りした手は「alpha 以下」しか分からないので、読んだ値をそのまま順位に使う
            scored = deeper.concat(scored.slice(deeper.length).map(x => ({ ...x, score: -Infinity }))).sort((a, b) => b.score - a.score);
        } catch (error) {
            if (!(error instanceof TimeUp)) throw error;
            // 読めた手は読んだ値、読めなかった手は1手の値から少し割り引いた値で比べる
            const done = new Set(deeper.map(x => x.action));
            scored = deeper.concat(scored.filter(x => !done.has(x.action)).map(x => ({ ...x, score: x.score - 50 }))).sort((a, b) => b.score - a.score);
        }
    }
    return scored.map(({ action, score }) => ({ action, score }));
}

export function chooseCpuCommand(game, seat = game.current, profile = PROFILES.normal) {
    const state = game.state;
    const actions = legalActions(state);
    if (actions.length === 0) return null;
    if (actions.length === 1) return actions[0];
    const random = cpuRandom(game, seat);
    if (profile.random) return actions[Math.floor(random() * actions.length)];
    const scored = scoreActions(state, profile.depth ?? 2);
    // すぐ勝てる手は必ず選ぶ
    const winning = scored.find(x => x.score >= WIN);
    if (winning) return winning.action;
    // 前に出た局面へ戻る手は少し下げ、3回目になる手は引き分け（0）として比べる（有利なときに堂々巡りしない）
    for (const x of scored) {
        const seen = state.history[positionKey(applyAction(state, x.action, { trackHistory: false }))] ?? 0;
        if (seen >= REPETITION_LIMIT - 1) x.score = 0;
        else if (seen > 0) x.score -= REPEAT_PENALTY * seen;
    }
    const noisy = scored.map(x => ({ ...x, score: x.score + (random() - 0.5) * 2 * (profile.noise ?? 0) })).sort((a, b) => b.score - a.score);
    if (random() < (profile.sloppy ?? 0)) {
        // 負けがすぐ見える手（-WIN）は避けて、上位3つから選ぶ
        const top = noisy.filter(x => x.score > -WIN / 2).slice(0, 3);
        if (top.length) return top[Math.floor(random() * top.length)].action;
    }
    return noisy[0].action;
}

// CPU の1手を進める。選んだ手が通らなければ、通る手を順に試す（止まらないように）
export function runCpuStep(game, seat = game.current, profile) {
    if (game.isOver() || seat !== game.current) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    return game.legalActions().some(a => game.applyCommand(seat, a));
}


// ヒント：人の番に、CPU（いちばん強い設定）が選ぶ手を返す。CPU と同じく、その席から見える情報だけで決める
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (!(!game.isOver() && game.current === seat)) return null;
    return chooseCpuCommand(game, seat, { ...PROFILES.normal, noise: 0 });
}
