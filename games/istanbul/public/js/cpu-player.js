/**
 * CPU の手を決める（DOM に依存しない）
 * - 手番の終わりまでを、ゲームの写しの上で試して、盤面の点数（evaluate）が一番上がる手を選ぶ
 * - 写しでは、山札の並びとサイコロを CPU 専用の乱数で混ぜ直す（山札の並びや出目をのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - hard（つよい）：行き先ごとに、その番の行動と、次の番に届く場所での行動までを見る
 * - easy（やさしい）：その番の行動だけを見て、揺れと、ときどきの見当違いを混ぜる
 * - random（強さを測る比較用）：行き先をでたらめに選ぶ
 */

import { createRandom, shuffle } from './random.js';
import { GOODS, POLICE, MOSQUE_TILES, GEM_MAX, MAX_EXTENSIONS, EXTENSION_COST } from './data.js';
import { distance, capacityOf, ownsCard, sultanNeed, demandOf, blackMarketJewels } from './game.js';

export const PROFILES = {
    easy: { lookahead: 0, noise: 5, blunder: 0.2 },
    hard: { lookahead: 0.55, noise: 0, blunder: 0 },
    random: { random: true }
};

// 画面で選ぶ強さ
export const LEVELS = { easy: 'やさしい', hard: 'つよい' };

// 今操作が必要な CPU の席
export const cpuActors = (game) => game.actors().filter(seat => game.players[seat].isCPU);

// 盤面の点数の重み（強さごとに weights で上書きできる）
export const WEIGHTS = { ruby: 50, good: 1.8, jewel: 2.6, ext: 3.5, sultan: 14, gem: 12, mosque: 6, mosquePair: 12, stack: 2, noStack: 5 };
const GOOD_VALUE = { red: 1.8, green: 1.8, yellow: 1.8, blue: 2.6 };
let activeWeights = WEIGHTS; // 手を決めている間だけ、強さごとの重みに替える
const CARD_VALUE = { lira5: 5, good: 2.6, move34: 2.6, stay: 2, return: 2.2, family: 2.2, sultan2: 2.4, post2: 2, gem2: 2.4, market: 1.4 };
const TILE_VALUE = { red: 4, green: 6, blue: 4, yellow: 5 };
const MAX_SIM_STEPS = 40;

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// 先読み用の写し。山札の並びとサイコロは、CPU の乱数で決め直す
function simClone(game, random) {
    const sim = game.clone();
    sim.rngState = Math.floor(random() * 2 ** 32) >>> 0;
    shuffle(sim.deck, random);
    return sim;
}

// ---- 盤面の点数 ----

export function evaluate(game, seat, weights = activeWeights) {
    const w = weights;
    const p = game.players[seat];
    if (game.isOver() || game.endTriggered) {
        // 終わりが決まったら、ルビーと、同点のときの比べ方だけを見る
        return p.rubies * 100 + p.lira + GOODS.reduce((s, g) => s + p.goods[g], 0) * 0.3 + p.cards.length * 0.05;
    }
    let v = p.rubies * w.ruby + p.lira;
    GOODS.forEach(g => { v += p.goods[g] * (g === 'blue' ? w.jewel : w.good); });
    v += p.ext * w.ext;
    p.tiles.forEach(t => { v += TILE_VALUE[t]; });
    p.cards.forEach(c => { v += CARD_VALUE[c] ?? 2; });
    v += p.stack * w.stack - (p.stack === 0 ? w.noStack : 0);
    if (p.family !== POLICE) v -= 1;
    // ルビーへの近さ
    const need = sultanNeed(game.sultanCount);
    if (need) {
        let matched = 0;
        let left = 0;
        GOODS.forEach(g => {
            matched += Math.min(p.goods[g], need[g]);
            left += Math.max(0, p.goods[g] - need[g]);
        });
        matched += Math.min(need.any, left);
        const total = GOODS.reduce((s, g) => s + need[g], 0) + need.any;
        v += w.sultan * (matched / total) ** 2;
    }
    if (game.gemPrice <= GEM_MAX) v += w.gem * Math.min(1, p.lira / game.gemPrice) ** 2;
    Object.entries(MOSQUE_TILES).forEach(([place, colors]) => {
        colors.forEach(c => {
            if (p.tiles.includes(c) || game.mosqueTiles[c].length === 0) return;
            const req = game.mosqueTiles[c][0];
            const partner = colors.find(x => x !== c);
            const weight = p.tiles.includes(partner) && game.mosqueRubies[place] > 0 ? w.mosquePair : w.mosque;
            v += weight * Math.min(1, p.goods[c] / req) ** 2;
        });
    });
    if (p.ext < MAX_EXTENSIONS) v += (p.ext + 1) * 1.5 * Math.min(1, p.lira / EXTENSION_COST) ** 2;
    return v;
}

// ---- 選択肢 ----

// 売る品物を決める（多く持っている品物から、5個まで）
function sellPlan(p, limits, exclude = null) {
    const sell = { red: 0, green: 0, yellow: 0, blue: 0 };
    let total = 0;
    const order = [...GOODS].sort((a, b) => p.goods[b] - p.goods[a]);
    for (const g of order) {
        if (g === exclude) continue;
        const n = Math.min(p.goods[g], limits[g], 5 - total);
        sell[g] = n;
        total += n;
    }
    return total > 0 ? sell : null;
}

// 行動の候補（しない、も含む）
function actionOptions(game, seat) {
    const p = game.players[seat];
    const place = game.step.actPlace;
    const list = [{ type: 'skip' }];
    const cap = capacityOf(p);
    switch (place) {
        case 2: case 3: case 4:
            list.push({ type: 'act' });
            if (p.tiles.includes('green') && p.lira >= 2) {
                GOODS.forEach(g => { if (p.goods[g] < cap) list.push({ type: 'act', extra: g }); });
            }
            break;
        case 9:
            [5, 6, 7, 8].forEach(bet => list.push({ type: 'act', bet }));
            break;
        case 10: case 11: {
            const demand = demandOf(place, game.demand[place === 10 ? 'large' : 'small'][0]);
            const plans = [sellPlan(p, demand), ...GOODS.map(g => sellPlan(p, demand, g))];
            if (place === 11 && ownsCard(p, 'market')) {
                const all = { red: 5, green: 5, yellow: 5, blue: 5 };
                plans.push(sellPlan(p, all));
                plans.forEach(plan => { if (plan) list.push({ type: 'act', sell: plan, card: 'market' }); });
                plans.pop();
            }
            const seen = new Set();
            plans.forEach(plan => {
                const key = JSON.stringify(plan);
                if (plan && !seen.has(key)) {
                    seen.add(key);
                    list.push({ type: 'act', sell: plan });
                }
            });
            break;
        }
        case 12:
            for (let to = 1; to <= 16; to++) {
                if (to !== POLICE && game.canAct(p, to, 'family')) list.push({ type: 'act', to });
            }
            break;
        case 14: case 15:
            MOSQUE_TILES[place].forEach(tile => list.push({ type: 'act', tile }));
            break;
        default:
            list.push({ type: 'act' });
    }
    return list;
}

// 移動の候補
function moveOptions(game, seat) {
    const p = game.players[seat];
    const list = [];
    for (let to = 1; to <= 16; to++) {
        const d = distance(game.layout, p.merchant, to);
        if (d >= 1 && d <= 2) list.push({ type: 'move', to });
        if (ownsCard(p, 'move34') && d >= 3 && d <= 4) list.push({ type: 'move', to, card: 'move34' });
    }
    if (ownsCard(p, 'stay') && p.stack > 0) list.push({ type: 'move', to: p.merchant, card: 'stay' });
    return list;
}

// ---- 決まった手（先読みの中でも使う） ----

const cardValue = (card) => CARD_VALUE[card] ?? 2;
const worstCardIndex = (cards) => cards.reduce((best, c, i) => (cardValue(c) < cardValue(cards[best]) ? i : best), 0);

// 一番欲しい品物（積めるものの中で、点数が一番上がるもの）
function bestGood(game, seat, choices) {
    const p = game.players[seat];
    const cap = capacityOf(p);
    let best = null;
    let bestValue = -Infinity;
    choices.forEach(g => {
        if (p.goods[g] >= cap) return;
        p.goods[g]++;
        const v = evaluate(game, seat);
        p.goods[g]--;
        if (v > bestValue) {
            bestValue = v;
            best = g;
        }
    });
    return best;
}

// 手番のはじめなどに、ためらわず使うカードとタイル
function housekeeping(game, seat) {
    const p = game.players[seat];
    const stage = game.step.stage;
    if (ownsCard(p, 'lira5')) return { type: 'bonus', card: 'lira5' };
    if (ownsCard(p, 'family') && p.family !== POLICE) return { type: 'bonus', card: 'family', reward: 'lira' };
    if (ownsCard(p, 'good')) {
        const good = bestGood(game, seat, GOODS);
        if (good) return { type: 'bonus', card: 'good', good };
    }
    if (stage === 'move' && p.stack === 0 && p.assistants.length > 0) {
        const far = [...p.assistants].sort((a, b) => distance(game.layout, p.merchant, b) - distance(game.layout, p.merchant, a))[0];
        if (ownsCard(p, 'return')) return { type: 'bonus', card: 'return', from: far };
        if (p.tiles.includes('yellow') && !game.step.yellowUsed && p.lira >= 4) return { type: 'yellow', from: far };
    }
    return null;
}

// 先読みの中で、行動をすぐに決める
function ruleAction(game, seat) {
    const p = game.players[seat];
    const place = game.step.actPlace;
    const cap = capacityOf(p);
    switch (place) {
        case 2: case 3: case 4: {
            if (p.tiles.includes('green') && p.lira >= 5) {
                const extra = bestGood(game, seat, GOODS.filter(g => g !== ['red', 'green', 'yellow'][place - 2]));
                if (extra) return { type: 'act', extra };
            }
            return { type: 'act' };
        }
        case 9: return { type: 'act', bet: p.tiles.includes('red') ? 8 : 7 };
        case 10: case 11: {
            const demand = demandOf(place, game.demand[place === 10 ? 'large' : 'small'][0]);
            const sell = sellPlan(p, demand);
            return sell ? { type: 'act', sell } : { type: 'skip' };
        }
        case 12: {
            const order = [16, 13, 14, 15, 1, 5, 10, 11, 8, 9, 2, 3, 4, 6, 7];
            const to = order.find(x => game.canAct(p, x, 'family') && (x !== 2 && x !== 3 && x !== 4 || p.goods[['red', 'green', 'yellow'][x - 2]] < cap - 1));
            return to ? { type: 'act', to } : { type: 'skip' };
        }
        case 14: case 15: {
            const tile = MOSQUE_TILES[place].find(c => !p.tiles.includes(c) && game.mosqueTiles[c].length > 0 && p.goods[c] >= game.mosqueTiles[c][0]);
            return tile ? { type: 'act', tile } : { type: 'skip' };
        }
        default: return { type: 'act' };
    }
}

// 行動以外の段階の決まった手
function rulePolicy(game, seat) {
    const p = game.players[seat];
    const step = game.step;
    switch (step.stage) {
        case 'pay': return { type: 'pay', accept: p.lira >= step.payCost };
        case 'action': return ruleAction(game, seat);
        case 'caravan': {
            const top = game.discard.at(-1);
            return { type: 'draw', from: top && cardValue(top) >= 3 ? 'discard' : 'deck' };
        }
        case 'caravanDiscard': return { type: 'discard', index: worstCardIndex(p.cards) };
        case 'dice': {
            const [a, b] = step.dice;
            const low = a <= b ? 0 : 1;
            const four = Math.max(a, b) + 4;
            if (step.diceFor === 'tea') {
                if (a + b >= step.bet) return { type: 'dice', mode: 'keep' };
                if (four >= step.bet) return { type: 'dice', mode: 'four', die: low };
                return { type: 'dice', mode: 'reroll' };
            }
            const now = blackMarketJewels(a + b);
            if (blackMarketJewels(four) > now) return { type: 'dice', mode: 'four', die: low };
            return { type: 'dice', mode: now === 0 ? 'reroll' : 'keep' };
        }
        case 'blackGood': return { type: 'good', good: bestGood(game, seat, ['red', 'green', 'yellow']) };
        case 'after': {
            const card = ['sultan2', 'gem2', 'post2'].find(c => game.canDouble(p, c));
            return card ? { type: 'bonus', card } : { type: 'end' };
        }
        case 'encounter': {
            const encounter = step.encounters[0];
            if (encounter.kind === 'family') return { type: 'catch', reward: 'lira' };
            if (encounter.kind === 'governor') {
                if (game.cardsLeft() === 0) return { type: 'governor', use: false };
                if (p.lira >= 4) return { type: 'governor', use: true, pay: 'lira' };
                if (p.cards.length > 0 && cardValue(p.cards[worstCardIndex(p.cards)]) < 2.4) {
                    return { type: 'governor', use: true, pay: 'card', index: worstCardIndex(p.cards) };
                }
                return { type: 'governor', use: false };
            }
            const good = bestGood(game, seat, GOODS);
            if (!good) return { type: 'smuggler', use: false };
            if (p.lira >= 4) return { type: 'smuggler', use: true, good, pay: 'lira' };
            const payGood = GOODS.filter(g => g !== good && p.goods[g] > 0).sort((x, y) => GOOD_VALUE[x] - GOOD_VALUE[y])[0];
            return payGood ? { type: 'smuggler', use: true, good, pay: payGood } : { type: 'smuggler', use: false };
        }
        default: return null;
    }
}

// どの段階でも、必ず受け付けられる一番単純な答え
export function fallbackCommand(game, seat) {
    const p = game.players[seat];
    const step = game.step;
    switch (step.stage) {
        case 'move': {
            for (let to = 1; to <= 16; to++) if (distance(game.layout, p.merchant, to) === 1) return { type: 'move', to };
            return null;
        }
        case 'pay': return { type: 'pay', accept: false };
        case 'action': return { type: 'skip' };
        case 'caravan': return { type: 'draw', from: game.discard.length > 0 ? 'discard' : 'deck' };
        case 'caravanDiscard': return { type: 'discard', index: 0 };
        case 'dice': return { type: 'dice', mode: 'keep' };
        case 'blackGood': return { type: 'good', good: ['red', 'green', 'yellow'].find(g => p.goods[g] < capacityOf(p)) };
        case 'after': return { type: 'end' };
        case 'encounter': {
            const kind = step.encounters[0].kind;
            if (kind === 'family') return { type: 'catch', reward: 'lira' };
            return { type: kind, use: false };
        }
        default: return null;
    }
}

// 番の終わりまで、決まった手で進める
function finishTurn(sim, seat) {
    for (let i = 0; i < MAX_SIM_STEPS && !sim.isOver() && sim.turn === seat; i++) {
        const command = rulePolicy(sim, seat);
        if (command && sim.applyCommand(seat, command)) continue;
        const fallback = fallbackCommand(sim, seat);
        if (!fallback || !sim.applyCommand(seat, fallback)) break;
    }
}

// 次の番に届く場所で、一番よい行動をしたときの伸び（ほかの人の動きは見ない）
function nextTurnGain(sim, seat, random) {
    if (sim.isOver() || sim.endTriggered) return 0;
    const base = evaluate(sim, seat);
    const p = sim.players[seat];
    let best = 0;
    for (let to = 1; to <= 16; to++) {
        const d = distance(sim.layout, p.merchant, to);
        if (d < 1 || d > 2) continue;
        const next = simClone(sim, random);
        next.turn = seat;
        next.step = { stage: 'move', yellowUsed: false, acted: false };
        if (!next.applyCommand(seat, { type: 'move', to })) continue;
        finishTurn(next, seat);
        best = Math.max(best, evaluate(next, seat) - base);
    }
    return best;
}

// 候補を1つずつ試して、点数の一番高いものを選ぶ
function pickBest(game, seat, options, profile, random) {
    let best = null;
    let bestValue = -Infinity;
    options.forEach(command => {
        const sim = simClone(game, random);
        if (!sim.applyCommand(seat, command)) return;
        // 移動や支払いのあとは、行動も候補から選ぶ（行動の中の選択は決まった手で進める）
        let chosen = command.type === 'act' || command.type === 'skip';
        for (let i = 0; i < 4 && sim.turn === seat && !sim.isOver(); i++) {
            if (sim.step.stage === 'pay') {
                sim.applyCommand(seat, rulePolicy(sim, seat));
            } else if (sim.step.stage === 'action' && !chosen) {
                chosen = true;
                const inner = pickBest(sim, seat, actionOptions(sim, seat), { ...profile, lookahead: 0, noise: 0 }, random);
                if (inner) sim.applyCommand(seat, inner.command);
            } else {
                break;
            }
        }
        finishTurn(sim, seat);
        let value = evaluate(sim, seat);
        if (profile.lookahead) value += profile.lookahead * nextTurnGain(sim, seat, random);
        if (profile.noise) value += (random() * 2 - 1) * profile.noise;
        if (value > bestValue) {
            bestValue = value;
            best = { command, value };
        }
    });
    return best;
}

export function chooseCpuCommand(game, seat, profile = PROFILES.hard) {
    activeWeights = { ...WEIGHTS, ...profile.weights };
    try {
        return decide(game, seat, profile);
    } finally {
        activeWeights = WEIGHTS;
    }
}

function decide(game, seat, profile) {
    const random = cpuRandom(game, seat);
    const stage = game.step.stage;
    if (profile.random) {
        if (stage === 'move') {
            const options = moveOptions(game, seat).filter(c => !c.card);
            return options[Math.floor(random() * options.length)];
        }
        return rulePolicy(game, seat);
    }
    const chore = housekeeping(game, seat);
    if (chore) return chore;
    if (stage === 'move' || stage === 'pay' || stage === 'action') {
        const options = stage === 'move' ? moveOptions(game, seat)
            : stage === 'pay' ? [{ type: 'pay', accept: true }, { type: 'pay', accept: false }]
                : actionOptions(game, seat);
        if (stage === 'move' && profile.blunder && random() < profile.blunder) {
            const plain = options.filter(c => !c.card);
            return plain[Math.floor(random() * plain.length)];
        }
        const best = pickBest(game, seat, options, profile, random);
        if (best) return best.command;
    }
    return rulePolicy(game, seat);
}

// seat の CPU に1手打たせる。決めた手が断られたら、一番単純な答えで必ず前に進む
export function runCpuStep(game, seat, profile = PROFILES.hard) {
    if (!game.actors().includes(seat)) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    const fallback = fallbackCommand(game, seat);
    return !!fallback && game.applyCommand(seat, fallback);
}

