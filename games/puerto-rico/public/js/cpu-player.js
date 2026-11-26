/**
 * CPU：自分のビュー（全員の島・都市・品・お金、自分の判断の材料）だけを見て選ぶ
 * 役割は「自分の得 − ほかの人の得 ＋ 役割に乗ったお金」で選ぶ。入植者は、生産の組（農園と建物）・紫の建物・石切り場の順に価値の高いところへ
 * ゆらぎ（noise）で強さを変える。random は合法な手から無作為に選ぶ（測定用）
 */

import { GOODS, GOOD_PRICE, buildingOf, BUILDINGS } from './data.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

export const LEVELS = {
    easy: { noise: 2.2, others: 0.3 },
    normal: { noise: 0.6, others: 0.7 },
    strong: { noise: 0, others: 0.7 },
    random: { random: true }
};

function viewRandom(view) {
    let h = 2166136261;
    const s = `${view.seat}|${view.round}|${view.phase}|${view.eventSeq}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return createRandom(h >>> 0);
}

const pick = (list, random) => list[Math.floor(random() * list.length)];
const sum = (list, f) => list.reduce((s, x) => s + f(x), 0);

// 紫の建物（入植者がいるとき）の値打ち
const VIOLET = {
    smallMarket: 1.4, hacienda: 0.8, constructionHut: 0.8, smallWarehouse: 1.2, hospice: 1.3, office: 1.3, largeMarket: 1.8, largeWarehouse: 1.5,
    factory: 2.4, university: 1.4, harbor: 2.6, wharf: 2.6, guildHall: 4, residence: 4, fortress: 4, customsHouse: 4, cityHall: 4
};

const capacity = key => buildingOf(key).capacity;

function production(p, good) {
    const fields = p.island.filter(t => t.type === good && t.occupied).length;
    if (good === 'corn') return fields;
    return Math.min(fields, sum(p.city.filter(c => buildingOf(c.key).good === good), c => c.colonists));
}

// 品の値打ち（売る・積む）
const goodValue = g => 1 + GOOD_PRICE[g] * 0.6;

// ---------- 役割 ----------

function roleGain(view, seat, key, isPicker) {
    const p = view.players[seat];
    switch (key) {
        case 'settler': return p.island.length < 12 ? (isPicker ? 1.6 : 1.0) : 0;
        case 'mayor': return Math.min(3, (view.shipColonists / view.players.length) + (isPicker ? 1 : 0)) * 0.7;
        case 'builder': {
            const best = Math.max(0, ...BUILDINGS.filter(b => view.buildings[b.key] > 0 && !p.city.some(c => c.key === b.key) && b.cost - (isPicker ? 1 : 0) - Math.min(b.column, p.island.filter(t => t.type === 'quarry' && t.occupied).length) <= p.money).map(b => b.vp));
            return best ? best * 0.9 + (isPicker ? 0.8 : 0) : 0;
        }
        case 'craftsman': return sum(GOODS, g => production(p, g) * goodValue(g) * 0.5) + (isPicker && GOODS.some(g => production(p, g) > 0) ? 1 : 0);
        case 'trader': {
            const sellable = GOODS.filter(g => p.goods[g] > 0 && !view.tradingHouse.includes(g));
            if (!sellable.length || view.tradingHouse.length >= 4) return 0;
            return Math.max(...sellable.map(g => GOOD_PRICE[g])) * 0.6 + (isPicker ? 0.6 : 0);
        }
        case 'captain': {
            const goods = sum(GOODS, g => p.goods[g]);
            return Math.min(goods, 6) * 0.8 + (isPicker && goods ? 1 : 0);
        }
        case 'prospector': return isPicker ? 0.6 : 0;
        default: return 0;
    }
}

function chooseRole(view, cfg, random) {
    const free = view.roles.filter(r => r.taken === null);
    const others = view.players.filter(p => p.id !== view.seat);
    let best = null;
    for (const r of free) {
        const mine = roleGain(view, view.seat, r.key, true);
        const theirs = sum(others, o => roleGain(view, o.id, r.key, false)) / Math.max(1, others.length);
        const score = mine - theirs * cfg.others + r.money * 0.6 + (random() - 0.5) * cfg.noise * 2;
        if (!best || score > best.score) best = { id: r.id, score };
    }
    return { type: 'role', role: best.id };
}

// ---------- 開拓者 ----------

function chooseSettle(view, d, cfg, random) {
    const p = view.players[view.seat];
    if (d.canHacienda && p.island.length < 11) return { type: 'hacienda' };
    if (p.island.length >= 12) return { type: 'settle', take: null };
    const buildingSlots = g => sum(p.city.filter(c => buildingOf(c.key).good === g), c => capacity(c.key)) - p.island.filter(t => t.type === g).length;
    const value = type => {
        if (type === 'quarry') return 1.5 + (view.round < 8 ? 0.8 : 0);
        if (type === 'corn') return 1.4;
        return 0.6 + GOOD_PRICE[type] * 0.35 + (buildingSlots(type) > 0 ? 1.5 : 0);
    };
    const choices = view.faceUp.map((t, i) => ({ take: i, v: value(t) }));
    if (d.canQuarry) choices.push({ take: 'quarry', v: value('quarry') });
    if (!choices.length) return { type: 'settle', take: null };
    choices.forEach(c => { c.v += (random() - 0.5) * cfg.noise; });
    return { type: 'settle', take: choices.sort((a, b) => b.v - a.v)[0].take };
}

// ---------- 市長 ----------

// 置き場の候補に値打ちを付け、高い順に入植者を置く（生産の組は農園と建物を 2 人で 1 組）
// random を渡さないとき（画面の「おまかせ」など）も、決まった乱数を使う
export function arrangeColonists(p, total, noise = 0, random = createRandom(total)) {
    const island = p.island.map(() => false);
    const city = p.city.map(() => 0);
    let left = total;
    const units = [];
    for (const g of GOODS) {
        if (g === 'corn') continue;
        const fields = p.island.map((t, i) => (t.type === g ? i : -1)).filter(i => i >= 0);
        const seats = p.city.flatMap((c, i) => (buildingOf(c.key).good === g ? Array(capacity(c.key)).fill(i) : []));
        const pairs = Math.min(fields.length, seats.length);
        for (let k = 0; k < pairs; k++) units.push({ v: 1.5 + GOOD_PRICE[g] * 0.8, island: [fields[k]], city: [seats[k]] });
        fields.slice(pairs).forEach(i => units.push({ v: 0.2, island: [i], city: [] }));
        seats.slice(pairs).forEach(i => units.push({ v: 0.2, island: [], city: [i] }));
    }
    p.island.forEach((t, i) => {
        if (t.type === 'corn') units.push({ v: 1.6, island: [i], city: [] });
        if (t.type === 'quarry') units.push({ v: 1.3, island: [i], city: [] });
    });
    p.city.forEach((c, i) => { if (VIOLET[c.key]) units.push({ v: VIOLET[c.key], island: [], city: [i] }); });
    units.forEach(u => { u.v = u.v / (u.island.length + u.city.length) + (random() - 0.5) * noise * 0.5; });
    for (const u of units.sort((a, b) => b.v - a.v)) {
        const need = u.island.length + u.city.length;
        if (need > left) continue;
        u.island.forEach(i => { island[i] = true; });
        u.city.forEach(i => { city[i]++; });
        left -= need;
    }
    // 組にできずに残った入植者は、空いたところへ
    p.island.forEach((t, i) => { if (left > 0 && !island[i]) { island[i] = true; left--; } });
    p.city.forEach((c, i) => { while (left > 0 && city[i] < capacity(c.key)) { city[i]++; left--; } });
    return { type: 'mayor', island, city };
}

// ---------- 建築家 ----------

function chooseBuild(view, cfg, random) {
    const p = view.players[view.seat];
    const o = view.options;
    let best = null;
    for (const key of o.buildable) {
        const b = buildingOf(key);
        let v = b.vp * 1.2;
        if (b.kind === 'production') {
            const fields = p.island.filter(t => t.type === b.good).length;
            const have = sum(p.city.filter(c => buildingOf(c.key).good === b.good), c => capacity(c.key));
            v += Math.min(fields - have, b.capacity) > 0 ? 1.5 + GOOD_PRICE[b.good] * 0.4 : -0.5;
        } else v += VIOLET[key] ?? 0;
        if (b.kind === 'large') v += 2;
        if (key === 'hacienda' || key === 'constructionHut') v -= view.round > 8 ? 1.5 : 0;
        v -= o.costs[key] * 0.15;
        v += (random() - 0.5) * cfg.noise;
        if (!best || v > best.v) best = { key, v };
    }
    return { type: 'build', building: best && best.v > 0.5 ? best.key : null };
}

// ---------- 船長と倉庫 ----------

function chooseShip(view, d, cfg, random) {
    const p = view.players[view.seat];
    const amount = o => (o.ship === 'wharf' ? p.goods[o.good] : Math.min(p.goods[o.good], view.ships[o.ship].size - view.ships[o.ship].count));
    const scored = d.options.map(o => ({ o, v: amount(o) - GOOD_PRICE[o.good] * 0.15 - (o.ship === 'wharf' && amount(o) < 3 ? 2 : 0) + (random() - 0.5) * cfg.noise * 0.5 }));
    const best = scored.sort((a, b) => b.v - a.v)[0];
    if (!d.mustShip && best.v < 1) return { type: 'ship', pass: true };
    return { type: 'ship', good: best.o.good, ship: best.o.ship };
}

function chooseStore(view, d) {
    const p = view.players[view.seat];
    const ranked = [...d.kinds].sort((a, b) => p.goods[b] * goodValue(b) - p.goods[a] * goodValue(a));
    const warehouse = ranked.slice(0, d.slots);
    const rest = ranked.slice(d.slots).sort((a, b) => GOOD_PRICE[b] - GOOD_PRICE[a]);
    return { type: 'store', warehouse, single: rest[0] ?? null };
}

export function chooseCommand(view, cfg = LEVELS.normal, random = viewRandom(view)) {
    const d = view.decision;
    if (!d) return null;
    if (cfg.random) return randomCommand(view, random);
    const p = view.players[view.seat];
    switch (d.kind) {
        case 'role': return chooseRole(view, cfg, random);
        case 'settle': return chooseSettle(view, d, cfg, random);
        case 'mayor': return arrangeColonists(p, d.total, cfg.noise, random);
        case 'build': return chooseBuild(view, cfg, random);
        case 'privilege': return { type: 'privilege', good: [...d.goods].sort((a, b) => GOOD_PRICE[b] - GOOD_PRICE[a])[0] };
        case 'sell': {
            const best = [...view.options.sellable].sort((a, b) => view.options.prices[b] - view.options.prices[a])[0];
            return { type: 'sell', good: view.options.prices[best] > 0 || random() < 0.3 ? best : null };
        }
        case 'ship': return chooseShip(view, d, cfg, random);
        case 'store': return chooseStore(view, d);
        default: return null;
    }
}

function randomCommand(view, random) {
    const d = view.decision;
    const p = view.players[view.seat];
    switch (d.kind) {
        case 'role': return { type: 'role', role: pick(view.roles.filter(r => r.taken === null), random).id };
        case 'settle': {
            const takes = [...view.faceUp.map((_, i) => i), ...(d.canQuarry ? ['quarry'] : [])];
            return { type: 'settle', take: takes.length && p.island.length < 12 ? pick(takes, random) : null };
        }
        case 'mayor': return arrangeColonists(p, d.total, 8, random);
        case 'build': return { type: 'build', building: random() < 0.7 ? pick(view.options.buildable, random) : null };
        case 'privilege': return { type: 'privilege', good: pick(d.goods, random) };
        case 'sell': return { type: 'sell', good: pick(view.options.sellable, random) };
        case 'ship': return { type: 'ship', ...pick(d.options, random) };
        case 'store': return chooseStore(view, d);
        default: return null;
    }
}

export const isCpuToAct = game => !game.isOver() && !!game.decision && game.players[game.decision.seat].isCPU;

// 決める番が CPU なら、1 手打つ。打てたら true
export function runCpuStep(game, levelOf = () => 'normal') {
    if (!isCpuToAct(game)) return false;
    const seat = game.decision.seat;
    const view = createGameView(game, seat);
    const command = chooseCommand(view, LEVELS[levelOf(seat)] ?? LEVELS.normal);
    if (command && game.applyCommand(seat, command)) return true;
    // 想定外の断りでも止めない：無作為な合法手を何度か試す
    for (let i = 0; i < 20; i++) {
        const retry = chooseCommand(view, LEVELS.random, createRandom(i * 7919 + seat));
        if (retry && game.applyCommand(seat, retry)) return true;
    }
    return false;
}

// ヒント：人の番に、CPU（いちばん強い設定）が選ぶ手を返す。CPU と同じく、その席から見える情報だけで決める
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (!(!game.isOver() && game.decision?.seat === seat)) return null;
    return chooseCommand(createGameView(game, seat), LEVELS.strong);
}
