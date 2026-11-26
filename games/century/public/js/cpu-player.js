/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（山の並び・ほかの人の手札はのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 方針：通る手をすべて並べ、自分の次の手番までの2手を読んで、局面の値打ちを比べる（ほかの人の手は読まない）
 *   値打ち＝取った点（得点カード・硬貨）＋狙える得点カードへの近さ＋商人カードの力（残りが長いほど重い）＋香辛料
 *   得点カードへの近さは、足りない香辛料を用意するのに何手かかるか（格上げで埋める・新しく作る）で測る
 * - 香辛料を戻すときは、値打ちが下がらない香辛料から1個ずつ戻す
 * - normal（画面の CPU）は、評価に揺れがあり、ときどき2番目の手を選ぶ（強すぎないように）
 */

import { MERCHANTS, POINT_CARDS, CARAVAN_LIMIT, GOLD_POINTS, SILVER_POINTS, maxTrades, applyUpgrades, total } from './game.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

export const PROFILES = {
    normal: { noise: 1.2, secondBest: 0.2, depth: 2 },
    strong: { noise: 0, secondBest: 0, depth: 2 },
    random: { random: true } // 通る手からでたらめに選ぶ（強さを測る比較用）
};

const VALUE = [1, 2, 3, 4];               // 香辛料の格（黄1〜茶4）
// 評価の重み（scripts/cpu-match.mjs で対戦させて決めた）
export const WEIGHTS = {
    tradeRepeat: 3, // 交換のカードを続けて使う回数の見込み（上限）
    tradeFactor: 1, // 交換のカードの力の割り引き
    paceFloor: 1, // 1手番あたりに増やせる格の、いちばん低い見込み
    distanceFalloff: 0.5, // 得点カードまで1手番遠いごとの、値打ちの下がり方
    targetShare: 0.55, // 得点カードを狙えている値打ち（取ったときの点に対する割合）
    engineWeight: 0.5, // 商人カードの力の重み
    engineDecay: 0.6, // 強いカードから順に、1枚ごとに効きが薄れる割合（多すぎると休む手番が増える）
    readyWeight: 0.12, // すぐ使える（手札にある）カードの重み
    nextTurnDiscount: 0.9, // 次の手番で得られる値打ちの割り引き
    nextClaimDiscount: 0.5, // 次の手番に得点カードを買う見込みの割り引き（ほかの人に先に買われうる）
    claimNow: 4, // 買える得点カードを、その場で買う手への上乗せ（待つと先に買われうる）
    cubeWorth: [0.15, 0.5, 0.75, 1] // 持っている香辛料そのものの値打ち（黄以外は終わりに1点）
};

export const isCpuTurn = (game) => game.phase !== 'end' && game.players[game.current].isCPU;

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

const valueOf = (spices) => spices.reduce((s, n, i) => s + n * VALUE[i], 0);
const coinPoints = (coin) => (coin === 'gold' ? GOLD_POINTS : coin === 'silver' ? SILVER_POINTS : 0);

// 商人カード1枚の力（1手番で増やせる香辛料の格）。交換は、続けて何回か使える分も入れる
export function cardPower(card) {
    const m = MERCHANTS[card];
    if (m.kind === 'produce') return valueOf(m.out);
    if (m.kind === 'upgrade') return m.upgrades;
    const repeat = Math.max(1, Math.min(WEIGHTS.tradeRepeat, Math.floor(6 / total(m.in))));
    // 交換は材料の香辛料がないと使えないので、割り引いて見る
    return (valueOf(m.out) - valueOf(m.in)) * repeat * WEIGHTS.tradeFactor;
}

// 手持ちのカードで、1手番あたりに増やせる香辛料の格（休む手番も入れる）
// 強いカードから k 枚使って1回休む、を繰り返す速さのうち、いちばん速いもの（弱いカードを足しても遅くならない）
export function paceOf(cards) {
    const powers = cards.map(cardPower).sort((a, b) => b - a);
    let sum = 0;
    let best = WEIGHTS.paceFloor;
    powers.forEach((p, k) => {
        sum += p;
        best = Math.max(best, sum / (k + 2));
    });
    return best;
}

// cost を払えるようにするのにかかる手番の見積もり
// 足りない香辛料は、下の色の格上げ（段の数）か、新しく用意する（その色の格）だけの格を、pace の速さで増やす
export function workFor(caravan, cost, pace) {
    const have = [...caravan];
    let units = 0;
    for (let c = 3; c >= 0; c--) {
        let need = cost[c];
        const own = Math.min(need, have[c]);
        have[c] -= own;
        need -= own;
        while (need > 0) {
            const d = [2, 1, 0].find(x => x < c && have[x] > 0);
            if (d === undefined) {
                units += VALUE[c];
            } else {
                have[d]--;
                units += c - d;
            }
            need--;
        }
    }
    return units / pace;
}

// ---- 読みの状態：自分（香辛料・手札・使用済み・取った点）と、場（商人カード・得点カード・硬貨） ----

function stateFromView(view, seat) {
    const me = view.players[seat];
    const most = Math.max(...view.players.map(pl => pl.points.length));
    return {
        caravan: [...me.caravan], hand: [...me.hand], played: [...me.played],
        banked: me.points.reduce((s, id) => s + POINT_CARDS[id].points, 0) + me.gold * GOLD_POINTS + me.silver * SILVER_POINTS,
        market: view.market.map(m => ({ card: m.card, spices: [...m.spices] })),
        pointRow: [...view.pointRow],
        coinSlots: [...view.coinSlots],
        // 終わりまでの得点カードの枚数（いちばん進んでいる人）から、商人カードの力をどれだけ重く見るか
        remaining: Math.max(0, Math.min(1.2, (view.endCount - most) / 4))
    };
}

// 局面の値打ち
export function evaluate(s) {
    let score = s.banked;
    score += s.caravan.reduce((sum, n, i) => sum + n * WEIGHTS.cubeWorth[i], 0);
    // 狙える得点カード：いちばん良いものと、2番目を少し
    const cards = [...s.hand, ...s.played];
    const pace = paceOf(cards);
    const targets = s.pointRow.map((id, i) => {
        const card = POINT_CARDS[id];
        // 遠くても0にならないように、手番がかかるほどなめらかに下げる（香辛料を集めるたびに値打ちが上がる）
        return (card.points + coinPoints(s.coinSlots[i])) * WEIGHTS.targetShare / (1 + workFor(s.caravan, card.cost, pace) * WEIGHTS.distanceFalloff);
    }).sort((a, b) => b - a);
    score += (targets[0] ?? 0) + (targets[1] ?? 0) * 0.3;
    // 商人カードの力：強いカードから順に効きが薄れる。残りが短いほど軽い
    const powers = cards.map(cardPower).sort((a, b) => b - a);
    score += powers.reduce((sum, p, k) => sum + p * WEIGHTS.engineDecay ** k, 0) * WEIGHTS.engineWeight * s.remaining;
    score += s.hand.reduce((sum, c) => sum + cardPower(c), 0) * WEIGHTS.readyWeight;
    return score;
}

// 1手進めた状態。香辛料が10個を超えたら、値打ちの低いものから戻した形にする
function step(s, command) {
    const n = { ...s, caravan: [...s.caravan], hand: [...s.hand], played: [...s.played] };
    if (command.type === 'play') {
        const m = MERCHANTS[command.card];
        if (m.kind === 'produce') n.caravan = n.caravan.map((v, i) => v + m.out[i]);
        else if (m.kind === 'trade') n.caravan = n.caravan.map((v, i) => v + (m.out[i] - m.in[i]) * command.times);
        else n.caravan = applyUpgrades(n.caravan, command.steps, m.upgrades);
        n.hand.splice(n.hand.indexOf(command.card), 1);
        n.played.push(command.card);
    } else if (command.type === 'acquire') {
        command.pay.forEach(c => { n.caravan[c]--; });
        s.market[command.index].spices.forEach((v, i) => { n.caravan[i] += v; });
        n.hand.push(s.market[command.index].card);
        // 取ったカードより右は詰める（山から足されるカードは分からないので入れない）
        n.market = s.market.filter((_, i) => i !== command.index);
    } else if (command.type === 'rest') {
        n.hand.push(...n.played);
        n.played = [];
    } else if (command.type === 'claim') {
        const card = POINT_CARDS[s.pointRow[command.index]];
        card.cost.forEach((v, i) => { n.caravan[i] -= v; });
        n.banked += card.points + coinPoints(s.coinSlots[command.index]);
        n.pointRow = s.pointRow.filter((_, i) => i !== command.index);
        // 硬貨は左へ詰める（尽きる場合の移り変わりまでは見ない）
        n.coinSlots = command.index <= 1 ? [s.coinSlots[0], s.coinSlots[1]] : s.coinSlots;
    }
    while (total(n.caravan) > CARAVAN_LIMIT) n.caravan = cheapestDrop(n);
    return n;
}

// 1個戻すとき、戻したあとの値打ちがいちばん高くなる香辛料を戻した形
function cheapestDrop(s) {
    let best = null;
    for (let c = 0; c < 4; c++) {
        if (s.caravan[c] === 0) continue;
        const caravan = [...s.caravan];
        caravan[c]--;
        const v = evaluate({ ...s, caravan });
        if (!best || v > best.v) best = { v, caravan };
    }
    return best.caravan;
}

// 置く香辛料：値打ちの低い色から順に（黄から）
function cheapPay(caravan, count) {
    const have = [...caravan];
    const pay = [];
    for (let k = 0; k < count; k++) {
        const c = have.findIndex(n => n > 0);
        if (c < 0) return null;
        have[c]--;
        pay.push(c);
    }
    return pay;
}

// 格上げの手順の候補（結果が同じものは1つにまとめる）
function upgradeOptions(caravan, limit) {
    const seen = new Map();
    const walk = (steps, current) => {
        if (steps.length > 0) {
            const key = current.join();
            if (!seen.has(key)) seen.set(key, [...steps]);
        }
        if (steps.length === limit) return;
        for (let c = 0; c < 3; c++) {
            if (current[c] === 0) continue;
            const next = [...current];
            next[c]--;
            next[c + 1]++;
            walk([...steps, c], next);
        }
    };
    walk([], caravan);
    return [...seen.values()];
}

// 通る手（香辛料を戻す場面以外）
function commandsFor(s, { acquire = true } = {}) {
    const list = [];
    for (const card of s.hand) {
        const m = MERCHANTS[card];
        if (m.kind === 'produce') list.push({ type: 'play', card });
        else if (m.kind === 'trade') {
            for (let times = 1; times <= maxTrades(s.caravan, m); times++) list.push({ type: 'play', card, times });
        } else {
            upgradeOptions(s.caravan, m.upgrades).forEach(steps => list.push({ type: 'play', card, steps }));
        }
    }
    if (acquire) {
        s.market.forEach((_, index) => {
            const pay = cheapPay(s.caravan, index);
            if (pay) list.push({ type: 'acquire', index, pay });
        });
    }
    if (s.played.length > 0) list.push({ type: 'rest' });
    s.pointRow.forEach((id, index) => {
        if (POINT_CARDS[id].cost.every((n, i) => s.caravan[i] >= n)) list.push({ type: 'claim', index });
    });
    return list;
}

export const legalCommands = (view, seat) => commandsFor(stateFromView(view, seat));

// その状態の値打ち。depth が2なら、次の手番の最善の手（出す・休む・得点カードを買う）まで見る
function valueAfter(s, depth) {
    const now = evaluate(s);
    if (depth <= 1) return now;
    let best = now;
    for (const command of commandsFor(s, { acquire: false })) {
        const discount = command.type === 'claim' ? WEIGHTS.nextClaimDiscount : WEIGHTS.nextTurnDiscount;
        best = Math.max(best, now + (evaluate(step(s, command)) - now) * discount);
    }
    return best;
}

// 戻す香辛料：1個ずつ、戻しても値打ちが下がりにくいものを選ぶ
function chooseDiscard(view, seat) {
    const s = stateFromView(view, seat);
    const before = [...s.caravan];
    while (total(s.caravan) > CARAVAN_LIMIT) s.caravan = cheapestDrop(s);
    return { type: 'discard', spices: before.map((n, i) => n - s.caravan[i]) };
}

function randomDiscard(caravan, random) {
    const spices = [0, 0, 0, 0];
    const have = [...caravan];
    for (let k = total(have) - CARAVAN_LIMIT; k > 0; k--) {
        const colors = [0, 1, 2, 3].filter(c => have[c] > 0);
        const c = colors[Math.floor(random() * colors.length)];
        have[c]--;
        spices[c]++;
    }
    return { type: 'discard', spices };
}

// ヒント：人の番に、CPU（ふつう）が選ぶ操作。CPU と同じく、その人のビューだけで決める。手は打たない
export function suggest(game, seat) {
    if (game.phase === 'end' || game.current !== seat) return null;
    return chooseCpuCommand(game, seat, PROFILES.normal);
}

export function chooseCpuCommand(game, seat = game.current, profile = PROFILES.normal) {
    const view = createGameView(game, seat);
    const random = cpuRandom(game, seat);
    if (view.phase === 'discard') {
        return profile.random ? randomDiscard(view.players[seat].caravan, random) : chooseDiscard(view, seat);
    }
    const state = stateFromView(view, seat);
    const list = commandsFor(state);
    if (list.length === 0) return null;
    if (profile.random) return list[Math.floor(random() * list.length)];
    const scored = list.map(command => ({
        command,
        score: valueAfter(step(state, command), profile.depth ?? 2) + (command.type === 'claim' ? WEIGHTS.claimNow : 0)
            + (random() - 0.5) * 2 * (profile.noise ?? 0)
    })).sort((a, b) => b.score - a.score);
    if (scored.length > 1 && random() < (profile.secondBest ?? 0) && scored[1].score > scored[0].score - 3) return scored[1].command;
    return scored[0].command;
}

// CPU の1手を進める。選んだ手が通らなければ、通る手を順に試す（止まらないように）
export function runCpuStep(game, seat = game.current, profile) {
    if (game.phase === 'end' || seat !== game.current) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    if (game.phase === 'discard') {
        const spices = [0, 0, 0, 0];
        const have = [...game.players[seat].caravan];
        for (let k = total(have) - CARAVAN_LIMIT; k > 0; k--) {
            const c = have.findIndex(n => n > 0);
            have[c]--;
            spices[c]++;
        }
        return game.applyCommand(seat, { type: 'discard', spices });
    }
    return legalCommands(createGameView(game, seat), seat).some(c => game.applyCommand(seat, c));
}
