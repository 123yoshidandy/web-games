/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（ほかの人の手札や、ほかの人が選んだ渡す札はのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 渡す：守りの薄いスペードのクイーンと A・K、高いハート、短いスートの高い札（早く切らすため）を選ぶ
 * - 出す：
 *   - 始める：クイーンを持っていなければ、低いスペードでクイーンをあぶり出す。それ以外は一番低い札
 *   - ついていけるとき：今の勝ち札より下の一番高い札で逃げる。逃げられないときは、最後なら一番高い札、途中なら一番低い札
 *   - ついていけないとき：クイーン → スペードの A・K → 高いハート → 高い札、の順に捨てる
 * - easy（やさしい）は、半分くらいでたらめに出し、渡す札の選び方も大まか
 * - normal（ふつう）は、上の決め方に、ときどきの誤りを混ぜる（強すぎないように）
 * - strong（強さを測る比較用）は、誤りがない
 */

import { QUEEN, suitOf, rankOf, isPoint } from './game.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

export const PROFILES = {
    easy: { passNoise: 8, careful: false, blunder: 0.45 },
    normal: { passNoise: 2.5, careful: true, blunder: 0.1 },
    strong: { passNoise: 0, careful: true, blunder: 0 },
    random: { random: true } // でたらめに選ぶ（強さを測る比較用）
};

// 画面で選ぶ強さ
export const LEVELS = { easy: 'やさしい', normal: 'ふつう' };

// 今操作が必要な CPU の席
export const cpuActors = (game) => game.actors().filter(seat => game.players[seat].isCPU);

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

export function chooseCpuCommand(game, seat, profile = PROFILES.normal) {
    const view = createGameView(game, seat, { since: game.logs.length, events: false });
    const random = cpuRandom(game, seat);
    if (view.phase === 'pass') return { type: 'pass', cards: decidePass(view.hand, random, profile) };
    return { type: 'play', card: decidePlay(view, random, profile) };
}

// seat の CPU に1手打たせる。決めた手が断られたら、いちばん単純な手を試す（必ず前に進める）
export function runCpuStep(game, seat, profile) {
    if (!game.actors().includes(seat)) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    if (game.phase === 'pass') return game.applyCommand(seat, { type: 'pass', cards: game.players[seat].hand.slice(-3) });
    return game.applyCommand(seat, { type: 'play', card: game.legalFor(seat)[0] });
}

// ---- 渡す ----

// 渡したい度合い（大きいほど渡したい）
export function passDanger(hand, card, careful = true) {
    const suit = suitOf(card);
    const rank = rankOf(card);
    const lowSpades = hand.filter(c => suitOf(c) === 'S' && rankOf(c) < 12).length;
    if (card === QUEEN) return careful && lowSpades >= 3 ? 1 : 30;
    if (suit === 'S' && rank > 12) return careful && lowSpades >= 3 ? 2 : 20;
    if (suit === 'H') return rank >= 10 ? rank - 3 : rank * 0.2;
    if (card === '2C') return -5;
    const length = hand.filter(c => suitOf(c) === suit).length;
    return Math.max(0, rank - 7) + (careful && length <= 3 && rank >= 8 ? 3 : 0);
}

export function decidePass(hand, random, profile = PROFILES.normal) {
    if (profile.random) return [...hand].sort(() => random() - 0.5).slice(0, 3);
    return hand.map(card => ({ card, value: passDanger(hand, card, profile.careful) + (random() * 2 - 1) * profile.passNoise }))
        .sort((a, b) => b.value - a.value).slice(0, 3).map(x => x.card);
}

// ---- 出す ----

const lowest = (cards) => cards.reduce((a, b) => (rankOf(b) < rankOf(a) ? b : a));
const highest = (cards) => cards.reduce((a, b) => (rankOf(b) > rankOf(a) ? b : a));

export function decidePlay(view, random, profile = PROFILES.normal) {
    const legal = view.legal;
    if (legal.length === 1) return legal[0];
    if (profile.random || random() < profile.blunder) return legal[Math.floor(random() * legal.length)];
    const queenOut = !view.played.includes(QUEEN) && !view.hand.includes(QUEEN);
    const trick = view.trick;

    // 始める
    if (trick.length === 0) {
        const safe = legal.filter(c => !isPoint(c) && !(queenOut && suitOf(c) === 'S' && rankOf(c) > 12));
        const lowSpades = safe.filter(c => suitOf(c) === 'S' && rankOf(c) < 12);
        if (profile.careful && queenOut && lowSpades.length > 0) return lowest(lowSpades);
        return lowest(safe.length > 0 ? safe : legal);
    }

    const suit = suitOf(trick[0].card);
    // ついていけるとき
    if (suitOf(legal[0]) === suit) {
        const top = Math.max(...trick.filter(t => suitOf(t.card) === suit).map(t => rankOf(t.card)));
        const under = legal.filter(c => rankOf(c) < top);
        if (under.length > 0) return under.includes(QUEEN) ? QUEEN : highest(under);
        const last = trick.length === 3;
        const noQueen = legal.filter(c => c !== QUEEN);
        const pool = noQueen.length > 0 ? noQueen : legal;
        // 最後で失点がないなら、高い札を安全に処分する。途中なら一番低い札
        const points = trick.some(t => isPoint(t.card));
        return last && !points ? highest(pool) : lowest(pool);
    }

    // ついていけないとき：危ない札から捨てる
    if (legal.includes(QUEEN)) return QUEEN;
    const bigSpades = legal.filter(c => suitOf(c) === 'S' && rankOf(c) > 12);
    if (profile.careful && queenOut && bigSpades.length > 0) return highest(bigSpades);
    const hearts = legal.filter(c => suitOf(c) === 'H');
    if (hearts.length > 0) return highest(hearts);
    return highest(legal);
}

// ヒント：人が操作する番（渡す札・出す札）に、CPU（揺れのない設定）が選ぶ手を返す。その席から見える情報だけで決める
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (game.isOver() || !game.actors().includes(seat)) return null;
    return chooseCpuCommand(game, seat, PROFILES.strong);
}
