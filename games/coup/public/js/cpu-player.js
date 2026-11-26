/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（自分の手札・全員のコインと失った札・名乗りの履歴）だけを見て決める。ほかの人の手札や山はのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。はったりの迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * 相手が役割を持つ見込み：
 * - 見えている枚数（自分の手札と、全員の失った札）が3枚なら、その役割を名乗るのは確実な嘘
 * - そうでなければ、見えていない札（ほかの人の手札と山）から、その人の手札の枚数だけ引いて当たる確率を出す
 * - 前にも同じ役割を名乗っていて、名乗った役割の種類が手札の枚数以下なら、見込みを上げる
 *   手札の枚数より多くの種類を名乗っていれば、どれかは嘘なので下げる。嘘がばれたことがあれば下げる
 *
 * ふつう：持っている役割を使い、ときどきはったり（税・強奪）をする。確実な嘘と、見込みの低い名乗りにチャレンジし、
 *        自分が損をする名乗り（自分への暗殺・強奪、自分の行動へのブロック）には厳しくする。最後の1枚への暗殺は、伯爵夫人のはったりで防ぐ
 * やさしい：ほとんどはったりをせず、チャレンジは確実な嘘のときにだいたいするだけ
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { ROLE_ORDER, ACTIONS } from './roles.js';

export const CPU_LEVELS = ['easy', 'normal'];
const COPIES = 3;
const VALUE = { duke: 5, assassin: 4.5, captain: 4, contessa: 3.5, ambassador: 2.5 };

const count = (list, item) => list.filter(x => x === item).length;

function choose(n, k) {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 0; i < k; i++) r = r * (n - i) / (i + 1);
    return r;
}

// ビューから見た、役割ごとの見えていない枚数
function unseenCounts(view) {
    const me = view.players[view.you];
    const seen = [...me.hand, ...view.players.flatMap(p => p.lost)];
    return Object.fromEntries(ROLE_ORDER.map(r => [r, Math.max(0, COPIES - count(seen, r))]));
}

// seat の人が role を持っている見込み（0〜1）。excludeLast：今の名乗りを履歴から除く
export function belief(view, seat, role, { excludeLast = false } = {}) {
    const unseen = unseenCounts(view);
    if (!unseen[role]) return 0;
    const total = ROLE_ORDER.reduce((s, r) => s + unseen[r], 0);
    const k = view.players[seat].cardCount;
    let b = 1 - choose(total - unseen[role], k) / choose(total, k);
    const claims = excludeLast ? view.claims[seat].slice(0, -1) : view.claims[seat];
    const open = claims.filter(c => c.result === null);
    const kinds = new Set(open.map(c => c.role));
    if (kinds.has(role)) {
        const honesty = Math.min(1, k / kinds.size);
        b += (0.85 - b) * honesty * 0.8;
    } else if (kinds.size >= k) {
        b *= 0.45; // 手札の枚数だけ、もうほかの役割を名乗っている
    }
    if (claims.some(c => c.result === 'caught')) b *= 0.8;
    return Math.min(0.97, b);
}

// CPU 用の乱数（ゲームの乱数とは別）
const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

// 相手の怖さ（クーと暗殺の相手を選ぶ）
const threat = (view, p) => p.cardCount * 10 + p.coins + (p.coins >= 7 ? 6 : 0);

function pickTarget(view, seats, adjust = () => 0) {
    return [...seats].sort((a, b) => (threat(view, view.players[b]) + adjust(b)) - (threat(view, view.players[a]) + adjust(a)) || a - b)[0];
}

// ---- 手を選ぶ ----

// ヒント：人が答える番に、CPU（ふつう）が選ぶ操作。CPU と同じく、その人のビューだけで決める。手は打たない
export function suggest(game, seat) {
    if (game.isOver() || !game.actors().includes(seat)) return null;
    return chooseCommand(game, seat, 'normal');
}

export function chooseCommand(game, seat, level = game.players[seat].cpuLevel ?? 'normal') {
    const view = createGameView(game, seat);
    const rand = cpuRandom(game, seat);
    const easy = level === 'easy';
    switch (view.phase) {
        case 'action': return chooseAction(view, rand, easy);
        case 'challengeAction': case 'challengeBlock': return chooseChallenge(view, rand, easy);
        case 'block': return chooseBlock(view, rand, easy);
        case 'lose': return { type: 'lose', role: worstCard(view.players[seat].hand) };
        case 'exchange': return { type: 'exchange', keep: bestKeep([...view.players[seat].hand, ...view.drawn], view.players[seat].cardCount) };
        default: return null;
    }
}

function chooseAction(view, rand, easy) {
    const me = view.players[view.you];
    const hand = me.hand;
    const legal = view.legalActions;
    const others = view.players.filter(p => p.alive && p.id !== me.id).map(p => p.id);
    const unseen = unseenCounts(view);
    const has = (role) => hand.includes(role);
    const act = (action, target = null) => ({ type: 'action', action, target });

    if (legal.length === 1) return act('coup', pickTarget(view, others));
    if (me.coins >= 7) return act('coup', pickTarget(view, others));

    // 暗殺：伯爵夫人を持っていそうな相手は避ける
    const bluffRate = easy ? 0.06 : (me.cardCount === 1 ? 0.2 : 0.4);
    if (me.coins >= 3 && (has('assassin') || (!easy && unseen.assassin && rand() < bluffRate * 0.4))) {
        const target = pickTarget(view, others, id => -belief(view, id, 'contessa') * 20);
        if (easy || belief(view, target, 'contessa') < 0.6) return act('assassinate', target);
    }
    if (has('duke')) return act('tax');
    // 強奪：2コイン以上持っていて、ブロックしそうにない相手
    // ブロックされ続けると進まないので、船長か大使を持っていそうな相手からは奪わない
    // 最近（全員が2周するうち）に、強奪を船長か大使でブロックした人も外す
    const blocksSteal = (id) => belief(view, id, 'captain') + belief(view, id, 'ambassador');
    const recent = view.turnNumber - view.players.length * 2;
    const blockedLately = (id) => view.claims[id].some(c => c.kind === 'block' && c.turn > recent && (c.role === 'captain' || c.role === 'ambassador'));
    const stealTargets = others.filter(id => view.players[id].coins >= 2 && blocksSteal(id) < 0.75 && !blockedLately(id));
    const stealFrom = stealTargets.length ? pickTarget(view, stealTargets, id => view.players[id].coins * 3 - (belief(view, id, 'captain') + belief(view, id, 'ambassador')) * 15) : null;
    if (has('captain') && stealFrom !== null) return act('steal', stealFrom);
    // はったり
    if (unseen.duke && rand() < bluffRate) return act('tax');
    if (!easy && stealFrom !== null && unseen.captain && rand() < bluffRate * 0.5) return act('steal', stealFrom);
    if (has('ambassador') && (hand.length === 2 && (hand[0] === hand[1] || hand.every(r => VALUE[r] < 4)))) return act('exchange');
    // 援助：だれかが公爵を名乗っていれば、ブロックされやすいので収入
    const dukeClaimed = others.some(id => belief(view, id, 'duke') > 0.5);
    if (!dukeClaimed || (easy && rand() < 0.5)) return act('foreignAid');
    return act('income');
}

function chooseChallenge(view, rand, easy) {
    const t = view.turn;
    const me = view.players[view.you];
    const onBlock = view.phase === 'challengeBlock';
    const claimant = onBlock ? t.blocker : t.actor;
    const role = onBlock ? t.blockRole : t.claim;
    const b = belief(view, claimant, role, { excludeLast: true });
    const allow = { type: 'allow' };
    if (easy) {
        if (b === 0 && rand() < 0.7) return { type: 'challenge' };
        return rand() < 0.03 ? { type: 'challenge' } : allow;
    }
    if (b === 0) return { type: 'challenge' };
    const againstMe = onBlock ? t.actor === me.id : t.target === me.id;
    let threshold = 0.12;
    if (againstMe) threshold = 0.28;
    // 最後の1枚を暗殺される：伯爵夫人がなければ、あやしい暗殺者にはチャレンジする（通れば負け）
    if (!onBlock && t.action === 'assassinate' && t.target === me.id && me.cardCount === 1 && !me.hand.includes('contessa')) {
        threshold = 0.5;
    }
    if (!onBlock && t.action === 'tax' && view.players[t.actor].coins >= 4) threshold += 0.06;
    if (me.cardCount === 1 && threshold < 0.5) threshold *= 0.6;
    return b < threshold - rand() * 0.05 ? { type: 'challenge' } : allow;
}

function chooseBlock(view, rand, easy) {
    const t = view.turn;
    const me = view.players[view.you];
    const blockers = ACTIONS[t.action].blockers;
    const real = blockers.find(r => me.hand.includes(r));
    if (real) return { type: 'block', role: real };
    const unseen = unseenCounts(view);
    const possible = blockers.filter(r => unseen[r] > 0);
    if (!possible.length) return { type: 'allow' };
    const role = possible.sort((a, b) => unseen[b] - unseen[a])[0];
    let rate = 0;
    if (t.action === 'assassinate') rate = me.cardCount === 1 ? (easy ? 0.5 : 0.9) : (easy ? 0 : 0.3);
    else if (t.action === 'steal' && me.coins >= 2) rate = easy ? 0 : 0.3;
    else if (t.action === 'foreignAid' && view.players[t.actor].coins >= 5) rate = easy ? 0 : 0.12;
    return rand() < rate ? { type: 'block', role } : { type: 'allow' };
}

function worstCard(hand) {
    return [...hand].sort((a, b) => VALUE[a] - VALUE[b])[0];
}

// 残す札：価値の高い順。同じ役割の2枚目は低く見る
function bestKeep(pool, n) {
    const keep = [];
    const rest = [...pool];
    while (keep.length < n) {
        rest.sort((a, b) => (VALUE[b] - (keep.includes(b) ? 3 : 0)) - (VALUE[a] - (keep.includes(a) ? 3 : 0)));
        keep.push(rest.shift());
    }
    return keep;
}

// ---- 進める ----

// 答えを待っている CPU（席の順で最初の人）
export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// 答えを待っている CPU に1手打たせる。思わぬ選択を求められたら、いちばん単純な手で進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    const command = chooseCommand(game, seat, level);
    if (command && game.applyCommand(seat, command)) return command;
    const p = game.players[seat];
    const fallbacks = [{ type: 'allow' }, { type: 'lose', role: p.hand[0] }, { type: 'exchange', keep: [...p.hand] },
        { type: 'action', action: game.legalActions(seat).includes('coup') ? 'coup' : 'income', target: game.targets(seat)[0] }];
    for (const fallback of fallbacks) {
        if (fallback.action === 'income') delete fallback.target;
        if (game.applyCommand(seat, fallback)) return fallback;
    }
    return null;
}

