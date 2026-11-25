/**
 * 状態を変えない計算（ゲーム・ビュー・CPU で使う）
 * 状態 s は game とビューで同じ形：mapId・regions・houses（都市ごとの席の並び）・step・market・resources・players[{ money, plants, res }]
 */

import { MAPS } from './maps.js';
import { PLANT, PRICES, TOKENS, BUILD_COST, RESOURCES, STEP3 } from './data.js';

// 使う地域だけの地図（都市の一覧と、隣の都市と線の費用）。地域の組ごとに一度だけ作る
const graphCache = new Map();
export function graphOf(mapId, regions) {
    const key = `${mapId}:${[...regions].sort().join(',')}`;
    let g = graphCache.get(key);
    if (g) return g;
    const map = MAPS[mapId];
    const active = new Set(map.cities.filter(c => regions.includes(c.region)).map(c => c.id));
    const adj = new Map([...active].map(id => [id, []]));
    map.links.forEach(([a, b, cost]) => {
        if (!active.has(a) || !active.has(b)) return;
        adj.get(a).push([b, cost]);
        adj.get(b).push([a, cost]);
    });
    g = { cities: [...active].sort(), active, adj };
    graphCache.set(key, g);
    return g;
}

// 地域どうしの隣り合い（地域をまたぐ線があれば隣）
export function regionNeighbors(mapId) {
    const map = MAPS[mapId];
    const regionOf = Object.fromEntries(map.cities.map(c => [c.id, c.region]));
    const out = Object.fromEntries(map.regions.map(r => [r, new Set()]));
    map.links.forEach(([a, b]) => {
        if (regionOf[a] !== regionOf[b]) {
            out[regionOf[a]].add(regionOf[b]);
            out[regionOf[b]].add(regionOf[a]);
        }
    });
    return out;
}

export const citiesOf = (s, seat) => Object.keys(s.houses).filter(id => s.houses[id].includes(seat)).sort();

// 自分の都市のどれかから、各都市までの最も安い線の費用（自分の都市がなければ空）
export function distances(s, seat) {
    const g = graphOf(s.mapId, s.regions);
    const dist = new Map();
    const start = citiesOf(s, seat);
    start.forEach(id => dist.set(id, 0));
    const done = new Set();
    while (true) {
        let best = null;
        for (const [id, d] of dist) if (!done.has(id) && (best === null || d < dist.get(best) || (d === dist.get(best) && id < best))) best = id;
        if (best === null) break;
        done.add(best);
        for (const [n, cost] of g.adj.get(best)) {
            const d = dist.get(best) + cost;
            if (!dist.has(n) || d < dist.get(n)) dist.set(n, d);
        }
    }
    return dist;
}

// 都市に建てられるか。建てられれば費用（線の費用＋その都市の空いたいちばん安いマス）、だめなら null
export function buildCost(s, seat, city, dist = distances(s, seat)) {
    const g = graphOf(s.mapId, s.regions);
    if (!g.active.has(city)) return null;
    const houses = s.houses[city] ?? [];
    if (houses.includes(seat) || houses.length >= s.step) return null;
    const slot = BUILD_COST[houses.length];
    if (dist.size === 0) return slot;
    if (!dist.has(city)) return null;
    return dist.get(city) + slot;
}

// 建てられる都市と費用の一覧
export function buildOptions(s, seat) {
    const dist = distances(s, seat);
    return graphOf(s.mapId, s.regions).cities
        .map(city => ({ city, cost: buildCost(s, seat, city, dist) }))
        .filter(o => o.cost !== null)
        .sort((a, b) => a.cost - b.cost || (a.city < b.city ? -1 : 1));
}

// ---- 資源の市場 ----

// 市場の n 個のうち、安い方から k 個を買う値段（足りなければ null）
export function buyPrice(type, n, k) {
    if (k > n) return null;
    const prices = PRICES[type];
    let sum = 0;
    for (let i = 0; i < k; i++) sum += prices[prices.length - n + i];
    return sum;
}
export const nextPrice = (type, n) => (n > 0 ? PRICES[type][PRICES[type].length - n] : null);
export const supplyLeft = (s, type) => TOKENS[type] - s.resources[type] - s.players.reduce((sum, p) => sum + p.res[type], 0);

// ---- 発電所と資源 ----

const plantsOf = (nums) => nums.filter(n => n !== STEP3).map(n => PLANT[n]);

// 発電所に貯められるか（必要数の2倍まで。石炭・石油の両用は、どちらにも使える）
export function canStore(plantNums, res) {
    const cap = { coal: 0, oil: 0, hybrid: 0, garbage: 0, uranium: 0 };
    plantsOf(plantNums).forEach(p => { if (p.type !== 'eco') cap[p.type] += p.need * 2; });
    if (res.garbage > cap.garbage || res.uranium > cap.uranium) return false;
    const extraCoal = Math.max(0, res.coal - cap.coal);
    const extraOil = Math.max(0, res.oil - cap.oil);
    return extraCoal + extraOil <= cap.hybrid;
}

// 持ちきれない資源を減らした量（発電所を手放したとき）。石炭・石油は、両用に入りきらない分を、はみ出しの多い方から減らす
export function trimResources(plantNums, res) {
    const cap = { coal: 0, oil: 0, hybrid: 0, garbage: 0, uranium: 0 };
    plantsOf(plantNums).forEach(p => { if (p.type !== 'eco') cap[p.type] += p.need * 2; });
    const out = {
        coal: Math.min(res.coal, cap.coal + cap.hybrid),
        oil: Math.min(res.oil, cap.oil + cap.hybrid),
        garbage: Math.min(res.garbage, cap.garbage),
        uranium: Math.min(res.uranium, cap.uranium)
    };
    while (Math.max(0, out.coal - cap.coal) + Math.max(0, out.oil - cap.oil) > cap.hybrid) {
        if (out.coal - cap.coal >= out.oil - cap.oil) out.coal--;
        else out.oil--;
    }
    return out;
}

// 発電所を全部動かしたときに送電できる都市の数
export const capacity = (plantNums) => plantsOf(plantNums).reduce((sum, p) => sum + p.cities, 0);

/**
 * 今の資源で、いちばん多く送電できる発電所の組み合わせ（都市の数 limit まで）
 * 同じ都市の数なら、使う資源の値打ち（ウラン・ゴミ・石油・石炭の順に重く）が少ない組み合わせ
 * 戻り値：{ powered, plants: [番号], use: { coal, oil, garbage, uranium } }
 */
const WEIGHT = { coal: 1, oil: 1.2, garbage: 1.4, uranium: 2 };
export function bestPower(plantNums, res, limit) {
    const plants = plantsOf(plantNums);
    let best = { powered: 0, plants: [], use: { coal: 0, oil: 0, garbage: 0, uranium: 0 }, weight: 0 };
    const n = plants.length;
    for (let mask = 1; mask < 1 << n; mask++) {
        const chosen = plants.filter((_, i) => mask & (1 << i));
        const use = { coal: 0, oil: 0, garbage: 0, uranium: 0 };
        let hybridNeed = 0;
        chosen.forEach(p => {
            if (p.type === 'hybrid') hybridNeed += p.need;
            else if (p.type !== 'eco') use[p.type] += p.need;
        });
        if (RESOURCES.some(t => use[t] > res[t])) continue;
        // 両用の分は、余った石炭から先に使う
        const coalLeft = res.coal - use.coal;
        const oilLeft = res.oil - use.oil;
        if (coalLeft + oilLeft < hybridNeed) continue;
        const fromCoal = Math.min(coalLeft, hybridNeed);
        use.coal += fromCoal;
        use.oil += hybridNeed - fromCoal;
        const powered = Math.min(limit, chosen.reduce((s, p) => s + p.cities, 0));
        const weight = RESOURCES.reduce((s, t) => s + use[t] * WEIGHT[t], 0);
        if (powered > best.powered || (powered === best.powered && weight < best.weight)) {
            best = { powered, plants: chosen.map(p => p.num), use, weight };
        }
    }
    const { weight, ...rest } = best;
    return rest;
}

// 今競りにかけられる発電所（段階1・2は安い方の4枚、段階3は全部）
export const actualMarket = (s) => (s.step >= 3 ? s.market.filter(n => n !== STEP3) : s.market.slice(0, 4).filter(n => n !== STEP3));
