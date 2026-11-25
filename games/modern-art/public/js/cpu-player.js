/**
 * CPU の手の決め方。ビューだけを見て決める（ほかの人の手札・所持金・握った額は見ない）
 * - ふつう：画家ごとに、この回の順位の見込みから絵1枚の値打ちを見積もる（estimateValues）。
 *           値打ちより安ければ競り、出す人のときは高く売れそうなカードや、自分の買った絵の値を上げるカードを出す。
 *           自分のカードで回が終わるなら、終わらせたときの自分の売り上げと、ほかの人の売り上げを比べて決める
 * - やさしい：値打ちを「これまでの値＋15」と大まかに見て、揺らぎを付けて競る。出すカードはでたらめ
 * 判断にゲームの乱数は使わない（記録の再現がずれるため）。揺らぎは、ビューから作った別の乱数を使う
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { CARDS, ARTISTS, DISTRIBUTION, PLACE_VALUES, END_COUNT } from './cards.js';
import { ranking, paintingValues, addTokens } from './market.js';

export const CPU_LEVELS = ['easy', 'normal'];

const TOTALS = DISTRIBUTION.map(row => row.reduce((a, b) => a + b, 0));
const artistOf = (card) => CARDS[card].artist;

// 操作を待っている CPU の席（入札では、まだ握っていない CPU）
export function nextCpuSeat(game) {
    return game.actors().find(s => game.players[s].isCPU) ?? null;
}
export const isCpuTurn = (game) => nextCpuSeat(game) !== null;

function viewRandom(view) {
    let h = Math.imul(view.commandCount + 1, 2654435761) ^ Math.imul(view.you + 7, 40503) ^ view.round;
    (view.players[view.you].hand ?? []).forEach(c => { h = Math.imul(h ^ c, 16777619); });
    return createRandom(h >>> 0);
}

const cumulative = (view, a) => view.tokens.reduce((sum, row) => sum + row[a], 0);
const wonCount = (p, a) => p.won.filter(c => artistOf(c) === a).length;

/**
 * 画家ごとに、この回の終わりの絵1枚の値打ちの見込み
 * 出た枚数＋自分の手札の一部＋見えていないカードのうちほかの人の手札にありそうな分の一部、で順位を見込み、
 * 3位までに入る見込みの強さで、これまでの値＋順位の値を割り引く
 */
export function estimateValues(view, extra = []) {
    const me = view.players[view.you];
    const counts = [...view.counts];
    extra.forEach(c => { counts[artistOf(c)]++; });
    const mine = ARTISTS.map((_, a) => me.hand.filter(c => artistOf(c) === a && !extra.includes(c)).length);
    const seen = ARTISTS.map((_, a) => view.history.reduce((s, h) => s + h.counts[a], 0) + counts[a] + mine[a]);
    const unseen = ARTISTS.map((_, a) => Math.max(0, TOTALS[a] - seen[a]));
    const unseenTotal = unseen.reduce((a, b) => a + b, 0) || 1;
    const otherHands = view.players.filter(p => p.id !== view.you).reduce((s, p) => s + p.handCount, 0);
    const share = otherHands / unseenTotal;
    const projected = ARTISTS.map((_, a) => (counts[a] >= END_COUNT ? 99 : counts[a] + 0.55 * mine[a] + 0.35 * share * unseen[a]));
    const order = ARTISTS.map((_, a) => a).sort((x, y) => projected[y] - projected[x] || x - y);
    const p3 = projected[order[2]];
    const p4 = projected[order[3]];
    return ARTISTS.map((_, a) => {
        const place = order.indexOf(a);
        const cum = cumulative(view, a);
        if (place < 3) {
            const sure = Math.min(0.97, Math.max(0.5, 0.55 + (projected[a] - p4) / 4));
            return sure * (cum + PLACE_VALUES[place]);
        }
        const chance = Math.min(0.45, Math.max(0.03, 0.45 - (p3 - projected[a]) / 4));
        return chance * (cum + PLACE_VALUES[2]);
    });
}

// 今この回が終わったら（cards を足して）、自分とほかの人の平均がいくら売り上げるか
function endNow(view, cards) {
    const counts = [...view.counts];
    cards.forEach(c => { counts[artistOf(c)]++; });
    const rank = ranking(counts);
    const values = paintingValues(addTokens(view.tokens, view.round, rank), rank);
    const gain = (p) => ARTISTS.reduce((s, _, a) => s + wonCount(p, a) * values[a], 0);
    const others = view.players.filter(p => p.id !== view.you);
    return gain(view.players[view.you]) - others.reduce((s, p) => s + gain(p), 0) / Math.max(1, others.length);
}

const ends = (view, cards) => {
    const counts = [...view.counts];
    return cards.some(c => ++counts[artistOf(c)] >= END_COUNT);
};

// 競りにかかっている絵の、自分にとっての値打ち
function lotWorth(view, values) {
    return view.lot.cards.reduce((s, c) => s + values[artistOf(c)], 0);
}

// ---- ふつう ----

function choosePlay(view) {
    const me = view.players[view.you];
    const base = estimateValues(view);
    let best = null;
    for (const card of me.hand) {
        const a = artistOf(card);
        let score;
        if (ends(view, [card])) {
            score = endNow(view, [card]);
        } else {
            const values = estimateValues(view, [card]);
            const partner = CARDS[card].type === 'double' ? me.hand.find(c => c !== card && artistOf(c) === a && CARDS[c].type !== 'double') : null;
            if (CARDS[card].type === 'double' && partner === undefined) score = 0.25 * values[a];
            else score = 0.65 * values[a] * (partner !== null && partner !== undefined ? 1.8 : 1);
            // 自分が持っている絵の値が上がれば得、ほかの人の絵が上がれば少し損
            const others = view.players.filter(p => p.id !== view.you);
            values.forEach((v, x) => {
                score += wonCount(me, x) * (v - base[x]);
                score -= 0.4 * others.reduce((s, p) => s + wonCount(p, x), 0) / Math.max(1, others.length) * (v - base[x]);
            });
        }
        score -= card * 1e-6;
        if (!best || score > best.score) best = { card, score };
    }
    return { type: 'play', card: best.card };
}

function chooseSecond(view) {
    const me = view.players[view.you];
    const first = view.lot.cards[0];
    const options = me.hand.filter(c => artistOf(c) === artistOf(first) && CARDS[c].type !== 'double');
    if (!options.length) return { type: 'second', card: null };
    const card = options[0];
    if (ends(view, [card])) return endNow(view, [card]) > 0 ? { type: 'second', card } : { type: 'second', card: null };
    const values = estimateValues(view, [card]);
    // 2枚まとめて売れるなら足す（値打ちが小さすぎるときは足さない）
    return { type: 'second', card: values[artistOf(card)] * 2 >= 12 ? card : null };
}

function chooseBid(view, level) {
    const me = view.players[view.you];
    const a = view.auction;
    const values = level === 'easy' ? easyValues(view) : estimateValues(view);
    const worth = lotWorth(view, values);
    const seller = view.lot.seller === view.you;
    const rand = viewRandom(view);
    const noise = level === 'easy' ? 0.6 + rand() * 0.8 : 1;
    const limit = Math.min(me.money, Math.floor(worth * (seller ? 0.55 : 0.8) * noise));
    switch (a.type) {
        case 'sealed': {
            const amount = Math.min(me.money, Math.floor(limit * (seller ? 0.9 : 0.85)));
            return { type: 'bid', amount: Math.max(0, amount) };
        }
        case 'once': {
            if (limit <= a.high) return { type: 'pass' };
            const last = a.order.at(-1) === view.you;
            const amount = last ? a.high + 1 : Math.max(a.high + 1, Math.floor(limit * 0.8));
            return { type: 'bid', amount: Math.min(limit, amount) };
        }
        case 'open': {
            if (limit <= a.high) return { type: 'pass' };
            const step = Math.max(1, Math.round(worth * 0.08));
            return { type: 'bid', amount: Math.min(limit, a.high + step) };
        }
        case 'fixed': {
            if (a.price === null) {
                // 出した人が値を決める。だれも買わなければ自分が買うので、値打ちを超えない
                const price = Math.max(me.money > 0 ? 1 : 0, Math.min(me.money, Math.round(worth * (level === 'easy' ? 0.5 + rand() * 0.6 : 0.75))));
                return { type: 'price', amount: price };
            }
            return a.price <= me.money && a.price <= worth * (level === 'easy' ? noise * 0.8 : 0.85) ? { type: 'buy' } : { type: 'pass' };
        }
        default: return { type: 'pass' };
    }
}

// ---- やさしい ----

function easyValues(view) {
    return ARTISTS.map((_, a) => cumulative(view, a) + 15);
}

function chooseEasy(view) {
    const rand = viewRandom(view);
    const me = view.players[view.you];
    if (view.phase === 'play') return { type: 'play', card: me.hand[Math.floor(rand() * me.hand.length)] };
    if (view.phase === 'double') {
        const first = view.lot.cards[0];
        const card = me.hand.find(c => artistOf(c) === artistOf(first) && CARDS[c].type !== 'double');
        return { type: 'second', card: card !== undefined && rand() < 0.6 ? card : null };
    }
    return chooseBid(view, 'easy');
}

/**
 * ビューから次の1手を決める
 */
export function chooseCommand(view, level = 'normal') {
    if (view.phase === 'end' || !view.actors.includes(view.you)) return null;
    if (level === 'easy') return chooseEasy(view);
    if (view.phase === 'play') return choosePlay(view);
    if (view.phase === 'double') return chooseSecond(view);
    return chooseBid(view, 'normal');
}

// いちばん単純な手（決めた手が通らなかったときの逃げ道）
function fallbacks(game, seat) {
    const p = game.players[seat];
    const a = game.auction;
    if (game.phase === 'play') return [{ type: 'play', card: p.hand[0] }];
    if (game.phase === 'double') return [{ type: 'second', card: null }];
    if (a?.type === 'fixed' && a.price === null) return [{ type: 'price', amount: p.money > 0 ? 1 : 0 }];
    return [{ type: 'pass' }];
}

/**
 * CPU の番なら1手打つ。打てたら true
 */
export function runCpuStep(game) {
    const seat = nextCpuSeat(game);
    if (seat === null) return false;
    const player = game.players[seat];
    let command = null;
    try {
        command = chooseCommand(createGameView(game, seat, { events: false }), player.cpuLevel ?? 'normal');
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    return fallbacks(game, seat).some(c => game.applyCommand(seat, c));
}
