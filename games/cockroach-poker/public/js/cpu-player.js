/**
 * CPU の判断（DOM に依存しない）
 * chooseCommand はビュー（自分の手札、全員の前のカード、終わった回の記録、自分が見たカード）だけを見て決める。
 * ほかの人の手札や伏せたカードの中身はのぞかない
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ゲームが持つ cpuSalt と状態から作った別の乱数で決める
 *
 * ふつう
 * - 答える：見えていない枚数（8枚から、自分の手札と全員の前のカードを引く）と、言った人の正直さ（終わった回で、言ったことが本当だった割合）から、
 *   言ったことが本当の確率を出す。そのうえで、外れて自分が引き取る怖さ（負けに近い種類か）と、当たって相手に引き取らせる得を比べて答える。
 *   どちらも怖いときや迷うときは、見てから回す
 * - 渡す：相手が負けに近い種類を、自分が引き取っても怖くない範囲で選ぶ。言う種類は、相手が「本当」と答えやすい人なら嘘、「うそ」と答えやすい人なら本当に寄せ、はったりを混ぜる
 * やさしい：答えはほぼ当てずっぽう（3枚とも見えない種類だけ、ときどき見抜く）。渡すカードと相手と言う種類は、でたらめ
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { KIND_ORDER, COPIES } from './kinds.js';

export const CPU_LEVELS = ['easy', 'normal'];

const count = (list, item) => list.filter(x => x === item).length;
const sum = (list) => list.reduce((s, v) => s + v, 0);

// ビューから見た、種類ごとの見えていない枚数（自分の手札・全員の前のカード・自分が見た伏せたカードを除く）
export function unseenCounts(view) {
    const me = view.players[view.you];
    const known = [...me.hand, ...view.players.flatMap(p => p.table)];
    if (view.round?.card) known.push(view.round.card);
    return Object.fromEntries(KIND_ORDER.map(k => [k, Math.max(0, COPIES - count(known, k))]));
}

// seat の人が kind を引き取ったときの痛さ。負けになるなら 100
export function danger(view, seat, kind) {
    const p = view.players[seat];
    const left = view.limit - count(p.table, kind);
    if (left <= 1 || p.handCount === 0) return 100;
    return (left === 2 ? 12 : left === 3 ? 4 : 1.5) + p.table.length * 0.15;
}

// seat の人が、言ったことが本当だった割合（終わった回で。少ないうちは 0.45 に寄せる）
export function honesty(view, seat) {
    const said = view.history.flatMap(h => h.chain.filter(c => c.from === seat).map(c => c.claim === h.card));
    return (count(said, true) + 0.45 * 4) / (said.length + 4);
}

// seat の人が「本当」と答えた割合（少ないうちは 0.5 に寄せる）
export function saysTrueRate(view, seat) {
    const said = view.history.filter(h => h.answerer === seat).map(h => h.said);
    return (count(said, true) + 2) / (said.length + 4);
}

// 今の言ったことが本当の確率（受けた人から見て）
export function truthChance(view) {
    const r = view.round;
    const unseen = unseenCounts(view);
    if (!unseen[r.claim]) return 0;
    const total = sum(Object.values(unseen));
    if (unseen[r.claim] === total) return 1;
    const h = honesty(view, r.from);
    const ratio = Math.min(2, unseen[r.claim] / (total / KIND_ORDER.length));
    return (h * ratio) / (h * ratio + (1 - h));
}

// CPU 用の乱数（ゲームの乱数とは別）
export const cpuRandom = (game, seat) => createRandom((game.cpuSalt ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 1, 0x85EBCA6B)) >>> 0);

// ---- 手を選ぶ（ビューだけを見る） ----

// rand を渡さないときの迷い。見えている局面から作るので、同じ局面なら同じ手を選ぶ
function viewRandom(view) {
    const s = JSON.stringify(view);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return createRandom(h >>> 0);
}

// ヒント：自分が操作する番に、CPU（ふつう）が選ぶ操作。ビュー（自分に見えるもの）だけで決める
export function suggest(view) {
    if (!view?.answering?.includes(view.you)) return null;
    return chooseCommand(view, 'normal');
}

export function chooseCommand(view, level = 'normal', rand = viewRandom(view)) {
    const easy = level === 'easy';
    switch (view.phase) {
        case 'give': return easy ? giveEasy(view, rand) : giveNormal(view, rand);
        case 'respond': return easy ? respondEasy(view, rand) : respondNormal(view, rand);
        case 'pass': return easy ? passEasy(view, rand) : passNormal(view, rand);
        default: return null;
    }
}

const pick = (list, rand) => list[Math.floor(rand() * list.length)];
const others = (view) => view.players.map(p => p.id).filter(id => id !== view.you);

// 嘘で言う種類：相手の前に多い種類ほど選びやすくする（引き取りたくない種類を言われると迷う）
function lieClaim(view, card, target, rand) {
    const table = view.players[target].table;
    const candidates = KIND_ORDER.filter(k => k !== card && count(view.players.flatMap(p => p.table), k) < COPIES - 1);
    const pool = candidates.length ? candidates : KIND_ORDER.filter(k => k !== card);
    const weights = pool.map(k => 1 + count(table, k) * 1.5);
    let x = rand() * sum(weights);
    for (let i = 0; i < pool.length; i++) {
        x -= weights[i];
        if (x < 0) return pool[i];
    }
    return pool.at(-1);
}

// 本当を言うか：相手が「本当」と答えやすいなら嘘に、「うそ」と答えやすいなら本当に寄せる
function tellTruth(view, target, rand) {
    const s = saysTrueRate(view, target);
    const p = Math.min(0.75, Math.max(0.25, 1 - s));
    return rand() < p;
}

function giveNormal(view, rand) {
    const me = view.players[view.you];
    let best = null;
    for (const card of new Set(me.hand)) {
        for (const target of others(view)) {
            // 相手が外せば相手が、当てれば自分が引き取る
            const score = danger(view, target, card) - danger(view, view.you, card) * 0.8
                + count(me.hand, card) * 0.3 + rand() * 2;
            if (!best || score > best.score) best = { card, target, score };
        }
    }
    const { card, target } = best;
    const claim = tellTruth(view, target, rand) ? card : lieClaim(view, card, target, rand);
    return { type: 'give', card, target, claim };
}

function respondNormal(view, rand) {
    const r = view.round;
    const me = view.you;
    const unseen = unseenCounts(view);
    const p = truthChance(view);
    const rest = KIND_ORDER.filter(k => k !== r.claim && unseen[k] > 0);
    const restTotal = sum(rest.map(k => unseen[k]));
    // 言った種類でなかったときの、引き取る痛さの見込み
    const expected = (seat) => (restTotal ? sum(rest.map(k => unseen[k] / restTotal * danger(view, seat, k))) : 0);
    const noise = () => (rand() - 0.5) * 1.5;
    const sayTrue = p * danger(view, r.from, r.claim) - (1 - p) * expected(me) + noise();
    const sayFalse = (1 - p) * expected(r.from) - p * danger(view, me, r.claim) + noise();
    if (view.passTargets.length) {
        // 見てから回せば、自分は引き取らない。回した先の人の痛さの分だけ得とみる
        const all = KIND_ORDER.filter(k => unseen[k] > 0);
        const total = sum(all.map(k => unseen[k]));
        const harm = Math.max(...view.passTargets.map(t => sum(all.map(k => unseen[k] / total * danger(view, t, k)))));
        const peek = harm * 0.4 + 0.5 + noise();
        if (peek > sayTrue && peek > sayFalse) return { type: 'peek' };
    }
    return { type: 'answer', truth: sayTrue >= sayFalse };
}

function passNormal(view, rand) {
    const card = view.round.card;
    let best = null;
    for (const target of view.passTargets) {
        const score = danger(view, target, card) + rand() * 2;
        if (!best || score > best.score) best = { target, score };
    }
    const claim = tellTruth(view, best.target, rand) ? card : lieClaim(view, card, best.target, rand);
    return { type: 'pass', target: best.target, claim };
}

function giveEasy(view, rand) {
    const card = pick(view.players[view.you].hand, rand);
    const target = pick(others(view), rand);
    const claim = rand() < 0.5 ? card : pick(KIND_ORDER.filter(k => k !== card), rand);
    return { type: 'give', card, target, claim };
}

function respondEasy(view, rand) {
    if (!unseenCounts(view)[view.round.claim] && rand() < 0.6) return { type: 'answer', truth: false };
    if (view.passTargets.length && rand() < 0.15) return { type: 'peek' };
    return { type: 'answer', truth: rand() < 0.5 };
}

function passEasy(view, rand) {
    const card = view.round.card;
    const claim = rand() < 0.5 ? card : pick(KIND_ORDER.filter(k => k !== card), rand);
    return { type: 'pass', target: pick(view.passTargets, rand), claim };
}

// ---- 進める ----

// 操作を待っている CPU
export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

export function isCpuTurn(game) {
    return !game.isOver() && nextCpuSeat(game) !== null;
}

// 操作を待っている CPU に1手打たせる。思わぬ選択を求められたら、いちばん単純な手で進める
export function runCpuStep(game, seat = nextCpuSeat(game), level) {
    if (seat === null) return null;
    const view = createGameView(game, seat);
    const command = chooseCommand(view, level ?? game.players[seat].cpuLevel ?? 'normal', cpuRandom(game, seat));
    if (command && game.applyCommand(seat, command)) return command;
    const p = game.players[seat];
    const card = game.round?.card ?? p.hand[0];
    const fallbacks = [
        { type: 'answer', truth: true },
        { type: 'give', card, target: (seat + 1) % game.players.length, claim: card },
        { type: 'pass', target: game.passTargets()[0], claim: card }
    ];
    for (const fallback of fallbacks) {
        if (game.applyCommand(seat, fallback)) return fallback;
    }
    return null;
}
