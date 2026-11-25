/**
 * CPU のプレイヤー。ビュー（createGameView）だけを見て決める（game の中はのぞかない）
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ビューの数から作ったハッシュで出す
 *
 * ふつう：置ける行動スペースごとに「得られるものの見込みの価値（点に換算）」を見積もり、一番高いものを選ぶ
 * - 次の収穫の食事に足りないうちは、食料・穀物と、かまど・調理場を高く見る
 * - 部屋が家族より多ければ家族を増やす。部屋は家族の数に追いつくように建てる
 * - 畑は5つまで、牧場は4つまでを目安にし、羊・猪・牛が0にならないように入れる
 * - 終わりが近いほど、改築と、得点表の −1 を消すものを高く見る
 * やさしい：見積もりに大きな迷いを足し、細かい選び方（どのマスか）は最初に見つかったものにする
 */

import { SPACES, MAJOR, FIREPLACES, BUILDING_RES, SCORE, MAX_FAMILY, hasAll } from './cards.js';
import {
    CELLS, ANIMALS, MAX_STABLES, colOf, rowOf, neighbors, canPlow, canRoom, canStable, addPastures, ROOM_COST,
    renovationCost, fits, pastureIndex, fieldAt, pastureCapacity
} from './farm.js';
import { cookRates, canCook, bakeFood, maxBake, crafts } from './cooking.js';
import { createGameView } from './game-view.js';

export const CPU_LEVELS = ['easy', 'normal'];

const ALL = Array.from({ length: CELLS }, (_, c) => c);
const RES_VALUE = { wood: 1, clay: 0.9, reed: 1.3, stone: 1.1, grain: 1.4, veg: 2.2 };
const ANIMAL_VALUE = { sheep: 1.2, boar: 1.6, cattle: 2 };

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
    for (const fallback of fallbackCommands(view)) {
        if (game.applyCommand(seat, fallback)) return fallback;
    }
    return null;
}

// いちばん単純な答え（思わぬことで選んだ手が通らなかったとき）
export function fallbackCommands(view) {
    const me = view.players[view.you];
    if (view.pending?.kind === 'keep') return [{ type: 'keep', animals: keepAnimals(me, view.pending.animals, 'easy') }];
    if (view.phase === 'feed') return [{ type: 'feed', convert: {}, crafts: [] }];
    const result = [];
    view.legalSpaces.forEach(space => {
        result.push({ type: 'act', space });
        result.push({ type: 'act', space, res: 'wood' });
        const plow = ALL.find(c => canPlow(me.farm, c));
        if (plow !== undefined) result.push({ type: 'act', space, cell: plow });
        const fence = cheapestFence(me);
        if (fence) result.push({ type: 'act', space, pastures: [fence] });
        const major = view.majorsLeft.find(id => hasAll(me.res, MAJOR[id].cost));
        if (major) result.push({ type: 'act', space, major });
        const field = me.farm.fields.find(f => !f.crop);
        if (field && me.res.grain) result.push({ type: 'act', space, sow: [{ cell: field.cell, crop: 'grain' }] });
        const stable = ALL.find(c => canStable(me.farm, c));
        if (stable !== undefined) result.push({ type: 'act', space, stables: [stable] });
        const room = ALL.find(c => canRoom(me.farm, c));
        if (room !== undefined) result.push({ type: 'act', space, rooms: [room] });
    });
    return result;
}

export function chooseCommand(view, level = 'normal') {
    const ctx = makeContext(view, level);
    if (view.pending?.kind === 'keep') return { type: 'keep', animals: keepAnimals(ctx.me, view.pending.animals, level) };
    if (view.phase === 'feed') return chooseFeed(ctx);
    if (view.phase === 'work' && view.current === view.you) return chooseAction(ctx);
    return null;
}

// ---- 見積もり ----

function makeContext(view, level) {
    const me = view.players[view.you];
    const nextHarvest = view.harvestRounds.find(r => r >= view.round) ?? view.rounds;
    const rates = cookRates(me.majors);
    const roundsLeft = view.rounds - view.round;
    // 次の収穫までに用意できる食料の見込み（穀物と野菜は換算、動物は1頭ずつ残す）
    const convertible = me.res.grain + me.res.veg * rates.veg
        + ANIMALS.reduce((s, t) => s + Math.max(0, me.animals[t] - 1) * rates[t], 0)
        + me.farm.fields.reduce((s, f) => s + (f.n ? (f.crop === 'veg' ? rates.veg : 1) : 0), 0);
    const need = me.foodNeed + (nextHarvest === view.round ? 0 : 0);
    const deficit = need - me.food - convertible;
    const urgent = nextHarvest - view.round <= 1;
    return {
        view, me, level, easy: level === 'easy', rates, roundsLeft, nextHarvest, deficit,
        foodValue: deficit > 0 ? 1.5 + 0.25 * Math.min(deficit, 8) + (urgent ? 0.8 : 0) : 0.6,
        noise: (k) => hash(view.commandCount, view.you, view.round, k)
    };
}

function goodsValue(ctx, goods) {
    let v = 0;
    Object.entries(goods).forEach(([k, n]) => {
        if (k === 'food') v += n * ctx.foodValue;
        else if (RES_VALUE[k]) v += n * resourceValue(ctx, k);
    });
    return v;
}

// 資源の価値。次にしたいこと（部屋・かまど・改築）に足りないものは高く見る
function resourceValue(ctx, k) {
    const { me } = ctx;
    let v = RES_VALUE[k];
    const roomCost = ROOM_COST[me.farm.house];
    if (roomCost[k] && me.members >= me.farm.rooms.length && me.farm.rooms.length < 5 && (me.res[k] ?? 0) < roomCost[k]) v += 0.5;
    if (k === 'clay' && !canCook(me.majors) && me.res.clay < 2) v += 0.8;
    const late = ctx.roundsLeft <= 4;
    const onFields = (crop) => me.farm.fields.filter(f => f.crop === crop).reduce((s, f) => s + f.n, 0);
    const emptyFields = me.farm.fields.filter(f => !f.crop).length;
    if (k === 'grain') {
        if (ctx.deficit > 0) v += 0.4;
        // まけば穀物3つになる
        if (emptyFields > me.res.grain + me.res.veg) v += 2.2;
        else if (me.res.grain < 2) v += 0.6;
        if (late && me.res.grain + onFields('grain') === 0) v += 1.5;
    }
    if (k === 'veg') {
        if (emptyFields > me.res.grain + me.res.veg) v += 1.5;
        if (late && me.res.veg + onFields('veg') === 0) v += 1.5;
    }
    if (k === 'stone' && ctx.view.round < 5) v -= 0.4;
    return v;
}

// 得点表の点（今と1つ増やしたあとの差）
const scoreGain = (table, n, k = 1) => SCORE[table](n + k) - SCORE[table](n);

function animalValue(ctx, t) {
    const n = ctx.me.animals[t];
    return ANIMAL_VALUE[t] + Math.max(0, scoreGain(t, n)) * 0.8;
}

// ---- 行動 ----

function chooseAction(ctx) {
    const { view, easy } = ctx;
    const options = [];
    view.legalSpaces.forEach((space, i) => {
        let option = null;
        try {
            option = evaluate(ctx, space);
        } catch (error) {
            console.error(error);
        }
        if (!option) return;
        const value = option.value + (easy ? (ctx.noise(i) - 0.5) * 8 : 0);
        options.push({ value, command: { type: 'act', space, ...option.params } });
    });
    options.sort((a, b) => b.value - a.value);
    return options[0]?.command ?? null;
}

function evaluate(ctx, space) {
    const { view, me } = ctx;
    const info = SPACES[space];
    const goods = view.spaces.find(s => s.id === space)?.goods ?? {};
    switch (info.kind) {
        case 'take': return { value: goodsValue(ctx, info.take), params: {} };
        case 'acc': return { value: goodsValue(ctx, goods), params: {} };
        case 'start': return { value: 0.7 + goodsValue(ctx, goods), params: {} };
        case 'laborer': {
            const res = [...BUILDING_RES].sort((a, b) => resourceValue(ctx, b) - resourceValue(ctx, a))[0];
            return { value: ctx.foodValue + resourceValue(ctx, res), params: { res } };
        }
        case 'animal': {
            const next = { ...me.animals };
            let value = 0;
            ANIMALS.forEach(t => {
                const n = goods[t] ?? 0;
                if (!n) return;
                next[t] += n;
                value += fits(me.farm, next) ? n * animalValue(ctx, t) : n * ctx.rates[t] * ctx.foodValue * 0.7;
            });
            return { value, params: {} };
        }
        case 'family':
        case 'urgent':
        {
            // 増えた家族の食事の分も見込む（次の収穫で1、そのあとは2）
            const after = ctx.deficit + (ctx.nextHarvest === view.round ? 1 : 2);
            const engine = (canCook(me.majors) ? 2 : 0) + me.farm.fields.filter(f => f.n).length;
            return { value: (ctx.roundsLeft >= 2 ? 9 + ctx.roundsLeft * 0.3 : 4) - Math.max(0, after - engine) * 0.8, params: {} };
        }
        case 'build': return evaluateBuild(ctx);
        case 'plow': {
            const cell = choosePlowCell(ctx);
            if (cell === null) return null;
            return { value: plowValue(ctx), params: { cell } };
        }
        case 'sowBake': return evaluateSowBake(ctx, null);
        case 'plowSow': {
            const cell = choosePlowCell(ctx);
            const option = evaluateSowBake(ctx, cell === null ? null : cell, true);
            if (!option) return null;
            return { value: option.value + (cell !== null ? plowValue(ctx) : 0), params: { cell, sow: option.params.sow } };
        }
        case 'fences': {
            const plan = chooseFences(ctx, me.res.wood);
            return plan ? { value: plan.value, params: { pastures: plan.pastures } } : null;
        }
        case 'major': {
            const best = bestMajor(ctx, me.res);
            return best ? { value: best.value, params: best.params } : null;
        }
        case 'renoMajor':
        case 'renoFences': {
            const cost = renovationCost(me.farm);
            const after = { ...me.res };
            Object.entries(cost).forEach(([k, v]) => { after[k] -= v; });
            let value = me.farm.rooms.length * (ctx.roundsLeft <= 4 ? 1.2 : 0.8) - goodsValue(ctx, cost) * 0.5;
            const params = {};
            if (info.kind === 'renoMajor') {
                const best = bestMajor(ctx, after);
                if (best && best.value > 0) {
                    value += best.value;
                    Object.assign(params, best.params);
                }
            } else {
                const plan = chooseFences(ctx, after.wood);
                if (plan && plan.value > 0) {
                    value += plan.value;
                    params.pastures = plan.pastures;
                }
            }
            return { value, params };
        }
        default:
            return { value: 0, params: {} };
    }
}

function plowValue(ctx) {
    const n = ctx.me.farm.fields.length;
    if (ctx.roundsLeft < 1) return 0.5 + Math.max(0, scoreGain('fields', n));
    return n < 2 ? 3.5 : n < 4 ? 2.6 : n < 5 ? 1.8 : 0.4;
}

// 耕すマス：中ほどの列（1〜2）を好み、今の畑につなげる
function choosePlowCell(ctx) {
    const { me, easy } = ctx;
    const cells = ALL.filter(c => canPlow(me.farm, c));
    if (!cells.length) return null;
    if (easy) return cells[0];
    const score = (c) => -Math.abs(colOf(c) - 1.5) * 2 - (rowOf(c) === 0 ? 0 : 0.5) - (neighbors(c).some(n => me.farm.rooms.includes(n)) ? 0.3 : 0);
    return cells.sort((a, b) => score(b) - score(a))[0];
}

function evaluateBuild(ctx) {
    const { me, easy } = ctx;
    const farm = me.farm;
    const cost = ROOM_COST[farm.house];
    const res = { ...me.res };
    const rooms = [];
    // 部屋：家族の数＋1まで（家族を増やせるように）。5部屋まで
    while (farm.rooms.length + rooms.length < Math.min(MAX_FAMILY, me.members + 1) && hasAll(res, cost)) {
        const cells = ALL.filter(c => canRoom(farm, c, rooms));
        if (!cells.length) break;
        const pick = easy ? cells[0] : cells.sort((a, b) => colOf(a) - colOf(b) || rowOf(b) - rowOf(a))[0];
        rooms.push(pick);
        Object.entries(cost).forEach(([k, v]) => { res[k] -= v; });
    }
    const stables = [];
    // 厩：牧場があり、木が余っていれば、牧場の中に1つ
    if (!rooms.length && res.wood >= 2 && farm.stables.length < MAX_STABLES) {
        const inPasture = ALL.filter(c => pastureIndex(farm, c) >= 0 && canStable(farm, c));
        const cell = inPasture[0] ?? ALL.filter(c => canStable(farm, c) && colOf(c) >= 3)[0];
        if (cell !== undefined) stables.push(cell);
    }
    if (!rooms.length && !stables.length) return null;
    const value = rooms.length * (ctx.roundsLeft > 3 ? 6 : 2.5) + stables.length * 1.2;
    return { value, params: { rooms, stables } };
}

function evaluateSowBake(ctx, plowed, plowOnly = false) {
    const { me } = ctx;
    const empty = me.farm.fields.filter(f => !f.crop).map(f => f.cell);
    if (plowed !== null && plowed !== undefined) empty.push(plowed);
    let grain = me.res.grain;
    let veg = me.res.veg;
    const sow = [];
    let value = 0;
    empty.forEach(cell => {
        if (veg > 0) {
            sow.push({ cell, crop: 'veg' });
            veg -= 1;
            value += 3.2;
        } else if (grain > 0) {
            sow.push({ cell, crop: 'grain' });
            grain -= 1;
            value += 3;
        }
    });
    let bake = 0;
    if (!plowOnly && grain > 0 && bakeFood(me.majors, 1) !== null) {
        const limit = Math.min(grain, maxBake(me.majors));
        for (let k = limit; k >= 1; k--) {
            const food = bakeFood(me.majors, k);
            const gain = food * ctx.foodValue - k * RES_VALUE.grain;
            if (gain > 0) {
                bake = k;
                value += gain;
                break;
            }
        }
    }
    if (!sow.length && !bake && !(plowOnly && plowed !== null && plowed !== undefined)) return null;
    return { value, params: plowOnly ? { sow } : { sow, bake } };
}

// 牧場の候補：1マス・となりの2マス・2×2。右の列を好む
function pastureCandidates(farm) {
    const free = (c) => !farm.rooms.includes(c) && !fieldAt(farm, c) && pastureIndex(farm, c) < 0;
    const list = [];
    ALL.forEach(c => {
        if (!free(c)) return;
        list.push([c]);
        if (colOf(c) < 4 && free(c + 1)) list.push([c, c + 1]);
        if (rowOf(c) < 2 && free(c + 5)) list.push([c, c + 5]);
        if (colOf(c) < 4 && rowOf(c) < 2 && free(c + 1) && free(c + 5) && free(c + 6)) list.push([c, c + 1, c + 5, c + 6]);
    });
    return list;
}

function chooseFences(ctx, wood) {
    const { me, easy } = ctx;
    let farm = me.farm;
    let left = wood;
    const chosen = [];
    let total = 0;
    for (let step = 0; step < 2; step++) {
        let best = null;
        pastureCandidates(farm).forEach(cells => {
            const r = addPastures(farm, [cells]);
            if (r.error || r.newFences > left) return;
            const count = farm.pastures.length;
            const points = SCORE.pastures(count + 1) - SCORE.pastures(count);
            const capacity = pastureCapacity(r.farm, cells);
            const animals = ANIMALS.reduce((s, t) => s + me.animals[t], 0);
            const value = points * 1.4 + Math.min(capacity, 6) * 0.5 + (animals > 1 ? 1 : 0) + (count === 0 && ctx.roundsLeft <= 9 ? 1.5 : 0)
                + colOf(Math.max(...cells)) * 0.15 - r.newFences * 0.25 + (easy ? 0 : 0);
            if (!best || value > best.value) best = { value, cells, farm: r.farm, cost: r.newFences };
        });
        if (!best || (step > 0 && best.value < 2)) break;
        chosen.push(best.cells);
        total += best.value;
        farm = best.farm;
        left -= best.cost;
        if (easy) break;
    }
    return chosen.length ? { pastures: chosen, value: total } : null;
}

function cheapestFence(me) {
    let best = null;
    pastureCandidates(me.farm).forEach(cells => {
        const r = addPastures(me.farm, [cells]);
        if (!r.error && r.newFences <= me.res.wood && (!best || r.newFences < best.n)) best = { cells, n: r.newFences };
    });
    return best?.cells ?? null;
}

// 買う大きな進歩の候補と価値
function bestMajor(ctx, res) {
    const { me, view } = ctx;
    const cooking = canCook(me.majors);
    let best = null;
    view.majorsLeft.forEach(id => {
        const card = MAJOR[id];
        const fireplace = me.majors.find(m => FIREPLACES.includes(m));
        const options = [];
        if (hasAll(res, card.cost)) options.push({ payWith: null, cost: card.cost });
        if (card.upgrade && fireplace) options.push({ payWith: fireplace, cost: {} });
        options.forEach(opt => {
            let value = card.points;
            if (card.cook) {
                if (!cooking) value += 4 + (ctx.deficit > 0 ? 3 : 0) + ANIMALS.reduce((s, t) => s + me.animals[t], 0) * 0.6;
                else if (card.upgrade && opt.payWith) value += 1.2;
                else value -= 2;
            }
            if (card.oven) value += me.res.grain > 0 || ctx.roundsLeft > 4 ? 1.5 : 0;
            if (card.craft) value += Math.min(2, me.res[card.craft.res] / 2) + 0.5;
            if (card.well) value += Math.min(5, ctx.roundsLeft) * ctx.foodValue;
            value -= goodsValue(ctx, opt.cost) * 0.5;
            if (!best || value > best.value) best = { value, params: { major: id, payWith: opt.payWith } };
        });
    });
    return best;
}

// ---- 動物があふれたとき ----

// 農場に入る組み合わせのうち、価値の一番高いものを残す（各種類1頭は残したい）
export function keepAnimals(me, animals, level = 'normal') {
    let best = null;
    for (let c = animals.cattle; c >= 0; c--) {
        for (let b = animals.boar; b >= 0; b--) {
            for (let s = animals.sheep; s >= 0; s--) {
                const keep = { sheep: s, boar: b, cattle: c };
                const value = s * 1 + b * 1.4 + c * 1.8 + (s ? 1.5 : 0) + (b ? 1.5 : 0) + (c ? 1.5 : 0);
                if (best && value <= best.value) continue;
                if (fits(me.farm, keep)) best = { value, keep };
                if (level === 'easy' && best) return best.keep;
            }
        }
    }
    return best?.keep ?? { sheep: 0, boar: 0, cattle: 0 };
}

// ---- 食事 ----

function chooseFeed(ctx) {
    const { me, rates, easy } = ctx;
    let food = me.food;
    const need = me.foodNeed;
    const convert = { grain: 0, veg: 0, sheep: 0, boar: 0, cattle: 0 };
    const usedCrafts = [];
    const res = { ...me.res };
    const animals = { ...me.animals };
    // 作業場：足りないときと、資源が余っているとき
    crafts(me.majors).forEach(craft => {
        const spare = res[craft.res] - (easy ? 0 : 3);
        if (res[craft.res] > 0 && (food < need || spare > 0)) {
            usedCrafts.push(craft.id);
            res[craft.res] -= 1;
            food += craft.food;
        }
    });
    const take = (k, keep) => {
        while (food < need) {
            const have = ANIMALS.includes(k) ? animals[k] : res[k];
            if (have - convert[k] <= keep || !rates[k]) return;
            convert[k] += 1;
            food += rates[k];
        }
    };
    // 残したい数：繁殖のために動物は2頭、種まきのために穀物は2つ
    take('veg', rates.veg >= 3 ? 1 : 2);
    take('sheep', 2);
    take('boar', 2);
    take('grain', 2);
    take('cattle', 2);
    take('veg', 0);
    take('sheep', 1);
    take('boar', 1);
    take('cattle', 1);
    take('grain', 0);
    take('sheep', 0);
    take('boar', 0);
    take('cattle', 0);
    return { type: 'feed', convert, crafts: usedCrafts };
}

