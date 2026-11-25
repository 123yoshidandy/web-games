/**
 * CPU のプレイヤー。その席のビュー（createGameView）だけを見て決める（game の中はのぞかない）
 * ビューにあるのは、全員に公開されている情報（場・各人の資源と道具・山の枚数・建物の山の表）と、自分が伏せて取ったカードだけ
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、状態から作ったハッシュで出す
 *
 * ふつう：場所ごとに「得られるものの見込みの価値（点に換算）」を見積もって選ぶ
 * - 1人で使う場所（文明カード・建物・畑・道具作り・小屋）に、見合う価値があれば先に置く
 * - なければ、食べさせる分の食料が足りないときは狩り場、足りていれば資源の場所に残りを置く
 * - 行動は、道具作り → 畑 → 小屋 → 道具のカード → サイコロの場所 → 建物 → 文明カードの順に使う
 * やさしい：見積もりに大きな迷いを足し、人数もばらばらに置く。道具はあるだけ使い、食料の備えも甘い
 */

import {
    CIV_CARDS, BUILDINGS, RESOURCES, RESOURCE_VALUE, GATHER, RESOURCE_SPOTS, DIE_REWARD,
    MAX_PEOPLE, MAX_AGRI, MAX_TOOL_TILES, MAX_TOOL_VALUE, STARVE_PENALTY,
    resourceCount, buildingPoints, normalizePay
} from './cards.js';
import { cultureScore, multiplierCounts, toolTotal } from './scoring.js';
import { createGameView } from './game-view.js';

export const CPU_LEVELS = ['easy', 'normal'];

// 資源1つの価値（建物で点に変わる分を、少し割り引いて見る）
const UNIT = { wood: 2, clay: 2.6, stone: 3.2, gold: 3.9 };
const GATHER_RESOURCE = { forest: 'wood', clay: 'clay', quarry: 'stone', river: 'gold' };
// これ以上持っている資源は、使い道が少ない（終わりの1点に近い）と見る
const PLENTY = 8;
const worth = (res, r) => (res[r] >= PLENTY ? 1.1 : UNIT[r]);

// ---- 迷い（ゲームの乱数を使わない） ----

function hash(...values) {
    let h = 2166136261 >>> 0;
    values.forEach(v => {
        h ^= v >>> 0;
        h = Math.imul(h, 16777619) >>> 0;
        h ^= h >>> 13;
    });
    h = Math.imul(h ^ (h >>> 16), 2246822507) >>> 0;
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

const noise = (v, seat, k) => hash(v.commandCount, v.round, seat, k);

// ---- 番 ----

export function isCpuTurn(game) {
    return game.actors().some(seat => game.players[seat].isCPU);
}

export function nextCpuSeat(game) {
    return game.actors().find(seat => game.players[seat].isCPU) ?? null;
}

// CPU の番なら1手打つ。CPU にはその席のビューだけを渡す。打った操作を返す（打てなければ null）
export function runCpuStep(game) {
    const seat = nextCpuSeat(game);
    if (seat === null) return null;
    const level = game.players[seat].cpuLevel ?? 'normal';
    // 記録（ログ）は判断に使わないので入れない
    const view = createGameView(game, seat, { since: game.logs.length, events: false });
    let command = null;
    try {
        command = chooseCommand(view, level);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return command;
    // 思わぬことで通らなければ、いちばん単純な答えで進める
    for (const fallback of fallbackCommands(view)) {
        if (game.applyCommand(seat, fallback)) return fallback;
    }
    return null;
}

export function fallbackCommands(view) {
    const pending = view.pending;
    if (pending?.kind === 'tools') return [{ type: 'tools', tools: [], oneUse: [] }];
    if (pending?.kind === 'civ' || pending?.kind === 'building') return [{ type: 'decline' }];
    if (pending?.kind === 'dice') return [{ type: 'pickDie', die: 0 }];
    if (pending?.kind === 'feed') return [{ type: 'feed', pay: null }];
    if (view.phase === 'place') return view.placements.map(({ place, count }) => ({ type: 'place', place, count }));
    if (view.phase === 'action') return Object.keys(view.placed[view.you]).map(place => ({ type: 'resolve', place }));
    return [];
}

// view：その席のビュー（view.you が CPU の席）
export function chooseCommand(view, level = 'normal') {
    const pending = view.pending;
    const ctx = makeContext(view, level);
    if (pending?.kind === 'tools') return chooseTools(ctx, pending);
    if (pending?.kind === 'civ') return choosePayCiv(ctx, pending);
    if (pending?.kind === 'building') return choosePayBuilding(ctx, pending);
    if (pending?.kind === 'dice') return choosePickDie(ctx, pending);
    if (pending?.kind === 'feed') return chooseFeed(ctx, pending);
    if (view.phase === 'place') return choosePlacement(ctx);
    if (view.phase === 'action') return chooseResolve(ctx);
    return null;
}

// ---- 見積もり ----

function makeContext(view, level) {
    const seat = view.you;
    const p = view.players[seat];
    // 残りのラウンドの見込み（文明カードは1ラウンドに3枚ほど減る。建物の山は1ラウンドに1枚ほど減る）
    const byCards = Math.floor(view.civDeckCount / 3) + 1;
    const byStacks = Math.min(...view.stacks.map(s => s.count)) + 1;
    const rounds = Math.max(1, Math.min(byCards, byStacks));
    const mults = multiplierCounts(p.cards);
    // ふつうは20ラウンドもかからない。長引いたら、払えるカードと建物は必ず取って終わらせる
    const hurry = view.round > 30;
    return { view, seat, p, level, rounds, mults, easy: level === 'easy', hurry };
}

// 食料の価値：この先の食べさせる分に足りないうちは高い
function foodValue(ctx, n) {
    const { p } = ctx;
    const need = Math.max(0, Math.ceil((p.people - p.agri) * 1.5) - p.food);
    const urgent = Math.min(n, need);
    return urgent * 1.7 + (n - urgent) * 0.5;
}

function unitValue(ctx, resource, n = 1) {
    if (resource === 'food') return foodValue(ctx, n);
    return worth(ctx.p.res, resource) * n;
}

const toolValue = (ctx) => {
    const { p } = ctx;
    if (p.tools.length >= MAX_TOOL_TILES && Math.min(...p.tools) >= MAX_TOOL_VALUE) return 0;
    return ctx.rounds * 0.8 + ctx.mults.toolmaker;
};
const agriValue = (ctx) => (ctx.p.agri >= MAX_AGRI ? 0 : ctx.rounds * 1.0 + ctx.mults.farmer);
const hutValue = (ctx) => (ctx.p.people >= MAX_PEOPLE ? 0 : Math.max(0, ctx.rounds - 1) * 1.6 - ctx.rounds * 0.6 + ctx.mults.shaman);

// 文明カードの下半分の価値
function bottomValue(ctx, card) {
    const { p, rounds } = ctx;
    if (card.bottom.culture) {
        const gain = cultureScore([...p.cards, card.id]) - cultureScore(p.cards);
        return gain + (gain > 1 ? 1.5 : 0.5);
    }
    const base = {
        farmer: p.agri + rounds * 0.3,
        toolmaker: toolTotal(p) + rounds * 0.4,
        builder: p.buildings.length + rounds * 0.5,
        shaman: p.people + rounds * 0.2
    }[card.bottom.mult];
    return card.bottom.n * base;
}

function topValue(ctx, card) {
    const top = card.top;
    switch (top.kind) {
        case 'diceAll': return 3;
        case 'food': return foodValue(ctx, top.n);
        case 'res': return unitValue(ctx, top.res, top.n);
        case 'resDice': return unitValue(ctx, top.res, (7 + toolTotal(ctx.p) * 0.5) / RESOURCE_VALUE[top.res]);
        case 'points': return top.n;
        case 'tool': return toolValue(ctx);
        case 'agri': return agriValue(ctx);
        case 'extra': return 3.5;
        case 'oneUse': return top.n * 0.8;
        case 'choice2': return 7;
        default: return 0;
    }
}

export const cardValue = (ctx, card) => topValue(ctx, card) + bottomValue(ctx, card);

// 安い順（たくさん持っている資源から）に n 個を払う（reserve の分は、なるべく残す）
function cheapestPay(res, n, reserve = {}) {
    const pay = { wood: 0, clay: 0, stone: 0, gold: 0 };
    const order = [...RESOURCES].sort((a, b) => worth(res, a) - worth(res, b));
    let left = n;
    for (const pass of [0, 1]) {
        for (const r of order) {
            const free = pass === 0 ? Math.max(0, res[r] - (reserve[r] ?? 0)) : res[r] - pay[r];
            const take = Math.min(free, left);
            pay[r] += take;
            left -= take;
        }
    }
    return left > 0 ? null : pay;
}

const payValue = (pay, res) => RESOURCES.reduce((s, r) => s + pay[r] * worth(res, r), 0);

// 建物の一番よい払い方（得る点が一番大きいもの）。払えなければ null
export function bestBuildingPay(building, res, reserve = {}) {
    if (building.kind === 'fixed') {
        return RESOURCES.every(r => res[r] >= (building.cost[r] ?? 0)) ? normalizePay(building.cost) : null;
    }
    const avail = Object.fromEntries(RESOURCES.map(r => [r, Math.max(0, res[r] - (building.kind === 'any' ? (reserve[r] ?? 0) : 0))]));
    if (building.kind === 'any') {
        // 値の高い資源から7つまで
        const pay = { wood: 0, clay: 0, stone: 0, gold: 0 };
        let left = building.max;
        [...RESOURCES].reverse().forEach(r => {
            const take = Math.min(avail[r], left);
            pay[r] = take;
            left -= take;
        });
        return resourceCount(pay) >= building.min ? pay : null;
    }
    let best = null;
    let bestPoints = -1;
    const search = (i, left, pay) => {
        if (i === RESOURCES.length) {
            if (left !== 0) return;
            const points = buildingPoints(building, pay);
            if (points !== null && points > bestPoints) {
                bestPoints = points;
                best = { ...pay };
            }
            return;
        }
        const r = RESOURCES[i];
        for (let k = 0; k <= Math.min(left, res[r]); k++) search(i + 1, left - k, { ...pay, [r]: k });
    };
    search(0, building.n, {});
    return best ? normalizePay(best) : null;
}

// 建物の価値（得る点から、払う資源の価値を引く）
function buildingValue(ctx, building, res = ctx.p.res) {
    const pay = bestBuildingPay(building, res);
    if (!pay) return null;
    const points = buildingPoints(building, pay);
    return points - payValue(pay, res) * 0.55 + ctx.mults.builder + 1;
}

// ---- 置く ----

function choosePlacement(ctx) {
    const { view, seat, p, easy } = ctx;
    const legal = view.placements;
    // 食べさせる分の食料を狩り場で得るのに要る人数は、1人の場所に使わずに残す
    const huntNeed = !easy && !view.placed[seat].hunt ? huntCount(p) : 0;
    const singles = [];
    legal.forEach(({ place, count }) => {
        if (GATHER[place] || p.available - count < huntNeed) return;
        const value = singleValue(ctx, place);
        if (value === null) return;
        const k = singles.length;
        singles.push({ place, count, value: value + (easy ? (noise(view, seat, k) - 0.5) * 12 : 0) });
    });
    singles.sort((a, b) => b.value - a.value);
    const threshold = ctx.hurry ? -Infinity : easy ? 2 : 2.5;
    if (singles.length && singles[0].value >= threshold) return { type: 'place', place: singles[0].place, count: singles[0].count };

    const can = (place, count) => legal.some(l => l.place === place && l.count === count);
    const maxCount = (place) => Math.max(0, ...legal.filter(l => l.place === place).map(l => l.count));
    if (easy) {
        const spots = ['hunt', ...RESOURCE_SPOTS].filter(s => maxCount(s) > 0);
        if (spots.length) {
            const spot = spots[Math.floor(noise(view, seat, 99) * spots.length)];
            const count = 1 + Math.floor(noise(view, seat, 98) * maxCount(spot));
            return { type: 'place', place: spot, count };
        }
    } else {
        // 食料が足りなくなりそうなら、狩り場に足りる分だけ
        if (huntNeed > 0 && maxCount('hunt') > 0) {
            return { type: 'place', place: 'hunt', count: Math.min(maxCount('hunt'), huntNeed) };
        }
        // 資源の場所のうち、1人あたりの価値が高いところに、置ける分だけ
        const tools = p.tools.reduce((s, v, i) => s + (p.toolsUsed[i] ? 0 : v), 0);
        const needs = resourceNeeds(ctx);
        let best = null;
        RESOURCE_SPOTS.forEach(spot => {
            const max = maxCount(spot);
            if (!max) return;
            const r = GATHER_RESOURCE[spot];
            const div = GATHER[spot].divisor;
            const count = Math.min(max, p.available);
            const units = Math.max(0, (3.5 * count + tools - (div - 1) / 2) / div);
            const value = units * (worth(p.res, r) + Math.min(1.5, needs[r] * 0.75)) / count;
            if (!best || value > best.value) best = { spot, count, value };
        });
        const huntPer = foodValue(ctx, 1.75 * p.available) / Math.max(1, p.available);
        if (best && best.value >= huntPer) return { type: 'place', place: best.spot, count: best.count };
        if (maxCount('hunt') > 0) return { type: 'place', place: 'hunt', count: maxCount('hunt') };
        if (best) return { type: 'place', place: best.spot, count: best.count };
    }
    if (singles.length) return { type: 'place', place: singles[0].place, count: singles[0].count };
    const first = legal[0];
    return first ? { type: 'place', place: first.place, count: can(first.place, first.count) ? first.count : 1 } : null;
}

// 食料が足りなくなりそうなとき、狩り場に置く人数（足りていれば0）
function huntCount(p) {
    const need = (p.people - p.agri) * 1.4 - p.food;
    return need > 0 ? Math.max(1, Math.ceil((need * 2 + 1) / 3.5)) : 0;
}

// 見えている建物を建てるのに足りない資源
function resourceNeeds(ctx) {
    const { view, p } = ctx;
    const needs = { wood: 0, clay: 0, stone: 0, gold: 0 };
    view.stacks.forEach(stack => {
        const b = stack.top !== null ? BUILDINGS[stack.top] : null;
        if (b?.kind === 'count') {
            // 種類が足りなければ、持っていない資源を1つずつ
            const lacking = RESOURCES.filter(r => p.res[r] === 0);
            const short = b.kinds - (RESOURCES.length - lacking.length);
            if (short > 0 && short <= 2) lacking.forEach(r => { needs[r] = Math.max(needs[r], 1); });
            return;
        }
        if (b?.kind !== 'fixed') return;
        const missing = RESOURCES.map(r => Math.max(0, (b.cost[r] ?? 0) - p.res[r]));
        if (missing.reduce((s, k) => s + k, 0) > 2) return;
        RESOURCES.forEach((r, i) => { needs[r] = Math.max(needs[r], missing[i]); });
    });
    return needs;
}

// 1人で使う場所の価値（使えない、意味がないなら null）
function singleValue(ctx, place) {
    const { view, p } = ctx;
    if (place === 'field') return agriValue(ctx) || null;
    if (place === 'toolmaker') return toolValue(ctx) || null;
    if (place === 'hut') {
        const v = hutValue(ctx);
        return v > 0 ? v - 1.5 : null;  // 2人を使う分を引く
    }
    // ほかに置いた文明カード・建物の支払いの分は、もう使ったものとして見る
    const committed = committedCost(ctx);
    const res = Object.fromEntries(RESOURCES.map(r => [r, Math.max(0, p.res[r] - (committed.reserve[r] ?? 0))]));
    const spare = resourceCount(res) - committed.any + 2 * p.choice2.length;
    if (place.startsWith('civ')) {
        const slot = Number(place.slice(3));
        const cost = slot + 1;
        if (spare < cost) return null;
        const card = CIV_CARDS[view.civSlots[slot]];
        const pay = cheapestPay(res, Math.min(cost, resourceCount(res))) ?? { wood: cost, clay: 0, stone: 0, gold: 0 };
        return cardValue(ctx, card) - payValue(pay, res) * 0.8;
    }
    const stack = view.stacks[Number(place.slice(3))];
    const value = buildingValue(ctx, BUILDINGS[stack.top], res);
    return value === null ? null : value;
}

// すでに置いた文明カードと建物で払う予定の資源
function committedCost(ctx) {
    const { view, seat } = ctx;
    const reserve = { wood: 0, clay: 0, stone: 0, gold: 0 };
    let any = 0;
    Object.keys(view.placed[seat]).forEach(place => {
        if (place.startsWith('civ')) any += Number(place.slice(3)) + 1;
        if (place.startsWith('bld')) {
            const b = BUILDINGS[view.stacks[Number(place.slice(3))].top];
            if (b.kind === 'fixed') RESOURCES.forEach(r => { reserve[r] += b.cost[r] ?? 0; });
            else any += b.kind === 'count' ? b.n : 1;
        }
    });
    return { reserve, any };
}

// ---- 行動する ----

function chooseResolve(ctx) {
    const { view, seat, p } = ctx;
    if (p.choice2.length) return { type: 'choice2', take: choice2Take(ctx) };
    const places = Object.keys(view.placed[seat]);
    const rank = (place) => {
        if (place === 'toolmaker') return 0;
        if (place === 'field') return 1;
        if (place === 'hut') return 2;
        if (place.startsWith('civ')) {
            const kind = CIV_CARDS[view.civSlots[Number(place.slice(3))]]?.top.kind;
            return kind === 'tool' || kind === 'oneUse' ? 3 : 7;
        }
        if (GATHER[place]) return 4 + (place === 'hunt' ? 0 : 0.1 * RESOURCE_SPOTS.indexOf(place));
        return 6;
    };
    places.sort((a, b) => rank(a) - rank(b));
    return { type: 'resolve', place: places[0] };
}

// 好きな資源2つ：見えている建物に足りないものか、なければ金
function choice2Take(ctx) {
    const needs = resourceNeeds(ctx);
    const take = { wood: 0, clay: 0, stone: 0, gold: 0 };
    let left = 2;
    [...RESOURCES].reverse().forEach(r => {
        const k = Math.min(left, needs[r]);
        take[r] += k;
        left -= k;
    });
    take.gold += left;
    return take;
}

// まだ使っていない建物の場所で払う分は、文明カードの支払いで残す
function reserveForBuildings(ctx) {
    const { view, seat } = ctx;
    const reserve = { wood: 0, clay: 0, stone: 0, gold: 0 };
    Object.keys(view.placed[seat]).filter(place => place.startsWith('bld')).forEach(place => {
        const b = BUILDINGS[view.stacks[Number(place.slice(3))].top];
        const pay = bestBuildingPay(b, ctx.p.res);
        if (pay) RESOURCES.forEach(r => { reserve[r] += pay[r]; });
    });
    return reserve;
}

function choosePayCiv(ctx, pending) {
    const { view, p, easy } = ctx;
    if (resourceCount(p.res) < pending.cost) {
        return p.choice2.length ? { type: 'choice2', take: choice2Take(ctx) } : { type: 'decline' };
    }
    const card = CIV_CARDS[view.civSlots[pending.slot]];
    const pay = cheapestPay(p.res, pending.cost, reserveForBuildings(ctx));
    if (!pay) return { type: 'decline' };
    const gain = cardValue(ctx, card) - payValue(pay, p.res) * 0.8 + (easy ? 2 : 0);
    return gain >= 0 || ctx.hurry ? { type: 'pay', pay } : { type: 'decline' };
}

function choosePayBuilding(ctx, pending) {
    const { view, p } = ctx;
    const building = BUILDINGS[view.stacks[pending.stack].top];
    const pay = bestBuildingPay(building, p.res);
    if (pay) return { type: 'pay', pay };
    if (p.choice2.length) {
        // 足りない分を好きな資源2つで補えるなら使う
        const take = { wood: 0, clay: 0, stone: 0, gold: 0 };
        if (building.kind === 'fixed') {
            let left = 2;
            RESOURCES.forEach(r => {
                const k = Math.min(left, Math.max(0, (building.cost[r] ?? 0) - p.res[r]));
                take[r] += k;
                left -= k;
            });
            take.gold += left;
        } else take.gold = 2;
        const after = Object.fromEntries(RESOURCES.map(r => [r, p.res[r] + take[r]]));
        if (bestBuildingPay(building, after)) return { type: 'choice2', take };
    }
    return { type: 'decline' };
}

function chooseTools(ctx, pending) {
    const { p, easy, view, seat } = ctx;
    const tiles = p.tools.map((v, i) => ({ i, v })).filter(t => !p.toolsUsed[t.i]);
    const cards = p.oneUse.map(id => ({ id, v: CIV_CARDS[id].top.n }));
    if (easy) return { type: 'tools', tools: tiles.map(t => t.i), oneUse: [] };
    // 残りのサイコロの場所があれば、道具を取っておく価値がある
    const moreRolls = Object.keys(view.placed[seat]).some(place => GATHER[place]);
    let best = null;
    const n = tiles.length + cards.length;
    for (let mask = 0; mask < 1 << n; mask++) {
        let added = 0;
        let cost = 0;
        const useTiles = [];
        const useCards = [];
        for (let b = 0; b < n; b++) {
            if (!(mask & (1 << b))) continue;
            if (b < tiles.length) {
                added += tiles[b].v;
                useTiles.push(tiles[b].i);
                cost += moreRolls ? 0.25 * tiles[b].v : 0.01;
            } else {
                const card = cards[b - tiles.length];
                added += card.v;
                useCards.push(card.id);
                cost += card.v * 0.8;
            }
        }
        const units = Math.floor((pending.sum + added) / pending.divisor);
        const value = unitValue(ctx, pending.resource, units) - cost;
        if (!best || value > best.value + 1e-9) best = { value, tools: useTiles, oneUse: useCards };
    }
    return { type: 'tools', tools: best.tools, oneUse: best.oneUse };
}

function choosePickDie(ctx, pending) {
    const { easy, view, seat } = ctx;
    if (easy) return { type: 'pickDie', die: Math.floor(noise(view, seat, 7) * pending.dice.length) };
    let best = 0;
    let bestValue = -Infinity;
    pending.dice.forEach((d, i) => {
        const reward = DIE_REWARD[d];
        const value = reward === 'tool' ? toolValue(ctx) : reward === 'agri' ? agriValue(ctx) : unitValue(ctx, reward);
        if (value > bestValue) {
            bestValue = value;
            best = i;
        }
    });
    return { type: 'pickDie', die: best };
}

function chooseFeed(ctx, pending) {
    const { p } = ctx;
    if (resourceCount(p.res) < pending.short) {
        return p.choice2.length ? { type: 'choice2', take: { wood: 2, clay: 0, stone: 0, gold: 0 } } : { type: 'feed', pay: null };
    }
    const pay = cheapestPay(p.res, pending.short);
    if (ctx.easy) return { type: 'feed', pay };
    return payValue(pay, p.res) < STARVE_PENALTY ? { type: 'feed', pay } : { type: 'feed', pay: null };
}
