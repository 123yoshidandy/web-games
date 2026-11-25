/**
 * CPU：自分のビュー（自分に見える情報）だけで判断する。ほかの人の手札や山札の並びはのぞかない
 *
 * 推理：見えていないカード（全 21 枚 − 自分の手札 − 全員の捨て札 − 表の除外 − 知っている相手の手札）から、
 * 知らない相手の手札を確率で推定する。大臣を出した直後の人は、将軍か魔術師を持っている見込みを上げる
 * 手の評価：脱落させる見込み・自分が脱落する見込み・残す手札の強さ（山札が減るほど重い）を足し合わせる
 *
 * 強すぎないように、人間らしい見落としを入れる（LEVELS）
 *   noise   評価に足すゆらぎ
 *   forget  相手の手札を知っていても、忘れて推理する割合
 */

import { createRandom } from './random.js';
import { CARDS, GUARD, PRIEST, BARON, HANDMAID, PRINCE, CHANCELLOR, KING, COUNTESS, PRINCESS, SPY } from './cards.js';
import { createGameView } from './game-view.js';

export const LEVELS = {
    easy: { noise: 0.45, forget: 0.5 },
    normal: { noise: 0.18, forget: 0.15 },
    // 強さを測るための、見落としのない CPU（画面では使わない）
    strong: { noise: 0, forget: 0 },
    // 比べるための、でたらめに打つ CPU（画面では使わない）
    random: { noise: 100, forget: 1 }
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// CPU の判断に使う乱数（ゲームの乱数とは別。同じ見え方なら同じ手になる）
function viewRandom(view) {
    const seed = (Math.imul(view.eventSeq + 1, 2654435761) ^ Math.imul(view.seat + 1, 40503) ^ Math.imul(view.round, 97)) >>> 0;
    return createRandom(seed);
}

// 見えていないカードの枚数（値ごと）
export function unseenCounts(view) {
    const counts = CARDS.map(c => c.count);
    const take = v => { counts[v] = Math.max(0, counts[v] - 1); };
    view.hand.forEach(take);
    view.faceUp.forEach(take);
    view.players.forEach(p => {
        p.discards.forEach(take);
        if (p.known !== null && !p.out) take(p.known);
    });
    return counts;
}

// 相手 p の手札の確率（値ごと）
export function handDistribution(view, p, counts = unseenCounts(view), forgetKnown = false) {
    if (p.known !== null && !forgetKnown) return CARDS.map(c => (c.value === p.known ? 1 : 0));
    const weights = [...counts];
    if (forgetKnown && p.known !== null) weights[p.known]++;
    // 大臣を出した直後なら、将軍か魔術師を持っていそう（大臣は出さなければならないことがある）
    if (p.discards.at(-1) === COUNTESS) {
        weights[KING] *= 3;
        weights[PRINCE] *= 3;
    }
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    return weights.map(w => w / total);
}

// 残す手札の強さ（ラウンドの終わりに大きいほど勝つ。山札が減るほど重い）
function keepValue(card, view, exposed) {
    const endWeight = clamp(1 - view.deckCount / 12, 0, 1);
    let value = (card / 9) * (0.35 + endWeight);
    // 自分の手札を知られていると、兵士で当てられやすい
    if (exposed) value -= 0.45;
    return value;
}

/**
 * 出し方の候補と評価を全部返す（テストと強さの測定に使う）
 * 戻り値：[{ command, value }]
 */
export function scoreCandidates(view, cfg = LEVELS.normal, random = viewRandom(view)) {
    const me = view.seat;
    const counts = unseenCounts(view);
    const alive = view.players.filter(p => !p.out);
    const eliminateValue = alive.length === 2 ? 1.6 : 1.0; // 2 人なら脱落させればラウンドの勝ち
    const dists = Object.fromEntries(view.players.map(p => [p.id, handDistribution(view, p, counts, random() < cfg.forget)]));
    // 道化などで見られたのは、前から持っている方（手札の先頭）
    const exposedOld = view.exposedTo.length > 0;
    const candidates = [];
    const push = (command, value) => candidates.push({ command, value: value + (random() * 2 - 1) * cfg.noise });

    view.legal.forEach(({ card, targets }) => {
        const rest = [...view.hand];
        rest.splice(rest.indexOf(card), 1);
        const remaining = rest[0];
        const keepsOld = view.hand.indexOf(remaining) === 0;
        const keep = keepValue(remaining, view, exposedOld && keepsOld);
        const base = { type: 'play', card, target: null, guess: null };
        if (targets.length === 0) {
            const bonus = { [PRINCESS]: -10, [HANDMAID]: 0.25 + (exposedOld ? 0.3 : 0), [CHANCELLOR]: 0.2, [SPY]: spyValue(view) }[card] ?? 0;
            push(base, keep + bonus);
            return;
        }
        targets.forEach(target => {
            const d = dists[target];
            if (card === GUARD) {
                // 兵士以外で、一番ありそうな値を言う
                let guess = 0;
                for (let v = 0; v < d.length; v++) if (v !== GUARD && d[v] > d[guess]) guess = v;
                push({ ...base, target, guess }, keep + d[guess] * eliminateValue);
            } else if (card === PRIEST) {
                push({ ...base, target }, keep + (view.players[target].known === null ? 0.22 : 0));
            } else if (card === BARON) {
                const win = d.reduce((s, p, v) => s + (v < remaining ? p : 0), 0);
                const lose = d.reduce((s, p, v) => s + (v > remaining ? p : 0), 0);
                push({ ...base, target }, keep + win * eliminateValue - lose * 1.3);
            } else if (card === PRINCE) {
                if (target === me) {
                    // 自分を選ぶと、残した手札を捨てて引き直す
                    if (remaining === PRINCESS) push({ ...base, target }, -10);
                    else push({ ...base, target }, expectedDrawValue(counts, view) - 0.05);
                } else {
                    push({ ...base, target }, keep + d[PRINCESS] * eliminateValue + 0.05);
                }
            } else if (card === KING) {
                const expected = d.reduce((s, p, v) => s + p * v, 0);
                push({ ...base, target }, keepValue(expected, view, true) - 0.1);
            }
        });
    });
    // 宰相・大臣・僧侶・スパイは、上の「選べる人がいない」形で入る
    return candidates;
}

function spyValue(view) {
    const others = view.players.filter(p => !p.out && p.id !== view.seat && p.discards.includes(SPY));
    const mine = view.players[view.seat].discards.includes(SPY);
    return others.length === 0 && !mine ? 0.35 : 0.05;
}

function expectedDrawValue(counts, view) {
    const total = counts.reduce((a, b) => a + b, 0) || 1;
    return counts.reduce((s, n, v) => s + (n / total) * (v === PRINCESS ? -1 : keepValue(v, view, false)), 0);
}

// 宰相で残すカード（一番強いもの）と、戻す順（ゆらぎで決める）
export function chooseKeep(view, cfg = LEVELS.normal, random = viewRandom(view)) {
    let best = null;
    view.hand.forEach(card => {
        const value = keepValue(card, view, false) + (random() * 2 - 1) * cfg.noise;
        if (!best || value > best.value) best = { card, value };
    });
    const bottom = [...view.hand];
    bottom.splice(bottom.indexOf(best.card), 1);
    if (random() < 0.5) bottom.reverse();
    return { type: 'keep', card: best.card, bottom };
}

export function chooseCommand(view, cfg = LEVELS.normal) {
    if (view.phase === 'chancellor') return chooseKeep(view, cfg);
    let best = null;
    scoreCandidates(view, cfg).forEach(c => { if (!best || c.value > best.value) best = c; });
    return best?.command ?? null;
}

// CPU の番なら 1 手打つ。打てたら true（CPU には自分のビューだけを渡す）
export function runCpuStep(game, levelOf = () => 'normal') {
    if (game.isOver()) return false;
    const seat = game.current;
    if (!game.players[seat].isCPU) return false;
    const view = createGameView(game, seat);
    const command = chooseCommand(view, LEVELS[levelOf(seat)] ?? LEVELS.normal);
    if (command && game.applyCommand(seat, command)) return true;
    // 想定外の断りでも止めない：一番単純な手を順に試す
    if (game.phase === 'chancellor') {
        const [card, ...bottom] = view.hand;
        return game.applyCommand(seat, { type: 'keep', card, bottom });
    }
    return (view.legal ?? []).some(l => game.applyCommand(seat, { type: 'play', card: l.card, target: l.targets[0] ?? null, guess: l.needsGuess ? 2 : null }));
}

export const isCpuTurn = game => !game.isOver() && game.players[game.current].isCPU;
