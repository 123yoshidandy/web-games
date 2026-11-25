/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（相手の手札・山札の並びはのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 方針
 *   - 出す：始めた色には、間を飛ばさない小さいカードを優先して置く。新しい色は、手札とこれから引く見込みで20点を十分超えるときだけ始める
 *   - 捨てる：自分に要らず、相手の探検に役立たないカード
 *   - 引く：捨て場の一番上が自分の探検にすぐ役立つなら取る。そうでなければ山札
 * - normal（画面の CPU）は、評価に揺れがあり、ときどき2番目の手を選ぶ（強すぎないように）
 */

import { CARDS, COLORS, canPlace } from './game.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

export const PROFILES = {
    normal: { noise: 0.35, secondBest: 0.2 },
    strong: { noise: 0.03, secondBest: 0 },
    random: { random: true } // 通る手からでたらめに選ぶ（強さを測る比較用）
};

const START_LINE = 24;          // 新しい色を始める見込みの点数（数字の合計）
const WAGER_LINE = 30;          // 握手を置く見込みの点数
const DRAW_PER_TURN = 0.9;      // 残りの手番1回あたりに、その色で増える見込みの数字（大まかな値）

export const isCpuTurn = (game) => game.phase !== 'end' && game.players[game.current].isCPU;

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

export function chooseCpuCommand(game, seat = game.current, profile = PROFILES.normal) {
    const view = createGameView(game, seat, { since: game.logs.length, events: false });
    const random = cpuRandom(game, seat);
    const candidates = view.phase === 'draw' ? drawCandidates(view, seat) : playCandidates(view, seat);
    if (profile.random) return candidates[Math.floor(random() * candidates.length)].command;
    candidates.forEach(c => { c.score += Math.abs(c.score + 1) * (random() * 2 - 1) * profile.noise; });
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 1 && random() < profile.secondBest) return candidates[1].command;
    return candidates[0].command;
}

// CPU に1手打たせる。決めた手が断られたら、いちばん単純な手を試す（必ず前に進める）
export function runCpuStep(game, seat = game.current, profile) {
    if (game.phase === 'end' || seat !== game.current) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    if (game.phase === 'draw') return game.applyCommand(seat, { type: 'draw', from: 'deck' }) || COLORS.some(from => game.applyCommand(seat, { type: 'draw', from }));
    return game.players[seat].hand.some(card => game.applyCommand(seat, { type: 'play', card, to: 'discard' }));
}

// ---- 評価 ----

const lastValue = (expedition) => (expedition.length ? CARDS[expedition.at(-1)].value : 0);
const numbersOf = (cards, color) => cards.filter(id => CARDS[id].color === color && CARDS[id].value > 0).map(id => CARDS[id].value);

// その色の見込み（始めている、または始める値打ちがあるか）
function plan(view, me, color) {
    const expedition = me.expeditions[color];
    const turnsLeft = Math.ceil(view.deckCount / 2);
    const last = lastValue(expedition);
    const played = expedition.reduce((s, id) => s + CARDS[id].value, 0);
    const inHand = numbersOf(me.hand, color).filter(v => v > last);
    const projected = played + inHand.reduce((s, v) => s + v, 0) + Math.min(turnsLeft, 6) * DRAW_PER_TURN;
    return { started: expedition.length > 0, last, projected, inHand, turnsLeft };
}

// 相手の探検に、そのカードが役立つか
function giftTo(view, seat, id) {
    const rival = view.players[1 - seat];
    const { color, value } = CARDS[id];
    const expedition = rival.expeditions[color];
    if (expedition.length === 0) return value === 0 ? 0.5 : value >= 6 ? value * 0.15 : 0;
    return canPlace(expedition, id) ? (value === 0 ? 1 : value * 0.8) : 0;
}

function playCandidates(view, seat) {
    const me = view.players[seat];
    const list = [];
    me.hand.forEach(id => {
        const { color, value } = CARDS[id];
        const p = plan(view, me, color);
        // 探検に出す
        if (canPlace(me.expeditions[color], id)) {
            let score;
            if (value === 0) {
                // 握手は、まだ数字を置いていない色に、見込みが高いときだけ
                score = p.projected >= WAGER_LINE && p.turnsLeft >= 6 ? 2 + (p.projected - WAGER_LINE) * 0.3 : -8;
            } else {
                // 手札にある、飛ばしてしまう数字は大きく損。手札にない間の数字は少し損
                const skipped = p.inHand.filter(v => v < value);
                const gap = value - Math.max(p.last, 1) - 1 - skipped.length;
                const loss = skipped.reduce((s, v) => s + v, 0) * 1.2 + gap * 0.5;
                if (p.started) score = 5 - loss;
                else score = p.projected >= START_LINE ? 3 + (p.projected - START_LINE) * 0.25 - loss : -6 - (START_LINE - p.projected) * 0.3;
            }
            list.push({ command: { type: 'play', card: id, to: 'expedition' }, score });
        }
        // 捨てる：自分に要るカードほど、相手に役立つカードほど損
        const useful = canPlace(me.expeditions[color], id) && (p.started || p.projected >= START_LINE - 4);
        const keep = useful ? (value === 0 ? 3 : 1 + value * 0.4) : 0;
        list.push({ command: { type: 'play', card: id, to: 'discard' }, score: -1 - keep - giftTo(view, seat, id) });
    });
    return list;
}

function drawCandidates(view, seat) {
    const me = view.players[seat];
    const list = view.deckCount > 0 ? [{ command: { type: 'draw', from: 'deck' }, score: 0 }] : [];
    COLORS.forEach(color => {
        const pile = view.discards[color];
        const top = pile.at(-1);
        if (top === undefined || top === view.justDiscarded) return;
        const { value } = CARDS[top];
        const p = plan(view, me, color);
        let score = -0.5;
        if (canPlace(me.expeditions[color], top)) {
            if (p.started && value > 0) score = 1.5 + value * 0.25 - Math.max(0, value - p.last - 3) * 0.3;
            else if (!p.started && p.projected + value >= START_LINE) score = 0.5 + value * 0.15;
        }
        // 相手が欲しがるカードを取っておく
        score += giftTo(view, seat, top) * 0.15;
        list.push({ command: { type: 'draw', from: color }, score });
    });
    return list;
}
