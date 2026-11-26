/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（相手の手札・秘密・放棄・山札・除いた1枚はのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 相手の手札の推測：見えていないカードを芸者ごとに数え（全体 − 自分の手札・秘密・放棄 − 両者の置いたカード）、
 *   相手がこれから自分の側に置く枚数を、その割合で見込む
 * - 評価：芸者ごとに、置いた枚数と見込みの差から好意を得る確率を出し、点数・人数と、11点・4人に届く見込みを点数にする
 * - 贈り物・競争は、相手が自分にいちばん不利なものを選ぶとみなして評価する。選ぶ側に回ったら、いちばん有利なものを選ぶ
 * - easy（やさしい）・normal（ふつう）は、評価に揺れがあり、ときどき2番目以下の手を選ぶ（強すぎないように）
 */

import { GEISHA, ACTIONS, ACTION_SIZES, countOf } from './game.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

export const PROFILES = {
    easy: { noise: 2.6, mistake: 0.3 },
    normal: { noise: 0.9, mistake: 0.1 },
    strong: { noise: 0, mistake: 0 },   // 揺れのない比較用
    random: { random: true }            // 通る手からでたらめに選ぶ（強さを測る比較用）
};
export const LEVELS = ['easy', 'normal'];
export const LEVEL_NAMES = { easy: 'やさしい', normal: 'ふつう' };

const KEEP = { secret: 1, discard: 0, gift: 2, compete: 2 };  // 行動で自分の側に残る枚数
const GIVE = { secret: 0, discard: 0, gift: 1, compete: 2 };  // 行動で相手の側に渡る枚数
const TIE_BIAS = 0.5;  // 同数なら好意の印は動かないので、印を持っている方に寄せる

const sum = (list) => list.reduce((s, v) => s + v, 0);
const sigmoid = (x) => 1 / (1 + Math.exp(-x));

export const isCpuTurn = (game) => {
    const actor = game.actor();
    return actor !== null && game.players[actor].isCPU;
};

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// ---- 見込み ----

// ビューから、評価に使う形を作る
export function readState(view, seat) {
    const me = view.players[seat];
    const opp = view.players[1 - seat];
    const hand = GEISHA.map((_, g) => countOf(me.hand, g));
    const myPlaced = me.placed.map((n, g) => n + (me.secret === g ? 1 : 0));
    const offered = view.pending ? (view.pending.cards ?? view.pending.groups.flat()) : [];
    const unknown = GEISHA.map((geisha, g) => geisha.value - hand[g] - myPlaced[g] - countOf(me.discards ?? [], g)
        - opp.placed[g] - countOf(offered, g));
    return {
        seat,
        favor: view.favor,
        hand,
        myPlaced,
        oppPlaced: [...opp.placed],
        myLeft: ACTIONS.filter(a => !me.used.includes(a)),
        oppLeft: ACTIONS.filter(a => !opp.used.includes(a)),
        oppSecretHidden: opp.secretUsed,
        unknown
    };
}

// 自分から見た良さ（大きいほど良い）
export function evaluate(state) {
    const { hand, myPlaced, oppPlaced, myLeft, oppLeft, unknown, favor, seat } = state;
    const unknownTotal = Math.max(1, sum(unknown));
    const handTotal = sum(hand);
    // 自分：手札とこれから引くカードのうち、行動で自分の側・相手の側に置く割合
    const myHandle = handTotal + myLeft.length;
    const myKeep = myHandle ? sum(myLeft.map(a => KEEP[a])) / myHandle : 0;
    const myGive = myHandle ? sum(myLeft.map(a => GIVE[a])) / myHandle : 0;
    // 相手：見えていないカードから、これから相手の側に置く枚数（伏せた秘密も含む）と、こちらに渡す枚数
    const oppKeep = sum(oppLeft.map(a => KEEP[a])) + (state.oppSecretHidden ? 1 : 0);
    const oppGive = sum(oppLeft.map(a => GIVE[a]));
    const left = myLeft.length + oppLeft.length;
    const sharpness = 2.4 / (1 + 0.3 * left);

    let myPoints = 0, oppPoints = 0, myCount = 0, oppCount = 0;
    GEISHA.forEach((geisha, g) => {
        const share = unknown[g] / unknownTotal;
        const mine = hand[g] + share * myLeft.length;
        const expectMe = myPlaced[g] + mine * myKeep + share * oppGive * 0.8;
        const expectOpp = oppPlaced[g] + mine * myGive + share * oppKeep;
        const bias = favor[g] === seat ? TIE_BIAS : favor[g] === 1 - seat ? -TIE_BIAS : 0;
        const p = sigmoid(sharpness * (expectMe - expectOpp + bias) * 1.6);
        myPoints += p * geisha.value;
        oppPoints += (1 - p) * geisha.value;
        myCount += p;
        oppCount += 1 - p;
    });
    const reach = (points, count) => 6 * sigmoid((points - 10.5) * 0.9) + 5 * sigmoid((count - 3.5) * 1.8);
    return (myPoints - oppPoints) + (myCount - oppCount) + reach(myPoints, myCount) - reach(oppPoints, oppCount);
}

const clone = (state) => ({ ...state, hand: [...state.hand], myPlaced: [...state.myPlaced], oppPlaced: [...state.oppPlaced], myLeft: [...state.myLeft] });

function afterUse(state, action, cards) {
    const next = clone(state);
    cards.forEach(c => { next.hand[c]--; });
    next.myLeft = next.myLeft.filter(a => a !== action);
    return next;
}

// 贈り物・競争を出したあと、相手が option を選んだとき
function afterOffer(state, action, cards, options, index) {
    const next = afterUse(state, action, cards);
    options.forEach((option, i) => option.forEach(c => { (i === index ? next.oppPlaced : next.myPlaced)[c]++; }));
    return next;
}

// 相手は自分にいちばん不利なものを選ぶとみなす（相手も読み違えるので、平均も少し混ぜる）
function offerScore(state, action, cards, options) {
    const scores = options.map((_, i) => evaluate(afterOffer(state, action, cards, options, i)));
    return Math.min(...scores) * 0.8 + sum(scores) / scores.length * 0.2;
}

// ---- 手の候補 ----

// 手札から k 枚の選び方（同じ組み合わせは1つにまとめる）
function combos(hand, k) {
    const cards = [];
    hand.forEach((n, g) => { for (let i = 0; i < n; i++) cards.push(g); });
    const out = new Map();
    const rec = (start, chosen) => {
        if (chosen.length === k) { out.set(chosen.join(','), [...chosen]); return; }
        for (let i = start; i < cards.length; i++) rec(i + 1, [...chosen, cards[i]]);
    };
    rec(0, []);
    return [...out.values()];
}

function splits([a, b, c, d]) {
    const seen = new Set();
    return [[[a, b], [c, d]], [[a, c], [b, d]], [[a, d], [b, c]]].filter(groups => {
        const key = groups.map(g => g.join(',')).sort().join('|');
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

// 通る手を並べ、評価を付ける
export function candidateActions(view, seat) {
    const state = readState(view, seat);
    if (view.phase === 'choose') {
        const offer = view.pending;
        const options = offer.type === 'gift' ? offer.cards.map(c => [c]) : offer.groups;
        return options.map((option, index) => {
            const next = clone(state);
            option.forEach(c => { next.myPlaced[c]++; });
            options.forEach((other, i) => { if (i !== index) other.forEach(c => { next.oppPlaced[c]++; }); });
            return { command: { type: 'pick', index }, score: evaluate(next) };
        });
    }
    const list = [];
    state.myLeft.forEach(action => {
        if (sum(state.hand) < ACTION_SIZES[action]) return;
        combos(state.hand, ACTION_SIZES[action]).forEach(cards => {
            if (action === 'secret') {
                const next = afterUse(state, action, cards);
                next.myPlaced[cards[0]]++;
                list.push({ command: { type: 'secret', card: cards[0] }, score: evaluate(next) });
            } else if (action === 'discard') {
                list.push({ command: { type: 'discard', cards }, score: evaluate(afterUse(state, action, cards)) });
            } else if (action === 'gift') {
                list.push({ command: { type: 'gift', cards }, score: offerScore(state, action, cards, cards.map(c => [c])) });
            } else {
                splits(cards).forEach(groups => {
                    list.push({ command: { type: 'compete', groups }, score: offerScore(state, action, cards, groups) });
                });
            }
        });
    });
    return list;
}

export function chooseCpuCommand(game, seat = game.actor(), profile = PROFILES.normal) {
    const view = createGameView(game, seat, { since: game.logs.length, events: false });
    const random = cpuRandom(game, seat);
    const candidates = candidateActions(view, seat);
    if (candidates.length === 0) return null;
    if (profile.random) return candidates[Math.floor(random() * candidates.length)].command;
    candidates.forEach(c => { c.score += (random() * 2 - 1) * profile.noise; });
    candidates.sort((a, b) => b.score - a.score);
    // 誤り：2番目か3番目の手を選ぶ
    if (candidates.length > 1 && random() < profile.mistake) {
        return candidates[1 + Math.floor(random() * Math.min(2, candidates.length - 1))].command;
    }
    return candidates[0].command;
}

// CPU に1手打たせる。決めた手が断られたら、いちばん単純な手を順に試す（必ず前に進める）
export function runCpuStep(game, seat = game.actor(), profile = PROFILES.normal) {
    if (game.isOver() || seat === null || seat !== game.actor()) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    const hand = game.players[seat].hand;
    const fallbacks = [
        { type: 'pick', index: 0 },
        { type: 'secret', card: hand[0] },
        { type: 'discard', cards: hand.slice(0, 2) },
        { type: 'gift', cards: hand.slice(0, 3) },
        { type: 'compete', groups: [hand.slice(0, 2), hand.slice(2, 4)] }
    ];
    return fallbacks.some(c => game.applyCommand(seat, c));
}

// ヒント：人が操作する番（行動か、相手の差し出しから選ぶ）に、CPU（揺れのない設定）が選ぶ手を返す。その席から見える情報だけで決める
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (game.isOver() || game.actor() !== seat) return null;
    return chooseCpuCommand(game, seat, PROFILES.strong);
}
