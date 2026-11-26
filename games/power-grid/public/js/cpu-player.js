/**
 * CPU の手の決め方。ビューだけを見て決める（山の並びは見ない）
 * - ふつう：
 *   競り：発電所を足したときに増える送電の数と、燃料の値段から値打ちを見積もり、番号＋値打ちまで競る
 *   資源：次の巡に動かす発電所（都市の数＋建てる見込みの分）の燃料を、安い方から買う
 *   建設：送電できる数より1つ多いところまで、安い都市から建てる。次の巡の燃料代は残す。
 *         自分が勝てない見込みのときは、終わりの都市の数に届かせない
 * - やさしい：番号どおりの値で手ごろな発電所を買い、燃料を1回分買い、安い都市を1つずつ建てる
 * 判断にゲームの乱数は使わない（記録の再現がずれるため）。揺らぎは、ビューから作った別の乱数を使う
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import { PLANT, HOUSES } from './data.js';
import { actualMarket, capacity, buildOptions, buyPrice, canStore, bestPower } from './rules.js';

export const CPU_LEVELS = ['easy', 'normal'];

export const isCpuTurn = (game) => game.actors().some(s => game.players[s].isCPU);

function viewRandom(view) {
    let h = Math.imul(view.commandCount + 1, 2654435761) ^ Math.imul(view.you + 3, 40503) ^ view.round;
    return createRandom(h >>> 0);
}

// 燃料1回分のいまの値段（エコは0）。市場に足りなければ、品薄として高く見る
function fuelCost(view, num) {
    const p = PLANT[num];
    if (p.type === 'eco') return 0;
    const cost = (t) => (view.resources[t] >= p.need * 2 ? buyPrice(t, view.resources[t], p.need) : 15 * p.need);
    return p.type === 'hybrid' ? Math.min(cost('coal'), cost('oil')) : cost(p.type);
}

// 発電所を買ったあと（持てる数を超えたら、いちばん小さいものを手放す）の発電所
function plantsAfter(view, me, num) {
    const list = [...me.plants, num].sort((a, b) => PLANT[b].cities - PLANT[a].cities || b - a);
    return list.slice(0, view.setup.maxPlants);
}

// 発電所の値打ち（番号を超えて払ってよい額）。役に立たなければ null
function plantWorth(view, me, num) {
    const before = capacity(me.plants);
    const after = capacity(plantsAfter(view, me, num));
    const gain = after - before;
    if (gain <= 0 && me.plants.length) return null;
    const p = PLANT[num];
    // 市場に燃料が1回分もなければ、動かせない見込みが強いので買わない
    const stock = p.type === 'hybrid' ? view.resources.coal + view.resources.oil : view.resources[p.type] ?? Infinity;
    if (p.type !== 'eco' && stock < p.need && me.plants.length) return null;
    const efficiency = p.cities * 6 - fuelCost(view, num) * 1.5;
    const need = Math.max(0, me.cities + 3 - before);
    return Math.max(0, Math.min(gain, need + 1) * 5 + efficiency * 0.6 + (p.type === 'eco' ? 4 : 0));
}

function chooseAuction(view, level) {
    const me = view.players[view.you];
    const a = view.auction;
    const rand = viewRandom(view);
    if (a.discard === view.you) {
        const keep = plantsAfter(view, { plants: me.plants.filter(n => n !== a.justBought) }, a.justBought);
        const drop = me.plants.find(n => !keep.includes(n)) ?? me.plants.find(n => n !== a.justBought);
        return { type: 'discard', plant: drop };
    }
    const reserve = view.round === 1 ? 0 : 12;
    // 送電できる数に余裕があれば、発電所は買わず、お金を都市に回す
    const enough = view.round > 1 && capacity(me.plants) >= me.cities + (level === 'easy' ? 3 : 2);
    if (a.current) {
        if (enough) return { type: 'pass' };
        const c = a.current;
        const worth = plantWorth(view, me, c.plant);
        const limit = worth === null ? 0 : Math.floor(c.plant + worth * (level === 'easy' ? 0.2 + rand() * 0.3 : 0.3));
        if (c.high + 1 <= limit && c.high + 1 <= me.money - reserve) return { type: 'bid', amount: c.high + 1 };
        return { type: 'pass' };
    }
    const market = actualMarket(view).filter(n => n <= me.money - reserve || (view.round === 1 && n <= me.money));
    const scored = market.map(n => ({ n, worth: plantWorth(view, me, n) })).filter(x => x.worth !== null);
    if (view.round === 1 && !scored.length && market.length) scored.push({ n: market[0], worth: 0 });
    if (!scored.length) return view.round === 1 ? { type: 'choose', plant: actualMarket(view)[0], bid: actualMarket(view)[0] } : { type: 'skip' };
    if (enough) return { type: 'skip' };
    if (level === 'easy') {
        const pick = scored[Math.floor(rand() * scored.length)];
        return { type: 'choose', plant: pick.n, bid: pick.n };
    }
    const best = scored.reduce((b, x) => (x.worth > b.worth ? x : b));
    return { type: 'choose', plant: best.n, bid: best.n };
}

// 次の巡に動かす発電所の燃料を買う
function chooseBuy(view, level) {
    const me = view.players[view.you];
    const market = { ...view.resources };
    const have = { ...me.res };
    const buy = { coal: 0, oil: 0, garbage: 0, uranium: 0 };
    let money = me.money;
    const target = level === 'easy' ? Math.min(capacity(me.plants), me.cities + 1) : capacity(me.plants);
    // 送電の多い発電所から、目標の都市の数に届くまで動かす
    const plants = [...me.plants].sort((a, b) => PLANT[b].cities - PLANT[a].cities);
    let covered = 0;
    const need = { coal: 0, oil: 0, garbage: 0, uranium: 0, hybrid: 0 };
    for (const num of plants) {
        if (covered >= Math.max(1, target)) break;
        const p = PLANT[num];
        if (p.type !== 'eco') need[p.type] += p.need;
        covered += p.cities;
    }
    const take = (t) => {
        if (market[t] <= 0) return false;
        const price = buyPrice(t, market[t], 1);
        if (price > money) return false;
        const next = { ...have, [t]: have[t] + 1 };
        if (!canStore(me.plants, next)) return false;
        market[t]--;
        have[t]++;
        buy[t]++;
        money -= price;
        return true;
    };
    for (const t of ['garbage', 'uranium', 'coal', 'oil']) {
        while (have[t] < need[t] && take(t));
    }
    // 両用の分は、安い方から
    let hybridHave = Math.max(0, have.coal - need.coal) + Math.max(0, have.oil - need.oil);
    while (hybridHave < need.hybrid) {
        const pc = market.coal > 0 ? buyPrice('coal', market.coal, 1) : Infinity;
        const po = market.oil > 0 ? buyPrice('oil', market.oil, 1) : Infinity;
        if (!(pc <= po ? take('coal') || take('oil') : take('oil') || take('coal'))) break;
        hybridHave++;
    }
    return { type: 'buy', ...buy };
}

// 都市を1つ建てるか、建て終える
function chooseBuild(view, level) {
    const me = view.players[view.you];
    if (me.cities >= HOUSES) return { type: 'done' };
    const cap = capacity(me.plants);
    // 次の巡に動かす分の燃料代は残す（多くても15）
    const reserve = level === 'easy' ? 5 : Math.min(15, me.plants.reduce((s, n) => s + fuelCost(view, n), 0));
    // 送電できる数まで建てる。巡が長引いたら（発電所が尽きて送電の数を増やせないなど）、終わらせるために建てる
    const target = view.round >= 25 ? Infinity
        : level === 'easy' ? Math.min(cap, me.cities + 1) : Math.max(cap, view.round <= 2 ? 2 : 0);
    if (me.cities >= target) return { type: 'done' };
    // 建て始めは、近くの都市が安く集まっている所を選ぶ
    let options = buildOptions(view, view.you);
    if (me.cities === 0) {
        // 建て始めは、そこから広げる近くの4都市（まだ建てられる都市）までの費用が小さい所を選ぶ
        const spread = (city) => {
            const trial = { ...view, houses: { ...view.houses, [city]: [...(view.houses[city] ?? []), view.you] } };
            return buildOptions(trial, view.you).slice(0, 4).reduce((sum, o) => sum + o.cost, 0) / 4;
        };
        const scored = options.map(o => ({ ...o, score: o.cost + spread(o.city) }));
        options = scored.sort((a, b) => a.score - b.score || (a.city < b.city ? -1 : 1));
    }
    const pick = options.find(o => o.cost <= me.money - reserve);
    if (!pick) return { type: 'done' };
    // ふつうは、終わりの都市の数に届くとき、送電で相手に負けていれば見送る（巡が長引いたら建てて終わらせる）
    if (level !== 'easy' && me.cities + 1 >= view.setup.end && view.round < 40) {
        const mine = bestPower(me.plants, me.res, me.cities + 1).powered;
        const others = Math.max(0, ...view.players.filter(p => p.id !== view.you).map(p => bestPower(p.plants, p.res, p.cities).powered));
        if (mine < others) return { type: 'done' };
    }
    return { type: 'build', city: pick.city };
}

/**
 * ビューから次の1手を決める
 */
export function chooseCommand(view, level = 'normal') {
    if (view.phase === 'end' || !view.actors.includes(view.you)) return null;
    if (view.phase === 'auction') return chooseAuction(view, level);
    if (view.phase === 'resources') return chooseBuy(view, level);
    if (view.phase === 'build') return chooseBuild(view, level);
    return null;
}

// ヒント：人の番に、ふつうの CPU が選ぶ手を返す
export function suggest(view) {
    return chooseCommand(view, 'normal');
}

// いちばん単純な手（決めた手が通らなかったときの逃げ道）
function fallbacks(game, seat) {
    const a = game.auction;
    const p = game.players[seat];
    if (game.phase === 'auction') {
        if (a.discard === seat) return [{ type: 'discard', plant: p.plants.find(n => n !== a.justBought) }];
        if (a.current) return [{ type: 'pass' }];
        const cheap = actualMarket(game).filter(n => n <= p.money);
        return [{ type: 'skip' }, ...cheap.map(n => ({ type: 'choose', plant: n, bid: n }))];
    }
    if (game.phase === 'resources') return [{ type: 'buy', coal: 0, oil: 0, garbage: 0, uranium: 0 }, { type: 'done' }];
    return [{ type: 'done' }];
}

/**
 * CPU の番なら1手打つ。打てたら true
 */
export function runCpuStep(game) {
    if (!isCpuTurn(game)) return false;
    const seat = game.actors().find(s => game.players[s].isCPU);
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

