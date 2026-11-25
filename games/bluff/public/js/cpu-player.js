/**
 * CPU の判断（DOM に依存しない）
 * CPU は自分の席のビュー（自分のダイス、ほかの人が見せたダイスとカップの中の数、宣言の流れ）だけを見て決める。
 * ほかの人のカップの中はのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いとはったりは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう：宣言が当たっている確率を、自分のダイスと見えているダイスと、カップの中の数から二項分布で出す
 *   - ほかの人がこのラウンドで同じ目を宣言していれば、その人のカップに多めにあるとみなす
 *   - 「疑って当たる確率」と「上げた宣言が当たる確率」を比べて、疑うか上げるかを決める
 *   - 上げるときは、当たる確率が高く、上げ幅の小さい宣言。ときどき持っていない目ではったりを打つ
 *   - 自分の宣言が当たりにくいときは、合うダイスを見せて残りを振り直す
 * やさしい：ダイスの総数から大まかに見積もり、迷いを足して疑う。上げるときは最小の上げ方
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { STAR, FACES, matches, legalBids, position } from './bids.js';

export const CPU_LEVELS = ['easy', 'normal'];

const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

// 二項分布で、n 個のうち k 個以上が当たる確率
export function atLeast(n, p, k) {
    if (k <= 0) return 1;
    if (k > n) return 0;
    let total = 0;
    let c = 1;
    for (let i = 0; i <= n; i++) {
        if (i > 0) c = c * (n - i + 1) / i;
        if (i >= k) total += c * p ** i * (1 - p) ** (n - i);
    }
    return Math.min(1, total);
}

// 宣言 bid が当たっている確率（view の席から見て）
export function probability(view, bid, { readBids = true } = {}) {
    const me = view.players[view.you];
    const p = bid.face === STAR ? 1 / 6 : 1 / 3;
    let known = me.dice.filter(d => matches(d.value, bid.face)).length;
    let unknown = 0;
    let hint = 0;
    view.players.forEach(o => {
        if (o.id === view.you) return;
        known += o.shown.filter(v => matches(v, bid.face)).length;
        unknown += o.hidden;
        // 同じ目（星の宣言なら星）を宣言した人は、カップに多めに持っているとみなす（カップ1個につき 0.3 個、多くて 1.5 個）
        if (readBids && o.hidden && view.history.some(h => h.seat === o.id && h.face === bid.face)) hint += Math.min(1.5, 0.3 * o.hidden);
    });
    // 読む分は、全員を合わせて2個まで（大勢が同じ目を宣言しても、吊り上がりすぎないように）
    return atLeast(unknown, p, Math.ceil(bid.qty - known - Math.min(hint, 2)));
}

const totalDice = (view) => view.players.reduce((s, p) => s + p.count, 0);

// ---- 手を選ぶ ----

export function chooseCommand(game, seat, level = game.players[seat].cpuLevel ?? 'normal') {
    const view = createGameView(game, seat);
    if (!view.actors.includes(seat)) return null;
    if (view.phase === 'reveal') return { type: 'next' };
    const rand = cpuRandom(game, seat);
    return level === 'easy' ? chooseEasy(view, rand) : chooseNormal(view, rand);
}

function chooseNormal(view, rand) {
    const me = view.players[view.you];
    const current = view.bid;
    const candidates = legalBids(current).filter(b => !current || position(b) - position(current) <= 6);
    const own = (face) => me.dice.filter(d => matches(d.value, face)).length;
    const scored = candidates.map(b => {
        const p = probability(view, b);
        const step = current ? position(b) - position(current) : 0;
        // 当たる確率が高く、上げ幅の小さい宣言。開くときは、確率が十分なうちで大きい数
        const score = current ? p - step * 0.03 + rand() * 0.04 : (p >= 0.62 ? b.qty * 0.1 + p : p - 1) + rand() * 0.04;
        return { bid: b, p, score };
    }).sort((a, b) => b.score - a.score);
    let choice = scored[0] ?? null;
    // はったり：ときどき、持っていない目で上げる（当たる確率がそこそこあるもの）
    if (current && choice && rand() < 0.12) {
        const bluff = scored.find(s => own(s.bid.face) === 0 && s.p >= 0.35);
        if (bluff) choice = bluff;
    }
    if (current) {
        const doubt = 1 - probability(view, current);
        if (!choice || doubt > choice.p + 0.08) return { type: 'challenge' };
    }
    const command = { type: 'bid', qty: choice.bid.qty, face: choice.bid.face };
    // 当たりにくいときは、合うダイスを見せて残りを振り直す
    if (view.options.reroll && choice.p < 0.55) {
        const cup = me.dice.map((d, i) => ({ d, i })).filter(x => !x.d.shown);
        const hit = cup.filter(x => matches(x.d.value, choice.bid.face)).map(x => x.i);
        if (hit.length && cup.length - hit.length >= 1) command.reveal = hit;
    }
    return command;
}

function chooseEasy(view, rand) {
    const me = view.players[view.you];
    const current = view.bid;
    const total = totalDice(view);
    if (current) {
        // 大まかな見積もり（数の目は 1/3、星は 1/6）に迷いを足す
        const expected = total * (current.face === STAR ? 1 / 6 : 1 / 3) + (rand() * 3 - 1);
        if (current.qty > expected + 0.5) return { type: 'challenge' };
    }
    // 自分の多い目で、最小の上げ方
    const counts = FACES.map(f => ({ f, n: me.dice.filter(d => matches(d.value, f)).length + rand() }));
    const face = counts.sort((a, b) => b.n - a.n)[0].f;
    const options = legalBids(current);
    const pick = options.find(b => b.face === face) ?? options[0];
    if (!pick) return { type: 'challenge' };
    if (!current) {
        const qty = Math.max(1, Math.round(total / 3 * 0.6));
        return { type: 'bid', qty, face };
    }
    return { type: 'bid', qty: pick.qty, face: pick.face };
}

// ---- 進める ----

export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// 待っている CPU に1手打たせる。思わぬ形なら、いちばん単純な答えで進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    let command = null;
    try {
        command = chooseCommand(game, seat, level);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return command;
    const fallback = simplestCommand(game);
    return fallback && game.applyCommand(seat, fallback) ? fallback : null;
}

// いちばん単純な答え（結果のあとは次へ、宣言があれば疑う、なければ 1 の1個）
export function simplestCommand(game) {
    if (game.phase === 'reveal') return { type: 'next' };
    if (game.bid) return { type: 'challenge' };
    return { type: 'bid', qty: 1, face: 1 };
}
