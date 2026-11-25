/**
 * CPU の判断（DOM に依存しない）
 * 街コロには隠す情報がないので、ゲームの状態をそのまま見て決める
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いを入れたいときは、状態から作った別の乱数を使う
 *
 * ふつう：出目の確率から、1周（全員が1回ずつ振る）あたりに入るコインの見込みを計算し、
 *        「残りのランドマークの費用 ÷ 1周の見込み」（勝つまでにかかる周の数）が一番小さくなる手を選ぶ
 *        サイコロの数、振り直し、テレビ局の相手、ビジネスセンターの交換も、同じ見込みで決める
 * やさしい：ランドマークが建てられれば一番安いものを建て、そうでなければ、買える施設から適当に選ぶ（ときどき見送る）
 *        サイコロは持っている施設の出目で決め、何も入らなかったときだけ振り直す。交換はしない
 */

import { createRandom } from './random.js';
import { ESTABLISHMENTS, ESTABLISHMENT_ORDER, LANDMARKS, LANDMARK_ORDER, cardIncome, landmarkCount } from './game.js';

export const CPU_LEVELS = ['easy', 'normal'];

// 出目の確率（1個と2個）
const DIST = {
    1: Array.from({ length: 13 }, (_, s) => (s >= 1 && s <= 6 ? 1 / 6 : 0)),
    2: Array.from({ length: 13 }, (_, s) => (s >= 2 ? (6 - Math.abs(s - 7)) / 36 : 0))
};

const MIN_INCOME = 0.3;

const cloneMe = (p) => ({ ...p, cards: { ...p.cards }, landmarks: { ...p.landmarks } });

// 自分の番に、目が sum のとき入る（出ていく）コイン
function ownGain(me, sum, others, n) {
    let gain = 0;
    for (const key of ESTABLISHMENT_ORDER) {
        const card = ESTABLISHMENTS[key];
        if (!card.rolls.includes(sum)) continue;
        if (me.cards[key] && (card.color === 'blue' || card.color === 'green')) gain += me.cards[key] * cardIncome(me, key, n);
        if (card.color === 'red') others.forEach(o => { if (o.cards[key]) gain -= o.cards[key] * cardIncome(o, key, n); });
    }
    if (sum === 6) {
        if (me.cards.stadium) gain += others.reduce((s, o) => s + Math.min(2, o.coins), 0);
        if (me.cards.tv) gain += Math.min(5, Math.max(0, ...others.map(o => o.coins)));
    }
    return gain;
}

// 自分の番の見込み（サイコロの数ごと）
function ownTurnValue(me, dice, others, n) {
    let value = 0;
    for (let s = 1; s <= 12; s++) if (DIST[dice][s]) value += DIST[dice][s] * ownGain(me, s, others, n);
    if (dice === 2 && me.landmarks.park) value *= 7 / 6;        // ゾロ目でもう1回
    if (me.landmarks.tower) value += Math.max(0.3, Math.abs(value) * 0.15); // 悪い目を振り直せる
    return value;
}

function bestDice(me, others, n) {
    if (!me.landmarks.station) return 1;
    return ownTurnValue(me, 2, others, n) > ownTurnValue(me, 1, others, n) ? 2 : 1;
}

// ほかの人の番に入る見込み（青と赤）。ほかの人は、駅があれば2個で振ると見る
function othersTurnValue(me, others, n) {
    let value = 0;
    others.forEach(o => {
        const dist = DIST[o.landmarks.station ? 2 : 1];
        for (const key of ESTABLISHMENT_ORDER) {
            const card = ESTABLISHMENTS[key];
            if (!me.cards[key] || (card.color !== 'blue' && card.color !== 'red')) continue;
            const p = card.rolls.reduce((s, r) => s + dist[r], 0);
            value += p * me.cards[key] * (card.color === 'red' ? Math.min(cardIncome(me, key, n), o.coins + 2) : cardIncome(me, key, n));
        }
    });
    return value;
}

// 1周あたりの見込み
export function incomePerRound(me, others, n) {
    const own = Math.max(ownTurnValue(me, 1, others, n), me.landmarks.station ? ownTurnValue(me, 2, others, n) : -Infinity);
    return own + othersTurnValue(me, others, n);
}

const remainingCost = (me) => LANDMARK_ORDER.reduce((s, k) => s + (me.landmarks[k] ? 0 : LANDMARKS[k].cost), 0);

// 勝つまでにかかる周の数の見積もり（小さいほどよい）
function roundsToWin(me, others, n) {
    const need = remainingCost(me) - me.coins;
    if (need <= 0) return 0;
    return need / Math.max(MIN_INCOME, incomePerRound(me, others, n));
}

// 建てたあとの自分
function afterBuild(me, key) {
    const next = cloneMe(me);
    if (LANDMARKS[key]) {
        next.coins -= LANDMARKS[key].cost;
        next.landmarks[key] = true;
    } else {
        next.coins -= ESTABLISHMENTS[key].cost;
        next.cards[key] = (next.cards[key] ?? 0) + 1;
    }
    return next;
}

// CPU 用の乱数（ゲームの乱数とは別。状態から決まるので、同じ場面では同じ手になる）
const cpuRandom = (game, seat) => createRandom((game.options.seed ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ (seat * 7919)) >>> 0);

// ---- 手を選ぶ ----

export function chooseCommand(game, seat = game.current, level = game.players[seat].cpuLevel ?? 'normal') {
    const me = game.players[seat];
    const others = game.players.filter(p => p.id !== seat);
    const n = game.players.length;
    const easy = level === 'easy';
    const rand = cpuRandom(game, seat);

    switch (game.phase) {
        case 'roll': {
            if (!game.canRollTwo(seat)) return { type: 'roll', dice: 1 };
            if (easy) {
                const high = ESTABLISHMENT_ORDER.filter(k => me.cards[k] && ESTABLISHMENTS[k].rolls[0] >= 7).reduce((s, k) => s + me.cards[k], 0);
                const low = ESTABLISHMENT_ORDER.filter(k => me.cards[k] && ESTABLISHMENTS[k].rolls[0] <= 6).reduce((s, k) => s + me.cards[k], 0);
                return { type: 'roll', dice: high > low ? 2 : 1 };
            }
            return { type: 'roll', dice: bestDice(me, others, n) };
        }
        case 'reroll': {
            const actual = ownGain(me, game.diceSum, others, n);
            if (easy) return { type: actual > 0 ? 'keep' : 'reroll' };
            const dice = game.dice.length;
            let expected = 0;
            for (let s = 1; s <= 12; s++) expected += DIST[dice][s] * ownGain(me, s, others, n);
            const bonus = game.isDoubles && me.landmarks.park ? expected : 0;
            return { type: actual + bonus < expected - 0.25 ? 'reroll' : 'keep' };
        }
        case 'tv': {
            const targets = game.tvTargets(seat).map(id => game.players[id]);
            if (easy) return { type: 'tv', target: targets[Math.floor(rand() * targets.length)].id };
            targets.sort((a, b) => (b.coins - a.coins) || (landmarkCount(b) - landmarkCount(a)) || (a.id - b.id));
            return { type: 'tv', target: targets[0].id };
        }
        case 'trade':
            return easy ? { type: 'skipTrade' } : chooseTrade(game, seat);
        case 'build':
            return easy ? chooseBuildEasy(game, seat, rand) : chooseBuild(game, seat);
        default:
            return null;
    }
}

function chooseBuild(game, seat) {
    const me = game.players[seat];
    const others = game.players.filter(p => p.id !== seat);
    const n = game.players.length;
    let best = { type: 'pass' };
    // 見送りより少しでもよい手だけを選ぶ。ランドマークは、コインを相手に取られなくなるので少し有利に見る
    let bestScore = roundsToWin(me, others, n);
    for (const key of game.buildable(seat)) {
        const next = afterBuild(me, key);
        const score = roundsToWin(next, others, n) - (LANDMARKS[key] ? 0.05 + bestScore * 0.02 : 0);
        if (score < bestScore - 1e-9) {
            bestScore = score;
            best = { type: 'build', card: key };
        }
    }
    return best;
}

function chooseBuildEasy(game, seat, rand) {
    const me = game.players[seat];
    const list = game.buildable(seat);
    const landmark = LANDMARK_ORDER.find(k => list.includes(k));
    if (landmark) return { type: 'build', card: landmark };
    const cards = list.filter(k => ESTABLISHMENTS[k]);
    if (!cards.length || rand() < 0.25) return { type: 'pass' };
    // 安いものほど選びやすい
    const weights = cards.map(k => 1 / ESTABLISHMENTS[k].cost);
    let r = rand() * weights.reduce((s, w) => s + w, 0);
    const pick = cards.find((k, i) => (r -= weights[i]) <= 0) ?? cards.at(-1);
    return me.coins >= ESTABLISHMENTS[pick].cost ? { type: 'build', card: pick } : { type: 'pass' };
}

function chooseTrade(game, seat) {
    const me = game.players[seat];
    const n = game.players.length;
    const others = game.players.filter(p => p.id !== seat);
    const base = incomePerRound(me, others, n);
    let best = null;
    let bestGain = 0.15;
    for (const target of others) {
        for (const give of game.tradeable(seat)) {
            for (const take of game.tradeable(target.id)) {
                if (give === take) continue;
                const next = cloneMe(me);
                next.cards[give] -= 1;
                next.cards[take] = (next.cards[take] ?? 0) + 1;
                const gain = incomePerRound(next, others, n) - base;
                if (gain > bestGain) {
                    bestGain = gain;
                    best = { type: 'trade', give, target: target.id, take };
                }
            }
        }
    }
    return best ?? { type: 'skipTrade' };
}

// ---- 進める ----

export function isCpuTurn(game) {
    return !game.isOver() && game.players[game.current].isCPU;
}

// 操作を待っている CPU に1手打たせる。思わぬ選択を求められたら、いちばん単純な手で進める
export function runCpuStep(game, seat = game.current, level) {
    const command = chooseCommand(game, seat, level);
    if (command && game.applyCommand(seat, command)) return command;
    const fallback = { roll: { type: 'roll', dice: 1 }, reroll: { type: 'keep' }, tv: { type: 'tv', target: game.tvTargets(seat)[0] },
        trade: { type: 'skipTrade' }, build: { type: 'pass' } }[game.phase];
    if (fallback && game.applyCommand(seat, fallback)) return fallback;
    return null;
}

