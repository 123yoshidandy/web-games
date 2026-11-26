/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（相手の手札・山札の並び・ボーナスの値はのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 方針：手札とラクダの見込みの価値を点数で見積もり、売る・1枚取る・ラクダを取る・交換のそれぞれで、
 *   もらう点数＋見込みの増えた分−相手に渡る分がいちばん大きい操作を選ぶ
 * - normal（画面の CPU）は、評価に揺れがあり、ときどき2番目の手を選ぶ（強すぎないように）
 */

import { GOODS, CAMEL, PRECIOUS, HAND_LIMIT, countOf } from './game.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

export const PROFILES = {
    normal: { noise: 0.35, secondBest: 0.25 },
    strong: { noise: 0.03, secondBest: 0 },
    random: { random: true } // 通る手からでたらめに選ぶ（強さを測る比較用）
};

const BONUS_EXPECTED = { 3: 2, 4: 5, 5: 9 };
const HOLD_RATE = 0.8;        // 手札の商品は、売るまでにトークンが減るかもしれないので割り引く
const REVEAL_COST = 0.35;     // 山札から市場に出るカード1枚が、相手に役立つ見込み
const GIFT_RATE = 0.45;       // 市場に返した商品が、相手に役立つ見込み

const sum = (list) => list.reduce((s, v) => s + v, 0);
const bonusExpected = (n) => (n >= 5 ? BONUS_EXPECTED[5] : BONUS_EXPECTED[n] ?? 0);

export const isCpuTurn = (game) => game.phase === 'play' && game.players[game.current].isCPU;

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

export function chooseCpuCommand(game, seat = game.current, profile = PROFILES.normal) {
    const view = createGameView(game, seat, { since: game.logs.length, events: false });
    const random = cpuRandom(game, seat);
    const candidates = candidateActions(view, seat);
    if (profile.random) return candidates[Math.floor(random() * candidates.length)].command;
    candidates.forEach(c => { c.score *= 1 + (random() * 2 - 1) * profile.noise; });
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 1 && random() < profile.secondBest) return candidates[1].command;
    return candidates[0].command;
}

// CPU に1手打たせる。決めた手が断られたら、いちばん単純な手を順に試す（必ず前に進める）
export function runCpuStep(game, seat = game.current, profile) {
    if (game.phase !== 'play' || seat !== game.current) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    const hand = game.players[seat].hand;
    const fallbacks = [
        ...GOODS.map(good => ({ type: 'sell', good, count: countOf(hand, good) })),
        { type: 'camels' },
        ...game.market.map((_, index) => ({ type: 'take', index }))
    ];
    return fallbacks.some(c => game.applyCommand(seat, c));
}

// ---- 評価 ----

// 1種類の商品を c 枚持っているときの見込みの点数
function holdValue(view, good, c) {
    if (c === 0) return 0;
    const tokens = view.goodsTokens[good];
    if (PRECIOUS.includes(good) && c < 2) return (tokens[0] ?? 0) * 0.45; // もう1枚そろうまで売れない
    return sum(tokens.slice(0, c)) * HOLD_RATE + bonusExpected(c) * 0.8;
}

// ラクダの見込みの点数（交換に使える・ラウンドの終わりの5点）
function herdValue(view, seat, herd) {
    const rival = view.players[1 - seat].herd;
    return Math.min(herd, 5) * 0.55 + (herd > rival ? 2 : herd === rival ? 0.8 : 0);
}

function handValue(view, seat, hand, herd) {
    return sum(GOODS.map(g => holdValue(view, g, countOf(hand, g)))) + herdValue(view, seat, herd);
}

// 通る操作を列挙して、評価を付ける
export function candidateActions(view, seat) {
    const me = view.players[seat];
    const hand = me.hand;
    const base = handValue(view, seat, hand, me.herd);
    const list = [];
    const market = view.market;

    // 売る（その種類を全部）
    GOODS.forEach(good => {
        const n = countOf(hand, good);
        if (n === 0 || (PRECIOUS.includes(good) && n < 2)) return;
        const gain = sum(view.goodsTokens[good].slice(0, n)) + (view.bonusCounts[n >= 5 ? 5 : n] > 0 ? bonusExpected(n) : 0);
        const after = hand.filter(c => c !== good);
        list.push({ command: { type: 'sell', good, count: n }, score: gain + handValue(view, seat, after, me.herd) - base });
    });

    // 1枚取る
    if (hand.length < HAND_LIMIT) {
        market.forEach((card, index) => {
            if (card === CAMEL || card === null) return;
            const after = [...hand, card];
            list.push({ command: { type: 'take', index }, score: handValue(view, seat, after, me.herd) - base - REVEAL_COST });
        });
    }

    // ラクダを全部取る
    const camels = market.filter(c => c === CAMEL).length;
    if (camels > 0) {
        list.push({ command: { type: 'camels' }, score: herdValue(view, seat, me.herd + camels) - herdValue(view, seat, me.herd) - REVEAL_COST * camels });
    }

    // 交換：市場の商品の組み合わせ（2枚以上）ごとに、手放して惜しくない順に返す
    const goodsIndices = market.map((c, i) => (c !== CAMEL && c !== null ? i : -1)).filter(i => i >= 0);
    subsets(goodsIndices).filter(s => s.length >= 2).forEach(take => {
        const takenTypes = new Set(take.map(i => market[i]));
        const gained = [...hand, ...take.map(i => market[i])];
        // 返せるもの：ラクダと、取った種類以外の手札
        const pool = [...Array(me.herd).fill(CAMEL), ...hand.filter(c => !takenTypes.has(c))];
        if (pool.length < take.length) return;
        // 1枚ずつ、返したときに見込みがいちばん減らないものを選ぶ
        let keepHand = [...gained];
        let keepHerd = me.herd;
        const give = {};
        for (let k = 0; k < take.length; k++) {
            let best = null;
            for (const type of new Set(pool)) {
                if (type === CAMEL ? keepHerd === 0 : !keepHand.includes(type) || takenTypes.has(type)) continue;
                const nextHand = type === CAMEL ? keepHand : removeOne(keepHand, type);
                const nextHerd = type === CAMEL ? keepHerd - 1 : keepHerd;
                const value = handValue(view, seat, nextHand, nextHerd) - (type === CAMEL ? 0 : (view.goodsTokens[type][0] ?? 0) * GIFT_RATE);
                if (!best || value > best.value) best = { type, value, nextHand, nextHerd };
            }
            if (!best) return;
            keepHand = best.nextHand;
            keepHerd = best.nextHerd;
            give[best.type] = (give[best.type] ?? 0) + 1;
        }
        if (keepHand.length > HAND_LIMIT) return;
        const gift = sum(Object.entries(give).filter(([t]) => t !== CAMEL).map(([t, n]) => (view.goodsTokens[t][0] ?? 0) * GIFT_RATE * n));
        list.push({ command: { type: 'exchange', take, give }, score: handValue(view, seat, keepHand, keepHerd) - base - gift });
    });
    return list;
}

function removeOne(cards, type) {
    const copy = [...cards];
    copy.splice(copy.indexOf(type), 1);
    return copy;
}

function subsets(items) {
    const result = [[]];
    items.forEach(item => result.slice().forEach(s => result.push([...s, item])));
    return result;
}

// ヒント：人の番に、CPU（揺れのほとんどない強さ）が選ぶ手を返す。見るのはその席のビューだけ
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (!(game.phase === 'play' && game.current === seat)) return null;
    return chooseCpuCommand(game, seat, PROFILES.strong);
}
