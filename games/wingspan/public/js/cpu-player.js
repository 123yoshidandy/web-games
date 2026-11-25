/**
 * CPU の手を決める（DOM に依存しない）
 * - ゲームの乱数は使わない。先読みは、写したゲームの乱数をシードと手数と席から作り直し、山札を混ぜ直してから試す
 *   （山札の並びと、この先のサイコロをのぞかない）
 * - 手番の行動（鳥を出す・3つの生息地の行動）は、候補ごとに手番の終わりまで進め、盤面の価値がいちばん高いものを選ぶ
 *   盤面の価値＝今の得点＋ラウンドの目標の見込み＋残りの手番で生きる分（餌・手札・列の鳥の数・茶色の能力）
 * - 手番の中の細かい選択（どの餌を取るか、どの鳥に卵を置くか、能力を使うか）は、その場の見積もりで選ぶ
 * - easy（やさしい）は先読みをせず、出せる鳥があれば出し、なければ足りないものを取る。ときどき迷う
 */

import Game, { paymentOptions, scoreOf, rankGoal } from './game.js';
import {
    FOODS, HABITATS, EGG_COST, ROW_SIZE, TURNS_PER_ROUND, ROUNDS, birdOf, bonusOf, bonusPoints, goalOf, boardBirds, BONUS_CARDS
} from './birds.js';
import { createRandom } from './random.js';

// 盤面の価値の重み
export const WEIGHTS = {
    goal: 0.8, food: 1.0, foodNeed: 0.2, foodExcess: 0.4, handReady: 0.225, handBase: 0.22, readyBonus: 0.6, notReady: 0.2,
    handExtra: 0.15, option: 0.5, row: 0.55, power: 1, eggRoom: 0.12
};

export const PROFILES = {
    easy: { lookahead: false, blunder: 0.25 },
    normal: { lookahead: true, blunder: 0, w: WEIGHTS, depth: 2 },
    random: { random: true }
};

export const LEVELS = { easy: 'やさしい', normal: 'ふつう' };

export const cpuActors = (game) => game.actors().filter(seat => game.players[seat].isCPU);

function cpuSeed(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return h >>> 0;
}

// ---- 見積もり ----

// この席が、あと何回手番をするか（今の手番を含まない）
export function turnsLeft(game, seat) {
    if (game.isOver()) return 0;
    const p = game.players[seat];
    let left = Math.max(0, game.turnsThisRound() - p.actions - (game.phase === 'play' && game.turn === seat ? 1 : 0));
    for (let r = game.round; r < ROUNDS; r++) left += TURNS_PER_ROUND[r];
    return left;
}

// 茶色の能力を1回使ったときの価値の目安
const POWER_VALUE = {
    gainFeeder: 0.55, cacheFeeder: 0.8, cacheSupply: 1, hunt: 0.45, predator: 0.6, tuckDraw: 0.9, tuckFood: 1.1, tuckEgg: 1.2,
    layThis: 0.9, layAny: 1, drawCard: 0.55, allFood: 0.45, allDraw: 0.35, fewestDraw: 0.35, discardEggFood: 0.5,
    discardEggCards: 0.6, discardFoodTuck: 1.1, tradeFood: 0.2
};

function powerValue(bird) {
    if (!bird.power || bird.power.color !== 'brown') return 0;
    let v = POWER_VALUE[bird.power.kind] ?? 0.3;
    if (bird.power.kind === 'predator') v = bird.power.arg >= 100 ? 0.75 : bird.power.arg >= 75 ? 0.6 : 0.45;
    if (bird.power.kind === 'discardEggFood' && bird.power.arg === 2) v = 0.9;
    if (bird.power.kind === 'layThis' && bird.eggs <= 2) v *= 0.6;
    return v;
}

// 手札の鳥の、持っている価値（出す見込みを含む）
export function cardValue(game, seat, birdId, left = turnsLeft(game, seat), w = WEIGHTS) {
    const bird = birdOf(birdId);
    const p = game.players[seat];
    const placeable = bird.habitats.some(h => p.board[h].length < ROW_SIZE);
    if (!placeable || left <= 0) return 0;
    const costN = bird.cost.or ? 1 : bird.cost.items.length;
    let v = bird.points + powerValue(bird) * Math.min(6, left / 3) - costN * 0.6;
    const bonusHit = p.bonus.some(id => {
        const card = bonusOf(id);
        const before = card.count(p);
        const after = card.count({ ...p, board: { ...p.board, [bird.habitats[0]]: [...p.board[bird.habitats[0]], { bird: birdId, eggs: 1, cache: {}, tucked: 1 }] }, hand: p.hand.filter(h => h !== birdId) });
        return after > before;
    });
    if (bonusHit) v += 1.2;
    const scale = Math.min(1, left / 3);
    // 今の餌で出せる鳥は、次の手番で点になる
    const ready = paymentOptions(bird.cost, p.food, 1).length > 0;
    return Math.max(0, (v * (ready ? w.handReady : w.handBase) + (ready ? w.readyBonus : w.notReady)) * scale);
}

// 手札の鳥を出すのに足りない餌（種類ごとの重み）
function foodNeeds(game, seat) {
    const p = game.players[seat];
    const need = Object.fromEntries(FOODS.map(f => [f, 0]));
    for (const id of p.hand) {
        const bird = birdOf(id);
        if (!bird.habitats.some(h => p.board[h].length < ROW_SIZE)) continue;
        const weight = 1 + bird.points * 0.25 + powerValue(bird);
        if (bird.cost.or) {
            if (!bird.cost.items.some(f => p.food[f] > 0)) bird.cost.items.forEach(f => { need[f] += weight / bird.cost.items.length; });
            continue;
        }
        const have = { ...p.food };
        for (const item of bird.cost.items) {
            if (item === 'any') continue;
            if (have[item] > 0) have[item]--;
            else need[item] += weight;
        }
    }
    return need;
}

// 盤面の価値（その席から見た、最後の得点の見込み）
export function evaluate(game, seat, w = WEIGHTS) {
    const p = game.players[seat];
    const score = scoreOf(p);
    if (game.isOver()) return score.total;
    const left = turnsLeft(game, seat);
    let v = score.total;
    // 今のラウンドの目標の見込み（いま終わったら何点か）
    const goal = goalOf(game.goals[game.round - 1]);
    const values = game.players.map(q => goal.measure(q));
    v += rankGoal(values, game.round)[seat] * w.goal;
    // 餌：足りない種類ほど価値が高い。終わりが近いほど価値が下がる
    const need = foodNeeds(game, seat);
    const foodTotal = FOODS.reduce((s, f) => s + p.food[f], 0);
    const scale = Math.min(1, left / 5);
    v += FOODS.reduce((s, f) => s + Math.min(p.food[f], 3) * (w.food + Math.min(0.6, need[f] * w.foodNeed)), 0) * scale;
    v -= Math.max(0, foodTotal - 8) * w.foodExcess * scale;
    // 手札：残りの手番で出せそうな枚数まで数え、それより多い分はわずかに数える
    const values2 = p.hand.map(id => cardValue(game, seat, id, left, w)).sort((a, b) => b - a);
    const usable = Math.max(1, Math.ceil(left / 2.5));
    v += values2.reduce((s, x, k) => s + (k < usable ? x : x * w.handExtra), 0);
    // 手札が少ないと選べない。最初の数枚には、選べることの価値がある
    v += Math.min(p.hand.length, 3) * w.option * Math.min(1, left / 6);
    // 列の鳥：行動の量が増え、茶色の能力が働く。残りの手番が多いほど効く
    for (const h of HABITATS) {
        const row = p.board[h];
        v += row.length * w.row * Math.min(left, 15) / 3;
        row.forEach(slot => { v += powerValue(birdOf(slot.bird)) * w.power * left / 3.2; });
    }
    // 卵を産める余地（あとで卵にできる）
    v += Math.min(game.eggRoom(seat), left * 2) * w.eggRoom * Math.min(1, left / 3);
    return v;
}

// ---- 細かい選択（その場の見積もり） ----

function bestPayment(game, seat, bird) {
    const p = game.players[seat];
    const options = paymentOptions(bird.cost, p.food);
    if (!options.length) return null;
    const need = foodNeeds(game, seat);
    // 残す餌が、ほかの鳥に要る種類であるほどよい
    const cost = (pay) => pay.length * 10 + pay.reduce((s, f) => s + need[f] + (p.food[f] <= 1 ? 0.3 : 0), 0);
    return options.reduce((best, pay) => (cost(pay) < cost(best) ? pay : best));
}

// 卵を払う鳥。今の目標とボーナスに効かない鳥から取る
function eggSources(game, seat, count) {
    const p = game.players[seat];
    const slots = [];
    HABITATS.forEach(h => p.board[h].forEach((slot, i) => {
        for (let k = 0; k < slot.eggs; k++) slots.push({ h, i, keep: eggWorth(game, seat, { h, i }, slot.eggs - k) });
    }));
    if (slots.length < count) return null;
    return slots.sort((a, b) => a.keep - b.keep).slice(0, count).map(({ h, i }) => ({ h, i }));
}

// その鳥の k 個目の卵の値打ち（目標・ボーナスに効くほど高い）
function eggWorth(game, seat, ref, k) {
    const p = game.players[seat];
    const bird = birdOf(p.board[ref.h][ref.i].bird);
    let w = 0;
    const goalId = game.goals[game.round - 1] ?? '';
    if (goalId === `eggs_${ref.h}`) w += 1;
    if (goalId.startsWith('nesteggs_') && (bird.nest === goalId.slice(9) || bird.nest === 'star')) w += 1;
    if (goalId.startsWith('nestbirds_') && (bird.nest === goalId.slice(10) || bird.nest === 'star') && k === 1) w += 2;
    p.bonus.forEach(id => {
        if (id === 'breeding' && k <= 4) w += 0.3;
        if (id === 'oologist' && k === 1) w += 0.6;
        if (['nestbox', 'platform', 'gardener', 'enclosure'].includes(id) && k === 1) w += 0.6;
    });
    return w;
}

function layTargets(game, seat, n, only = null) {
    const p = game.players[seat];
    const room = new Map();
    HABITATS.forEach(h => p.board[h].forEach((slot, i) => {
        if (only && !only.some(r => r.h === h && r.i === i)) return;
        room.set(`${h}:${i}`, { h, i, eggs: slot.eggs, max: birdOf(slot.bird).eggs });
    }));
    const out = [];
    for (let k = 0; k < n; k++) {
        let best = null;
        let bestW = -Infinity;
        for (const r of room.values()) {
            if (r.eggs >= r.max) continue;
            const w = eggWorth(game, seat, r, r.eggs + 1) + (r.max - r.eggs) * 0.01;
            if (w > bestW) { bestW = w; best = r; }
        }
        if (!best) break;
        best.eggs++;
        out.push({ h: best.h, i: best.i });
    }
    return out;
}

function chooseDie(game, seat, d) {
    const need = foodNeeds(game, seat);
    const p = game.players[seat];
    const want = (f) => need[f] * 2 + 1 / (1 + p.food[f]) + (f === 'rodent' || f === 'fish' ? 0.1 : 0);
    let best = null;
    game.feeder.forEach((face, die) => {
        const choices = face === 'invseed' ? ['inv', 'seed'] : [face];
        choices.forEach(f => {
            if (d.only && !d.only.includes(f)) return;
            const w = want(f);
            if (!best || w > best.w) best = { die, as: face === 'invseed' ? f : undefined, w };
        });
    });
    // サイコロがすべて同じ面で、その餌があまり要らないなら振り直す
    if (game.feederAllSame() && game.feeder.length >= 2 && best && need[best.as ?? game.feeder[0]] === 0 && p.food[best.as ?? game.feeder[0]] >= 2) {
        return { type: 'reroll' };
    }
    if (!best) return game.feederAllSame() ? { type: 'reroll' } : null;
    return { type: 'take', die: best.die, ...(best.as ? { as: best.as } : {}) };
}

function chooseDraw(game, seat, n) {
    const scored = game.tray.map((id, i) => ({ i, v: cardValue(game, seat, id) })).sort((a, b) => b.v - a.v);
    const deckValue = 0.75;
    const tray = scored.filter(s => s.v > deckValue).slice(0, n).map(s => s.i);
    let deck = n - tray.length;
    const avail = game.deck.length + game.discard.length;
    while (deck > avail) {
        const next = scored.find(s => !tray.includes(s.i));
        if (!next) break;
        tray.push(next.i);
        deck--;
    }
    return { type: 'draw', tray, deck: Math.max(0, deck) };
}

const worstCard = (game, seat) => {
    const p = game.players[seat];
    return [...p.hand].sort((a, b) => cardValue(game, seat, a) - cardValue(game, seat, b))[0];
};

function choosePower(game, seat, d) {
    const p = game.players[seat];
    const left = turnsLeft(game, seat);
    const need = foodNeeds(game, seat);
    switch (d.power) {
        case 'tuckDraw':
            return { type: 'power', card: worstCard(game, seat) };
        case 'tuckFood': case 'tuckEgg': {
            const card = worstCard(game, seat);
            if (cardValue(game, seat, card) < 1.6 || p.hand.length >= 4) return { type: 'power', card };
            return { type: 'skip' };
        }
        case 'discardEggFood': case 'discardEggCards': {
            const [from] = eggSources(game, seat, 1) ?? [];
            const src = from && !(from.h === d.ref.h && from.i === d.ref.i) ? from : null;
            const other = src ?? findOtherEgg(game, seat, d.ref);
            if (!other) return { type: 'skip' };
            const arg = birdOf(d.bird).power.arg;
            const worth = d.power === 'discardEggFood' ? arg * 0.8 * Math.min(1, left / 4) : arg * 0.7 * Math.min(1, left / 4);
            if (worth <= 1.05) return { type: 'skip' };
            if (d.power === 'discardEggFood') {
                const get = [...FOODS].sort((a, b) => need[b] - need[a]).slice(0, 1);
                while (get.length < arg) get.push(get[0]);
                return { type: 'power', target: other, get };
            }
            return { type: 'power', target: other };
        }
        case 'discardFoodTuck': {
            const arg = birdOf(d.bird).power.arg;
            if (need[arg] > 0.5 && p.food[arg] <= 1 && left > 3) return { type: 'skip' };
            return { type: 'power' };
        }
        case 'tradeFood': {
            const give = [...FOODS].filter(f => p.food[f] > 0).sort((a, b) => (need[a] - p.food[a] * 0.2) - (need[b] - p.food[b] * 0.2))[0];
            const get = [...FOODS].filter(f => f !== give).sort((a, b) => need[b] - need[a])[0];
            if (!give || need[get] <= need[give] + 0.2) return { type: 'skip' };
            return { type: 'power', give, get };
        }
        case 'layAny': {
            const [target] = layTargets(game, seat, 1);
            return target ? { type: 'power', target } : { type: 'skip' };
        }
        default:
            return { type: 'skip' };
    }
}

function findOtherEgg(game, seat, ref) {
    const p = game.players[seat];
    for (const h of HABITATS) {
        for (let i = 0; i < p.board[h].length; i++) {
            if ((h !== ref.h || i !== ref.i) && p.board[h][i].eggs > 0) return { h, i };
        }
    }
    return null;
}

function chooseBonus(game, seat, options) {
    const p = game.players[seat];
    const score = (id) => {
        const card = bonusOf(id);
        const now = bonusPoints(card, p);
        const hand = p.hand.filter(h => card.count({ ...p, board: { forest: [{ bird: h, eggs: 1, cache: {}, tucked: 1 }], grassland: [], wetland: [] }, hand: [] }) > 0).length;
        return now + card.count(p) * 0.5 + hand * 0.4;
    };
    return [...options].sort((a, b) => score(b) - score(a))[0];
}

// 鳥を出す手（支払いは見積もりで決める）
function playCommand(game, seat, birdId, habitat) {
    const p = game.players[seat];
    const bird = birdOf(birdId);
    if (!bird.habitats.includes(habitat) || p.board[habitat].length >= ROW_SIZE) return null;
    const food = bestPayment(game, seat, bird);
    if (!food) return null;
    const eggs = eggSources(game, seat, EGG_COST[p.board[habitat].length]);
    if (!eggs) return null;
    return { type: 'play', bird: birdId, habitat, food, eggs };
}

function playCommands(game, seat, only = null) {
    const p = game.players[seat];
    const out = [];
    for (const id of new Set(p.hand)) {
        for (const h of birdOf(id).habitats) {
            if (only && h !== only) continue;
            const cmd = playCommand(game, seat, id, h);
            if (cmd) out.push(cmd);
        }
    }
    return out;
}

function actionCommands(game, seat) {
    const p = game.players[seat];
    const out = [];
    for (const h of HABITATS) {
        out.push({ type: 'action', habitat: h });
        const info = game.actionInfo(seat, h);
        if (!info.bonus) continue;
        if (h === 'forest' && p.hand.length > 0) out.push({ type: 'action', habitat: h, bonus: { card: worstCard(game, seat) } });
        if (h === 'grassland') {
            const need = foodNeeds(game, seat);
            const give = FOODS.filter(f => p.food[f] > 0).sort((a, b) => (need[a] - p.food[a] * 0.3) - (need[b] - p.food[b] * 0.3))[0];
            if (give && game.eggRoom(seat) > info.amount) out.push({ type: 'action', habitat: h, bonus: { food: give } });
        }
        if (h === 'wetland') {
            const [egg] = eggSources(game, seat, 1) ?? [];
            if (egg && game.tray.length + game.deck.length + game.discard.length > info.amount) out.push({ type: 'action', habitat: h, bonus: { egg } });
        }
    }
    return out;
}

// ---- 手番の行動の選び方 ----

// 写したゲームで、この席の手番が終わるまで、見積もりの選択で進める
function finishTurn(sim, seat) {
    const start = sim.turnNo;
    let guard = 0;
    while (!sim.isOver() && sim.turnNo === start && sim.decision?.seat === seat && guard++ < 60) {
        const cmd = decideQuick(sim, seat) ?? fallback(sim, seat);
        if (!cmd || !sim.applyCommand(seat, cmd)) {
            const fb = fallback(sim, seat);
            if (!fb || !sim.applyCommand(seat, fb)) break;
        }
    }
}

// 先読みの続き：自分の手番を、あと depth 回だけ単純な方針で進める（ほかの人の手番は飛ばす）
// 「餌を取って、次の手番で鳥を出す」のような、手番をまたぐつながりを見るため。ラウンドをまたがない
function rollOwnTurns(sim, seat, depth) {
    for (let k = 0; k < depth; k++) {
        if (sim.isOver() || sim.players[seat].actions + 1 >= sim.turnsThisRound()) return;
        sim.turn = seat;
        sim.decision = { seat, kind: 'turn' };
        const cmd = simpleTurn(sim, seat, () => 1, PROFILES.normal);
        if (!cmd || !sim.applyCommand(seat, cmd)) return;
        finishTurn(sim, seat);
    }
}

function lookaheadTurn(game, seat, w = WEIGHTS, depth = 0) {
    const candidates = [...playCommands(game, seat), ...actionCommands(game, seat)];
    const seed = cpuSeed(game, seat);
    let best = null;
    let bestV = -Infinity;
    candidates.forEach((cmd, k) => {
        const sim = game.clone();
        // 山札の並びとこの先のサイコロは、CPU には分からないので混ぜ直す
        sim.rng = (seed + k * 7919) >>> 0;
        sim.shuffle(sim.deck);
        if (!sim.applyCommand(seat, cmd)) return;
        finishTurn(sim, seat);
        if (depth) rollOwnTurns(sim, seat, depth);
        let v = evaluate(sim, seat, w);
        // 行動は、少しだけ鳥を出すより後回し（同じくらいなら場を育てる）
        if (cmd.type === 'action') v -= 0.05;
        if (v > bestV) { bestV = v; best = cmd; }
    });
    return best;
}

function simpleTurn(game, seat, random, profile) {
    const p = game.players[seat];
    const plays = playCommands(game, seat);
    if (plays.length && random() > profile.blunder) {
        const value = (c) => birdOf(c.bird).points + powerValue(birdOf(c.bird)) * 2 - c.food.length * 0.5 - c.eggs.length * 0.8;
        return plays.reduce((a, b) => (value(b) > value(a) ? b : a));
    }
    const left = turnsLeft(game, seat);
    if (left <= 3 && game.eggRoom(seat) > 0) return { type: 'action', habitat: 'grassland' };
    if (p.hand.length < 2) return { type: 'action', habitat: 'wetland' };
    const need = foodNeeds(game, seat);
    if (FOODS.some(f => need[f] > 0) || random() < 0.5) return { type: 'action', habitat: 'forest' };
    return { type: 'action', habitat: game.eggRoom(seat) > 0 ? 'grassland' : 'wetland' };
}

// 準備：鳥と餌の残し方と、ボーナスカード（配られたものだけで決める。画面のおすすめにも使う）
export function suggestSetup(offer) {
    let best = null;
    let bestV = -Infinity;
    const birdSets = 1 << offer.birds.length;
    for (let mask = 0; mask < birdSets; mask++) {
        const birds = offer.birds.filter((_, i) => mask & (1 << i));
        const foodKeep = 5 - birds.length;
        // 残す餌：鳥の餌に要る種類から
        const want = Object.fromEntries(FOODS.map(f => [f, 0.1]));
        birds.forEach(id => {
            const b = birdOf(id);
            b.cost.items.forEach(f => { if (f !== 'any') want[f] += (1 + b.points * 0.2) / (b.cost.or ? b.cost.items.length : 1); });
        });
        const food = [...FOODS].sort((a, b) => want[b] - want[a]).slice(0, foodKeep);
        let v = food.length * 0.9;
        birds.forEach(id => {
            const b = birdOf(id);
            const n = b.cost.or ? 1 : b.cost.items.length;
            const playable = paymentOptions(b.cost, Object.fromEntries(FOODS.map(f => [f, food.includes(f) ? 1 : 0])), 1).length > 0;
            v += 0.45 + b.points * 0.18 + powerValue(b) * 1.4 - n * 0.25 + (playable ? 0.7 : 0);
        });
        if (v > bestV) { bestV = v; best = { birds, food }; }
    }
    const fake = { hand: best.birds, board: { forest: [], grassland: [], wetland: [] } };
    const bonus = [...offer.bonus].sort((a, b) => bonusSetupScore(b, fake) - bonusSetupScore(a, fake))[0];
    return { birds: best.birds, food: best.food, bonus };
}

function chooseSetup(game, seat) {
    return { type: 'setup', ...suggestSetup(game.players[seat].offer) };
}

function bonusSetupScore(id, player) {
    const card = bonusOf(id);
    const hits = player.hand.filter(h => card.count({ ...player, board: { forest: [{ bird: h, eggs: 1, cache: {}, tucked: 1 }], grassland: [], wetland: [] }, hand: [] }) > 0).length;
    const base = { visionary: 0.5, ecologist: 1, breeding: 1.5, oologist: 1.5, bander: 0.8 }[id] ?? 0;
    return hits + base;
}

// 先読みなしで、その場の見積もりで答える（手番の行動以外）
function decideQuick(game, seat) {
    const d = game.decision;
    if (!d || d.seat !== seat) return null;
    switch (d.kind) {
        case 'turn': return simpleTurn(game, seat, () => 1, PROFILES.normal);
        case 'food': return chooseDie(game, seat, d);
        case 'lay': return { type: 'lay', targets: layTargets(game, seat, d.n, d.only) };
        case 'draw': return chooseDraw(game, seat, d.n);
        case 'power': return choosePower(game, seat, d);
        case 'bonus': return { type: 'bonus', id: chooseBonus(game, seat, d.options) };
        case 'playExtra': {
            const plays = playCommands(game, seat, d.habitat);
            if (!plays.length) return { type: 'skip' };
            const value = (c) => birdOf(c.bird).points + powerValue(birdOf(c.bird)) * 2 - c.eggs.length * 0.7;
            return plays.reduce((a, b) => (value(b) > value(a) ? b : a));
        }
        default: return null;
    }
}

// 想定外のときの、いちばん単純な答え（必ず前に進む）
function fallback(game, seat) {
    const d = game.decision;
    if (game.phase === 'setup') {
        const offer = game.players[seat].offer;
        return { type: 'setup', birds: [], food: [...FOODS], bonus: offer.bonus[0] };
    }
    if (!d) return null;
    switch (d.kind) {
        case 'turn': return { type: 'action', habitat: 'forest' };
        case 'food': {
            const face = game.feeder[0];
            return { type: 'take', die: 0, ...(face === 'invseed' ? { as: 'inv' } : {}) };
        }
        case 'lay': return { type: 'lay', targets: layTargets(game, seat, d.n, d.only) };
        case 'draw': return { type: 'draw', tray: [], deck: d.n };
        case 'bonus': return { type: 'bonus', id: d.options[0] };
        default: return { type: 'skip' };
    }
}

export function chooseCpuCommand(game, seat, profile = PROFILES.normal) {
    const random = createRandom(cpuSeed(game, seat));
    if (game.phase === 'setup') return profile.random ? fallback(game, seat) : chooseSetup(game, seat);
    const d = game.decision;
    if (!d || d.seat !== seat) return null;
    if (profile.random) return randomCommand(game, seat, random);
    if (d.kind === 'turn') {
        if (profile.lookahead) return lookaheadTurn(game, seat, profile.w, profile.depth ?? 0) ?? simpleTurn(game, seat, random, profile);
        return simpleTurn(game, seat, random, profile);
    }
    return decideQuick(game, seat);
}

// でたらめな手（強さを測る比較用）
function randomCommand(game, seat, random) {
    const d = game.decision;
    if (d.kind === 'turn') {
        const all = [...playCommands(game, seat), ...HABITATS.map(h => ({ type: 'action', habitat: h }))];
        return all[Math.floor(random() * all.length)];
    }
    return decideQuick(game, seat);
}

// seat の CPU に1手打たせる。決めた手が断られたら、いちばん単純な答えで進める
export function runCpuStep(game, seat, profile = PROFILES.normal) {
    if (!game.actors().includes(seat)) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    const fb = fallback(game, seat);
    return !!fb && game.applyCommand(seat, fb);
}

export const _test = { evaluate, cardValue, foodNeeds, layTargets, chooseSetup, BONUS_CARDS };
