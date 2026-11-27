/**
 * CPU の仲間とヒント（DOM に依存しない。ゲームの乱数は使わず、状態だけから決める）
 *
 * 手の良さは「山がどれだけ進むか」（飛ばした数）で測る。10戻せるなら -10 で、とても良い手
 * - 決まった枚数は、手札の中の組み合わせ（大きい方を出してから10戻すなど）も含めて、飛ばす数の合計が一番小さい並びで出す
 * - 決まった枚数を出したあとも、ほとんど飛ばさずに出せるカードがあれば続けて出す
 * - 仲間の合図がある山に大きく飛ばして出すのは避ける
 * - 自分の番でないときは、手札に近いカードがある山に合図を置く（数字は伝えない）
 */

import { canPlace, jumpOf, BACK_STEP, PILES } from './game.js';

// 強さ
// readSignals：仲間の合図を読む / giveSignals：合図を出す / depth：決まった枚数を何枚先まで組み合わせて考えるか
// extra：決まった枚数のあと、飛ばす数がこれ以下なら続けて出す（soloExtra は1人のとき。仲間がいないので控えめに） / spare：残りの手札の良さも見る
export const PROFILES = {
    easy: { readSignals: false, giveSignals: false, depth: 1, extra: -BACK_STEP, soloExtra: -BACK_STEP, spare: false },
    normal: { readSignals: true, giveSignals: true, depth: 2, extra: 3, soloExtra: 1, spare: false, stopPenalty: 0.6, goodPenalty: 0.3, stopGap: 3, goodGap: 7, maxMarks: 2 },
    strong: { readSignals: true, giveSignals: true, depth: 3, extra: 5, soloExtra: 1, spare: true, stopPenalty: 0.8, goodPenalty: 0.2, stopGap: 2, goodGap: 6, maxMarks: 2 }
};
export const LEVELS = ['easy', 'normal', 'strong'];
export const LEVEL_NAMES = { easy: 'やさしい', normal: 'ふつう', strong: 'つよい' };

export const CPU_HELP = [
    '山がどれだけ進むか（飛ばした数）が小さい手を選びます。ちょうど10戻せるなら、それを優先します',
    'やさしい：1枚ずつ、その場で一番近いカードを出します。合図は出さず、読みません',
    'ふつう：手札の2枚の組み合わせ（大きい方を出してから10戻すなど）まで考え、仲間の合図がある山を避けます。近いカードがある山に合図を置きます',
    'つよい：3枚先まで組み合わせを考え、残りの手札の出しやすさも見ます。決まった枚数のあとも、近いカードは続けて出します'
];

const profileOf = (game, seat) => PROFILES[game.players[seat].level] ?? PROFILES.normal;

// 仲間の合図による重み（その山に d だけ飛ばして出すとき）
function signalPenalty(game, seat, pile, jump, profile) {
    if (!profile.readSignals || jump <= 0) return 0;
    let penalty = 0;
    game.signals.forEach((marks, other) => {
        if (other === seat || game.hands[other].length === 0) return;
        if (marks[pile] === 'stop') penalty += Math.min(jump, 12) * profile.stopPenalty + 2;
        else if (marks[pile] === 'good') penalty += Math.min(jump, 12) * profile.goodPenalty + 1;
    });
    return penalty;
}

// その手の重み（小さいほど良い）
function moveCost(game, seat, piles, card, pile, profile) {
    const jump = jumpOf(piles[pile], card);
    return jump + signalPenalty(game, seat, pile, jump, profile);
}

// 残りの手札の出しやすさ（各カードの、一番近い山までの飛ばす数の合計を小さく）
function spareCost(hand, piles) {
    let total = 0;
    for (const card of hand) {
        let best = 99;
        for (const pile of piles) if (canPlace(pile, card)) best = Math.min(best, jumpOf(pile, card));
        total += Math.max(best, -BACK_STEP);
    }
    return total / Math.max(1, hand.length);
}

// 2つの山に置かれた合図が同じか
const sameSignals = (game, a, b) => game.signals.every(marks => marks[a] === marks[b]);

// 何枚かを続けて出す並びのうち、重みの合計が一番小さいもの。{ cost, moves } か null
// count 枚を出せないときは、出せるだけ多く出す並び（出せなくなったら終わりだが、出せる分は出す）
function bestSequence(game, seat, count, profile) {
    const piles0 = game.piles.map(p => ({ ...p }));
    const hand0 = [...game.hands[seat]];
    let best = null;
    const consider = (hand, piles, cost, moves) => {
        if (moves.length === 0) return;
        const total = cost + (profile.spare ? spareCost(hand, piles) * 0.3 : 0);
        if (!best || moves.length > best.moves.length || (moves.length === best.moves.length && total < best.cost - 1e-9)) {
            best = { cost: total, moves: [...moves] };
        }
    };
    const search = (hand, piles, depth, cost, moves) => {
        if (depth === 0 || hand.length === 0) return consider(hand, piles, cost, moves);
        let moved = false;
        for (let h = 0; h < hand.length; h++) {
            const card = hand[h];
            if (h > 0 && hand[h - 1] === card) continue;
            for (let p = 0; p < piles.length; p++) {
                if (!canPlace(piles[p], card)) continue;
                // 同じ向き・同じ一番上・同じ合図の山は、片方だけ試す
                if (piles.slice(0, p).some((q, i) => q.dir === piles[p].dir && q.top === piles[p].top && sameSignals(game, i, p))) continue;
                const c = moveCost(game, seat, piles, card, p, profile);
                const nextPiles = piles.map((q, i) => (i === p ? { ...q, top: card } : q));
                const nextHand = hand.filter((_, i) => i !== h);
                moves.push({ card, pile: p });
                moved = true;
                search(nextHand, nextPiles, depth - 1, cost + c, moves);
                moves.pop();
            }
        }
        if (!moved) consider(hand, piles, cost, moves);
    };
    search(hand0, piles0, count, 0, []);
    return best;
}

// その席の次の手（番でなければ null）
export function chooseMove(game, seat, level = game.players[seat]?.level) {
    if (game.isOver || seat !== game.current) return null;
    const base = PROFILES[level] ?? PROFILES.normal;
    const profile = game.players.length === 1 ? { ...base, extra: base.soloExtra } : base;
    const need = game.required - game.played;
    if (need > 0) {
        const depth = Math.max(need, Math.min(profile.depth, game.hands[seat].length));
        // 決まった枚数より先まで考えるときは、余分に出す分も「続けて出してよい」ときだけ数える
        const plan = bestSequence(game, seat, need, { ...profile, depth: need }) ?? null;
        const deeper = depth > need ? bestSequence(game, seat, depth, profile) : null;
        const pick = deeper && plan && deeper.moves.length === depth && deeper.cost <= plan.cost + profile.extra * (depth - need) ? deeper : plan;
        if (!pick) return null;
        const { card, pile } = pick.moves[0];
        return { type: 'play', card, pile };
    }
    // 決まった枚数は出した。近いカードがあれば続けて出す
    if (game.hands[seat].length > 0) {
        const depth = Math.min(profile.depth, game.hands[seat].length);
        for (let n = 1; n <= depth; n++) {
            const plan = bestSequence(game, seat, n, { ...profile, spare: false });
            if (plan && plan.moves.length === n && plan.cost <= profile.extra * n) {
                const { card, pile } = plan.moves[0];
                return { type: 'play', card, pile };
            }
        }
    }
    return { type: 'end' };
}

// その席が置きたい合図（山ごとに null・'stop'・'good'）
export function desiredSignals(game, seat) {
    const profile = profileOf(game, seat);
    const marks = PILES.map(() => null);
    if (!profile.giveSignals || game.isOver || game.hands[seat].length === 0) return marks;
    const scored = [];
    game.piles.forEach((pile, index) => {
        let best = Infinity;
        for (const card of game.hands[seat]) if (canPlace(pile, card)) best = Math.min(best, jumpOf(pile, card));
        if (best <= profile.stopGap) scored.push({ index, best, mark: 'stop' });
        else if (best <= profile.goodGap) scored.push({ index, best, mark: 'good' });
    });
    scored.sort((a, b) => a.best - b.best || a.index - b.index);
    scored.slice(0, profile.maxMarks).forEach(({ index, mark }) => { marks[index] = mark; });
    return marks;
}

// 合図を変えたい CPU の席と、その山（自分の番の CPU は、番の間は変えない）
function pendingSignal(game) {
    for (const player of game.players) {
        if (!player.isCPU || player.seat === game.current) continue;
        const want = desiredSignals(game, player.seat);
        const pile = want.findIndex((mark, i) => mark !== game.signals[player.seat][i]);
        if (pile >= 0) return { seat: player.seat, command: { type: 'signal', pile, mark: want[pile] } };
    }
    return null;
}

// CPU が動くことがあるか
export function hasCpuWork(game) {
    if (game.isOver) return false;
    if (game.players[game.current].isCPU) return true;
    return pendingSignal(game) !== null;
}

// CPU を1手進める（合図の置き直しを先に）。進んだら true
export function runCpuStep(game) {
    if (game.isOver) return false;
    const pending = pendingSignal(game);
    if (pending) return game.applyCommand(pending.seat, pending.command);
    const seat = game.current;
    if (!game.players[seat].isCPU) return false;
    const move = chooseMove(game, seat);
    return move ? game.applyCommand(seat, move) : false;
}

// ヒント：人のおすすめの手（つよい CPU と同じ考え。番でなければ null）
export function suggest(game, seat) {
    return chooseMove(game, seat, 'strong');
}
