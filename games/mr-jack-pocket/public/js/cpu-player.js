/**
 * CPU の判断（DOM に依存しない）
 * chooseCommand はビューだけを見て決める。刑事側の CPU はジャックの正体も、ジャック側のアリバイも見ない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう：このラウンドの残りの手を、相手の手も含めて読む（ミニマックス。手の数が多いときは2手、少なければ3手まで）
 * - 読んだ先の局面は「今、目撃が起きたら」で評価する
 *   刑事側：まだ無実でない容疑者のだれがジャックでも同じ重みとして、目撃のあとに残る容疑者の数の平均と、ジャック側が砂時計を得る見込みを小さくしたい
 *   ジャック側：自分の正体で、目撃のあとに残る容疑者の数と、砂時計を得るかを大きくしたい
 * - アリバイは、引く札が見えないので見込みで数える（刑事側は容疑者が減る見込み、ジャック側は砂時計の平均）
 * - 砂時計が6つに近いほど、砂時計の重みを上げる
 * やさしい：6割はでたらめな手、4割は1手だけ読んだ手
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { JACK, DETECTIVE, pickOrder, visibleSuspects } from './game.js';
import { TOKENS, DETECTIVES, SUSPECTS, HOURGLASSES_TO_WIN } from './data.js';
import { SIZE, TRACK } from './board.js';

export const CPU_LEVELS = ['easy', 'normal'];
const LEAF_BUDGET = 40000;   // 3手読むときの、読む局面の数の上限の目安
const AVG_ALIBI_GLASS = SUSPECTS.reduce((s, x) => s + x.hourglasses, 0) / SUSPECTS.length;

// ---- 見える範囲の局面 ----

function stateFromView(view) {
    return {
        tiles: view.tiles.map(t => ({ ...t })),
        detectives: { ...view.detectives },
        tokens: view.tokens.map(t => ({ ...t })),
        rotated: [...view.rotated],
        round: view.round,
        pick: view.pick,
        deckCount: view.deckCount,
        alibiClear: 0, // 刑事側のアリバイで減る容疑者の見込み
        alibiGlass: 0  // ジャック側のアリバイで得る砂時計の見込み
    };
}

const copy = (s) => ({ ...s, tiles: s.tiles.map(t => ({ ...t })), detectives: { ...s.detectives }, tokens: s.tokens.map(t => ({ ...t })), rotated: [...s.rotated] });

// その局面で打てる手（同じ面の行動タイルは1つにまとめる）
export function legalCommands(state, seat) {
    const out = [];
    const seen = new Set();
    state.tokens.forEach((t, i) => {
        if (t.used) return;
        const action = TOKENS[i][t.face];
        if (seen.has(action)) return;
        seen.add(action);
        if (action === 'holmes' || action === 'watson' || action === 'toby') {
            [1, 2].forEach(steps => out.push({ type: 'move', who: action, steps }));
        } else if (action === 'joker') {
            DETECTIVES.forEach(d => out.push({ type: 'joker', who: d.key, steps: 1 }));
            if (seat === JACK) out.push({ type: 'joker', who: 'holmes', steps: 0 });
        } else if (action === 'rotate') {
            state.tiles.forEach((tile, pos) => {
                if (state.rotated.includes(pos)) return;
                for (let rot = 0; rot < 4; rot++) if (rot !== tile.rot) out.push({ type: 'rotate', tile: pos, rot });
            });
        } else if (action === 'exchange') {
            for (let a = 0; a < SIZE * SIZE; a++) for (let b = a + 1; b < SIZE * SIZE; b++) out.push({ type: 'exchange', a, b });
        } else if (action === 'alibi' && state.deckCount > 0) {
            out.push({ type: 'alibi' });
        }
    });
    return out;
}

function apply(state, seat, c, view) {
    const s = copy(state);
    const action = c.type === 'move' ? c.who : c.type;
    const i = s.tokens.findIndex((t, k) => !t.used && TOKENS[k][t.face] === action);
    s.tokens[i].used = true;
    if (c.type === 'move' || c.type === 'joker') s.detectives[c.who] = (s.detectives[c.who] + c.steps) % TRACK;
    else if (c.type === 'rotate') {
        s.tiles[c.tile].rot = c.rot;
        s.rotated.push(c.tile);
    } else if (c.type === 'exchange') {
        [s.tiles[c.a], s.tiles[c.b]] = [s.tiles[c.b], s.tiles[c.a]];
        s.rotated = s.rotated.map(p => (p === c.a ? c.b : p === c.b ? c.a : p));
    } else if (c.type === 'alibi') {
        s.deckCount -= 1;
        if (seat === JACK) s.alibiGlass += AVG_ALIBI_GLASS;
        else {
            // 山（とジャック側が引いた札）のうち、まだ無実でないジャック以外の容疑者の札を引く見込み
            const left = s.tiles.filter(t => !t.cleared).length;
            const unknown = view.deckCount + view.jackCardCount;
            s.alibiClear += unknown ? Math.max(0, left - 1) / unknown : 0;
        }
    }
    s.pick += 1;
    return s;
}

// 「今、目撃が起きたら」の値（seat から見て大きいほどよい）
function evaluate(state, seat, view) {
    const visible = visibleSuspects(state.tiles, state.detectives);
    const left = state.tiles.filter(t => !t.cleared).map(t => t.suspect);
    const seenLeft = left.filter(k => visible.has(k)).length;
    const glassNow = view.hourglasses + (seat === JACK ? view.totalHourglasses - view.hourglasses : view.jackCardCount * AVG_ALIBI_GLASS);
    // 砂時計が6つに近いほど、1つの重みを上げる
    const glassWeight = 1.2 + 1.5 * Math.max(0, glassNow + 2 - HOURGLASSES_TO_WIN);
    const outcome = (jack) => (visible.has(jack) ? { remain: seenLeft, glass: 0 } : { remain: left.length - seenLeft, glass: 1 });
    if (seat === JACK) {
        const o = outcome(view.jack);
        const remain = Math.max(1, o.remain - state.alibiClear);
        // 残りが1人になると捕まる
        const caught = remain <= 1 ? 6 : 0;
        return remain + glassWeight * (o.glass + state.alibiGlass) - caught;
    }
    let sum = 0;
    left.forEach(j => {
        const o = outcome(j);
        const remain = Math.max(1, o.remain - state.alibiClear);
        sum += -remain - glassWeight * (o.glass + state.alibiGlass) + (remain <= 1 ? 6 : 0);
    });
    return sum / Math.max(1, left.length);
}

// ミニマックス（me から見た値）
function search(state, me, depth, view, alpha, beta) {
    if (depth === 0 || state.pick >= 4) return evaluate(state, me, view);
    const mover = pickOrder(state.round)[state.pick];
    const moves = legalCommands(state, mover);
    if (!moves.length) return evaluate(state, me, view);
    if (mover === me) {
        let best = -Infinity;
        for (const c of moves) {
            best = Math.max(best, search(apply(state, mover, c, view), me, depth - 1, view, alpha, beta));
            alpha = Math.max(alpha, best);
            if (alpha >= beta) break;
        }
        return best;
    }
    let best = Infinity;
    for (const c of moves) {
        best = Math.min(best, search(apply(state, mover, c, view), me, depth - 1, view, alpha, beta));
        beta = Math.min(beta, best);
        if (alpha >= beta) break;
    }
    return best;
}

// 読む深さ：このラウンドの残りの手まで。手が多ければ2手
function depthFor(state, me) {
    const remaining = 4 - state.pick;
    if (remaining <= 2) return remaining;
    const n = legalCommands(state, me).length;
    return n * n * 20 <= LEAF_BUDGET ? 3 : 2;
}

// ---- 手を選ぶ（ビューだけを見る） ----

// rand を渡さないときの迷い。見えている局面から作るので、同じ局面なら同じ手を選ぶ
function viewRandom(view) {
    const s = JSON.stringify(view);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return createRandom(h >>> 0);
}

export function chooseCommand(view, level = 'normal', rand = viewRandom(view)) {
    const me = view.you;
    if (view.phase === 'end' || !view.answering.includes(me)) return null;
    const state = stateFromView(view);
    const moves = legalCommands(state, me);
    if (!moves.length) return null;
    if (level === 'easy' && rand() < 0.6) return moves[Math.floor(rand() * moves.length)];
    const depth = level === 'easy' ? 1 : depthFor(state, me);
    let best = null;
    for (const c of moves) {
        const v = search(apply(state, me, c, view), me, depth - 1, view, -Infinity, Infinity) + rand() * 0.01;
        if (!best || v > best.v) best = { c, v };
    }
    return best.c;
}

// ヒント：人の番に、ふつうの CPU が選ぶ手を返す（同じ局面なら同じ手）
export function suggest(view) {
    return chooseCommand(view, 'normal');
}

// CPU 用の乱数（ゲームの乱数とは別）
export const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

// ---- 進める ----

export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// 操作を待っている CPU に1手打たせる。選んだ手が通らなければ、打てる手を順に試す
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    const view = createGameView(game, seat);
    const command = chooseCommand(view, level ?? game.players[seat].cpuLevel ?? 'normal', cpuRandom(game, seat));
    if (command && game.applyCommand(seat, command)) return command;
    for (const c of legalCommands(stateFromView(view), seat)) {
        if (game.applyCommand(seat, c)) return c;
    }
    return null;
}

export { JACK, DETECTIVE };
