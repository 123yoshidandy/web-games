/**
 * CPU の手の選び方
 * - 手番の行動（置く・出す・季節の準備・終える）は、ゲームを写して実際に行い、そのあとの盤面を点数にして比べる
 *   写しでは山札を CPU 用の乱数で混ぜ直すので、次に引くカードをのぞかない
 * - 効果の途中の選択は、選択の種類（tag）ごとの決まりで選ぶ
 * - ゲームの乱数は使わない（記録の再現がずれないように）。迷いの揺らぎは、状態から作った別の乱数で出す
 *
 * 強さ
 * - normal（ふつう）：今の点・資源・手札・ワーカーだけを見る。評価に揺らぎがある
 * - strong（強い）：さらに、残りの生産の回数・行事の達成・無料で出せる住民・目的地の使い道まで見る
 */

import { CARDS, RESOURCES, BASIC_LOCATIONS, FOREST_LOCATIONS, BASIC_EVENTS, SPECIAL_EVENTS } from './cards.js';
import { HAND_LIMIT } from './game.js';
import { createRandom, shuffle } from './random.js';

export const LEVELS = { normal: 'ふつう', strong: '強い' };
export const PROFILES = {
    random: { random: true },
    normal: { noise: 2.5, resK: 1, handK: 1, workerK: 2.2 },
    strong: { noise: 0.15, resK: 1.2, handK: 1, workerK: 3, prodK: 0.4, destK: 0.5, hostK: 1, eventK: 1.5, width: 6 }
};

const RES_BASE = { twig: 1, resin: 1.15, pebble: 1.3, berry: 1 };
const MAX_PROMPT_STEPS = 80;

export function cpuActors(game) {
    return game.actors().filter(seat => game.players[seat].isCPU);
}

// 1手進める。進めたら true
export function runCpuStep(game, seat, profile = PROFILES.strong) {
    if (game.isOver()) return false;
    if (game.prompt) {
        if (game.prompt.player !== seat) return false;
        const values = answerPrompt(game, seat, game.prompt, profile);
        if (game.applyCommand(seat, { type: 'answer', id: game.prompt.id, values })) return true;
        // 決まりの答えが断られたら、最小の答えで進める
        const p = game.prompt;
        return game.applyCommand(seat, { type: 'answer', id: p.id, values: p.options.slice(0, p.min).map(o => o.value) });
    }
    if (game.turn !== seat) return false;
    const command = chooseAction(game, seat, profile);
    if (command && game.applyCommand(seat, command)) return true;
    // 選んだ手が断られたら、いちばん単純な手で進める
    const fallback = legalActions(game, seat);
    return fallback.some(c => game.applyCommand(seat, c));
}

// 手番でできる行動の一覧
export function legalActions(game, seat) {
    const p = game.players[seat];
    const out = [];
    if (game.canPrepare(p)) out.push({ type: 'prepare' });
    game.allLocations(p).forEach(loc => { if (game.checkPlace(p, loc) === null) out.push({ type: 'place', loc }); });
    const seen = new Set();
    game.playOptions(seat).forEach(o => {
        const key = `${o.source}:${o.id}:${o.method}:${o.target}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ type: 'play', source: o.source, index: o.index, method: o.method, ...(o.target !== undefined ? { target: o.target } : {}) });
    });
    if (p.season === 3) out.push({ type: 'pass' });
    return out;
}

// CPU だけの乱数（ゲームの状態から作る）
function cpuRandom(game, seat, salt = 0) {
    return createRandom((game.options.seed ^ Math.imul(game.commands.length + 1, 2654435761) ^ Math.imul(seat + 1, 40503) ^ salt) >>> 0);
}

function chooseAction(game, seat, profile) {
    const actions = legalActions(game, seat);
    if (actions.length === 0) return null;
    const rand = cpuRandom(game, seat);
    if (profile.random) return actions[Math.floor(rand() * actions.length)];
    let tried = actions.map((action, i) => {
        const sim = simulate(game, seat, action, profile, i);
        return { action, sim, value: sim ? evaluate(sim, seat, profile) : -Infinity };
    });
    // 先読み：よさそうな手だけ、自分の次の1手まで試す（相手の手番は飛ばす）
    if (profile.width) {
        tried = tried.sort((a, b) => b.value - a.value).slice(0, profile.width).map((t, k) => ({ ...t, value: followUp(t, seat, profile, k) }));
    }
    let best = null;
    let bestValue = -Infinity;
    tried.forEach(({ action, value }) => {
        const v = value + (rand() - 0.5) * 2 * profile.noise;
        if (v > bestValue) {
            bestValue = v;
            best = action;
        }
    });
    return best;
}

function followUp({ sim, value }, seat, profile, k) {
    if (!sim || sim.isOver() || sim.players[seat].passed || sim.prompt) return value;
    sim.turn = seat;
    let best = value;
    legalActions(sim, seat).forEach((action, i) => {
        if (action.type === 'pass') return;
        const next = simulate(sim, seat, action, profile, 1000 * (k + 1) + i);
        if (next) best = Math.max(best, evaluate(next, seat, profile));
    });
    return best;
}

// 写しで行動を試し、そのあとの写しを返す（できなければ null）
function simulate(game, seat, action, profile, salt) {
    const sim = game.clone();
    shuffle(sim.deck, cpuRandom(game, seat, 7777 + salt));
    if (!sim.applyCommand(seat, action)) return null;
    let steps = 0;
    while (sim.prompt && sim.prompt.player === seat && steps++ < MAX_PROMPT_STEPS) {
        const values = answerPrompt(sim, seat, sim.prompt, profile);
        if (!sim.applyCommand(seat, { type: 'answer', id: sim.prompt.id, values })) break;
    }
    return sim;
}

// ---- 盤面の評価 ----

const remainingProductions = (season) => (season === 0 ? 2 : season < 3 ? 1 : 0);

// 緑のカードが1回の生産で生むもののおおよその値打ち
function yieldOf(game, p, c) {
    const farms = p.city.filter(x => x.id === 'farm').length;
    switch (c.id) {
        case 'farm': return 1;
        case 'twigBarge': return 1.8;
        case 'resinRefinery': return 1.15;
        case 'mine': return 1.3;
        case 'generalStore': return farms ? 2 : 1;
        case 'fairgrounds': return 1.4;
        case 'storehouse': return 2.2;
        case 'husband': return c.paired && farms ? 1.1 : 0;
        case 'bargeToad': return 1.8 * farms;
        case 'chipSweep': return 1.2;
        case 'minerMole': return 1.1;
        case 'woodcarver': return 1.2;
        case 'peddler': return 0.3;
        case 'doctor': return 1.5;
        case 'teacher': return 0.9;
        case 'monk': return 1.6;
        default: return 0;
    }
}

function evaluate(game, seat, profile) {
    const p = game.players[seat];
    const score = game.scoreOf(seat);
    if (game.isOver() || p.passed) return score.total;
    const available = game.available(p);
    const finishing = p.season === 3 && available === 0;
    const resW = finishing ? 0.15 : [1, 0.95, 0.85, 0.6][p.season];
    const handW = finishing ? 0.1 : [0.85, 0.8, 0.7, 0.4][p.season];
    let v = score.total;
    RESOURCES.forEach(r => {
        const n = p.res[r];
        v += profile.resK * resW * RES_BASE[r] * (Math.min(n, 6) + Math.max(0, n - 6) * 0.4);
    });
    const room = p.hand.length;
    v += profile.handK * handW * Math.min(room, HAND_LIMIT);
    v += available * profile.workerK * resW;
    // 街の枠：空きが少ないのに安いカードで埋めるのを嫌う
    const slotsLeft = 15 - game.slotsUsed(p);
    if (slotsLeft < 0) v -= 10;
    const { prodK = 0, destK = 0, hostK = 0, eventK = 0 } = profile;

    const remaining = remainingProductions(p.season);
    p.city.forEach(c => {
        if (CARDS[c.id].type === 'prod') v += prodK * remaining * yieldOf(game, p, c);
        if (c.id === 'storehouse' && c.res) v += prodK * RESOURCES.reduce((s, r) => s + c.res[r] * RES_BASE[r], 0);
    });
    // 目的地のカード：使える季節が残っているほど値打ちがある
    const seasonsLeft = 3 - p.season + (available > 0 ? 1 : 0);
    p.city.forEach(c => {
        if (CARDS[c.id].spot && !CARDS[c.id].permanent && c.id !== 'storehouse') v += destK * Math.min(2, seasonsLeft);
    });
    // 無料で出せる住民
    const hosts = p.city.filter(c => !c.occupied && CARDS[c.id].pairs);
    hosts.forEach(c => {
        const pairs = CARDS[c.id].pairs;
        const inHand = p.hand.some(id => pairs.includes(id) || (pairs[0] === '*' && CARDS[id].kind === 'critter'));
        if (inHand) v += hostK * (1.2 * handW + 0.3);
    });
    // 行事
    const counts = game.typeCounts(p);
    BASIC_EVENTS.forEach(e => {
        if (game.claimed[e.id] !== undefined) return;
        const missing = e.need - counts[e.type];
        // 達成できる状態には足さない（足すと、達成したときに点が減って見え、取らなくなる）
        if (missing === 1) v += eventK * 0.6;
    });
    game.specials.forEach(id => {
        if (game.claimed[id] !== undefined) return;
        const ev = SPECIAL_EVENTS.find(e => e.id === id);
        if (ev.needsTypes) return;
        const have = ev.needs.filter(n => game.has(p, n)).length;
        if (have === 1 && ev.needs.some(n => p.hand.includes(n))) v += eventK * 0.8;
    });
    return v;
}

// ---- 選択の答え方 ----

// 欲しい資源の度合い（手札と草原のカードの費用に足りない分を重く見る）
function desire(game, p) {
    const need = { twig: 0, resin: 0, pebble: 0, berry: 0 };
    const ids = [...p.hand, ...game.meadow.filter(Boolean)];
    ids.forEach(id => {
        const cost = CARDS[id].cost;
        const weight = 0.3 + Math.max(0, CARDS[id].points) * 0.1;
        RESOURCES.forEach(r => { need[r] += Math.max(0, (cost[r] ?? 0) - p.res[r]) * weight; });
    });
    const out = {};
    RESOURCES.forEach(r => { out[r] = RES_BASE[r] + Math.min(1.5, need[r] * 0.25) - 0.08 * p.res[r]; });
    return out;
}

// カードの値打ち（出したときのおおよその点）
function cardValue(game, p, id) {
    const def = CARDS[id];
    if (game.targetsFor(p, id).length === 0) return -1;
    let v = def.points;
    if (def.type === 'prod') v += 1.1 * (remainingProductions(p.season) + 1);
    if (def.type === 'pros') v += 2;
    if (def.type === 'dest' || def.type === 'gov') v += 1;
    if (def.type === 'trav') v += 0.8;
    if (def.kind === 'critter' && game.occupyHost(p, id)) v += 1.5;
    if (id === 'fool') v += 1;
    return v;
}

// 手札に残す値打ち（低いものから捨てる）
const keepValue = (game, p, id) => 0.4 + 0.12 * cardValue(game, p, id) - 0.05 * Object.values(CARDS[id].cost).reduce((s, n) => s + n, 0);

// 場所の効果のおおよその値打ち
function locValue(game, p, loc) {
    const want = desire(game, p);
    const def = [...BASIC_LOCATIONS, ...FOREST_LOCATIONS].find(l => l.id === loc);
    if (!def) return 0;
    let v = 0;
    Object.entries(def.gain ?? {}).forEach(([r, n]) => { v += want[r] * n; });
    if (def.any) v += def.any * 1.3;
    if (def.cards) v += Math.min(def.cards, HAND_LIMIT - p.hand.length) * 0.7;
    if (def.points) v += def.points;
    if (def.text) v += 1.5;
    return v;
}

const scoreNow = (game, seat) => game.scoreOf(seat).total;

export function answerPrompt(game, seat, prompt, profile = PROFILES.strong) {
    const p = game.players[seat];
    const { options, min, max, tag } = prompt;
    const pick = (scoreFn, { count = min, positiveOnly = false } = {}) => {
        const ranked = options.map(o => ({ o, s: scoreFn(o) })).sort((a, b) => b.s - a.s);
        let chosen = ranked.slice(0, Math.max(min, Math.min(max, count)));
        if (positiveOnly) chosen = ranked.filter((x, i) => i < min || (x.s > 0 && i < max));
        return chosen.map(x => x.o.value);
    };
    const number = (n) => {
        const best = options.reduce((a, b) => (Math.abs(b.n - n) < Math.abs(a.n - n) ? b : a));
        return [best.value];
    };
    if (profile.random) {
        const rand = cpuRandom(game, seat, prompt.id);
        return [...options].sort(() => rand() - 0.5).slice(0, min).map(o => o.value);
    }
    const want = desire(game, p);
    const late = p.season === 3;
    switch (tag) {
        case 'gain': return pick(o => want[o.res]);
        case 'pay': return pick(o => -want[o.res]);
        case 'storehouse': return pick(o => want[o.res] * o.n);
        case 'pay-points': {
            const res = prompt.title.startsWith('木彫り師') ? 'twig' : 'berry';
            return number(late ? 3 : Math.max(0, p.res[res] - 2));
        }
        case 'peddler': {
            const surplus = RESOURCES.reduce((s, r) => s + Math.max(0, p.res[r] - 3), 0);
            return number(Math.min(2, surplus));
        }
        case 'monk':
        case 'event-place':
        case 'event-give':
            return number(99);
        case 'opponent':
        case 'give': {
            // 渡すものは、いちばん点の低い相手に
            return pick(o => -scoreNow(game, o.seat));
        }
        case 'fool': return pick(o => scoreNow(game, o.seat));
        case 'journey':
        case 'give-cards':
            return pick(o => -keepValue(game, p, o.card), { count: min });
        case 'discard-points': return pick(o => 1 - keepValue(game, p, o.card) - (late ? 0.5 : 0), { positiveOnly: true });
        case 'discard-gain': return pick(o => 1.1 - keepValue(game, p, o.card), { positiveOnly: true });
        case 'discard-draw':
        case 'discard-refill':
            return pick(o => 0.75 - keepValue(game, p, o.card), { positiveOnly: true });
        case 'discard-gain2': {
            const chosen = pick(o => 0.65 - keepValue(game, p, o.card), { positiveOnly: true });
            return chosen.slice(0, chosen.length - (chosen.length % 2));
        }
        case 'event-cards': return pick(o => 2 - cardValue(game, p, o.card) * 0.5, { positiveOnly: true });
        case 'event-city': return pick(o => 3 - CARDS[o.card].points - (o.card === 'wife' ? 3 : 0), { positiveOnly: true });
        case 'free-play':
        case 'queen':
        case 'inn':
        case 'discount-play':
            return pick(o => cardValue(game, p, o.card) - (o.cost ? RESOURCES.reduce((s, r) => s + o.cost[r] * RES_BASE[r], 0) * 0.6 : 0) + 0.01,
                { positiveOnly: min === 0 });
        case 'meadow-take':
        case 'teacher-keep':
            return pick(o => keepValue(game, p, o.card), { count: max });
        case 'meadow-discard': return pick(o => -cardValue(game, p, o.card));
        case 'ruins': return pick(o => -CARDS[o.card].points + Object.values(CARDS[o.card].cost).reduce((s, n) => s + n, 0) * 0.3);
        case 'university': return pick(o => -CARDS[o.card].points + Object.values(CARDS[o.card].cost).reduce((s, n) => s + n, 0) * 0.4);
        case 'copy-prod': return pick(o => {
            const found = game.players.flatMap(x => x.city).find(c => String(c.uid) === o.value);
            return found ? yieldOf(game, p, found) : 0;
        });
        case 'copy-basic':
        case 'lookout':
        case 'ranger-to':
            return pick(o => (o.loc && !o.loc.startsWith('card-') ? locValue(game, p, o.loc) : 1));
        case 'clock': return pick(o => locValue(game, p, o.loc) - 1.2, { positiveOnly: true });
        case 'cemetery': return ['deck'];
        case 'recall': return options.length ? [options[0].value] : [];
        default:
            return options.slice(0, Math.max(min, 0)).map(o => o.value);
    }
}
