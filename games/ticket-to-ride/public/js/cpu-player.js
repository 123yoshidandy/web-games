/**
 * CPU の判断（DOM に依存しない）。見るのは自分のビューだけ（ほかの人の手札・目的地と、山の並びはのぞかない）
 *
 * 目的地を考えて線路を引く
 * - 計画：達成していない目的地ごとに、今引ける路線で一番短い道（自分の路線は0両、ほかの人の路線は通れない）を求め、
 *   点の高い目的地から順に、前の目的地の道を0両と見て重ねる。道に使う路線が「引きたい路線」
 * - 手番：引きたい路線を払えるなら、長いもの（ほかの人に取られやすく、点も高い）から引く。
 *   払えなければ、足りない色のカードを表から取る。合う色がなければ山から引く（表の機関車は、合う色がないときだけ）
 * - 目的地を全部つないだら、まだ早い時期（列車28両以上・終わりまで24手番以上）なら新しい目的地を引く。
 *   そうでなければ、長い路線（4両以上）を狙ってカードを集めて引き、点を稼ぐ
 * - 終わりが近い（最後の1周、自分の列車が8両以下、ほかの人の列車が5両以下）ときは、払える一番長い路線を引いて列車を使い切りにいく
 * - 目的地を選ぶとき：残す組み合わせごとに、目的地の点と道の路線の点から、かかる手番（カード集めと引く手番）を差し引いて比べる。
 *   終わりまでの手番を超える計画は、つなぎきれない見込みが高いので低く見る
 *
 * 強さ：ふつう（normal）とやさしい（easy）。やさしいは、目的地を先頭から最少の枚数だけ残し、カードは山から引くことが多く、
 * 途中で目的地を引かず、長い路線を狙ってカードを集めることもしない
 * CPU の判断にはゲームの乱数を使わない（記録の再現がずれるため）。状態から作った別の乱数を使う
 */

import { createRandom } from './random.js';
import { ROUTES, TICKETS, CITIES, COLORS, LOCO, ROUTE_POINTS } from './map.js';
import { routeBlockReason, paymentOptions, connected, DECK_SLOT } from './game.js';
import { createGameView } from './game-view.js';

export const LEVELS = {
    // faceUp：表のカードを見る割合、ticketTrains・ticketTurns：新しい目的地を引く、自分の列車の数と終わりまでの手番の見込み（0 なら引かない）
    // turnValue：手番1回の重み（点）
    // farm：目的地をつないだあと、長い路線を狙ってカードを集めるか
    normal: { faceUp: 1, ticketTrains: 28, ticketTurns: 24, turnValue: 4, farm: true, noise: 0.2 },
    easy: { faceUp: 0.35, ticketTrains: 0, ticketTurns: 12, turnValue: 2.2, farm: false, noise: 1.5 }
};

// 引ける路線か（ほかの人の路線・複線の決まり・列車の数）
const usable = (view, me, id) => !routeBlockReason(view.claimed, view.players.length, me.id, me.trains, id);

// 都市 a から b への一番短い道。free は「0両と見る路線」の集合。{ cost, routes（引く路線）} か null
export function shortestPath(view, me, a, b, free = new Set()) {
    const dist = new Map([[a, 0]]);
    const via = new Map();
    const done = new Set();
    const cities = Object.keys(CITIES);
    while (true) {
        let city = null;
        let best = Infinity;
        cities.forEach(c => {
            if (!done.has(c) && dist.has(c) && dist.get(c) < best) {
                best = dist.get(c);
                city = c;
            }
        });
        if (city === null) return null;
        if (city === b) break;
        done.add(city);
        ROUTES.forEach(r => {
            if (r.a !== city && r.b !== city) return;
            const next = r.a === city ? r.b : r.a;
            if (done.has(next)) return;
            let cost;
            if (view.claimed[r.id] === me.id || free.has(r.id)) cost = 0;
            else if (usable(view, me, r.id)) cost = r.len + 0.05;   // 同じ長さなら、路線の少ない道
            else return;
            const d = best + cost;
            if (!dist.has(next) || d < dist.get(next)) {
                dist.set(next, d);
                via.set(next, r.id);
            }
        });
    }
    const routes = [];
    let c = b;
    while (c !== a) {
        const id = via.get(c);
        const r = ROUTES[id];
        if (view.claimed[id] !== me.id && !free.has(id)) routes.push(id);
        c = r.a === c ? r.b : r.a;
    }
    return { cost: routes.reduce((s, id) => s + ROUTES[id].len, 0), routes };
}

// 目的地の一覧から、引きたい路線の計画を作る。{ routes: Set, cost（両）, open（つなげない目的地）}
export function makePlan(view, me, ticketIds) {
    const todo = ticketIds.map(id => TICKETS[id])
        .filter(t => !connected(me.routes, t.a, t.b))
        .sort((x, y) => y.points - x.points);
    const routes = new Set();
    const open = [];
    let cost = 0;
    todo.forEach(t => {
        const path = shortestPath(view, me, t.a, t.b, routes);
        if (!path || cost + path.cost > me.trains) {
            open.push(t.id);
            return;
        }
        path.routes.forEach(id => routes.add(id));
        cost += path.cost;
    });
    return { routes, cost, open };
}

// 路線をそろえて引くまでの手番の見込み（カードは1手番に2枚、引くのに1手番）
const planTurns = (routeIds) => [...routeIds].reduce((s, id) => s + ROUTES[id].len / 2 + 1, 0);
// 終わりまでの手番の見込み（列車の一番少ない人が、1手番に1.2両ずつ使うとみる）
const turnsLeft = (view) => Math.min(...view.players.map(p => p.trains)) / 1.2;

// 残す目的地を選ぶ（offered から min 枚以上）
function chooseTickets(view, me, conf, random) {
    const offered = me.offered;
    const min = view.phase === 'choose' ? 2 : 1;
    if (conf === LEVELS.easy) return offered.slice(0, Math.min(min, offered.length));
    let best = null;
    const n = offered.length;
    for (let mask = 1; mask < (1 << n); mask++) {
        const pick = offered.filter((_, i) => mask & (1 << i));
        if (pick.length < Math.min(min, n)) continue;
        const plan = makePlan(view, me, [...me.tickets, ...pick]);
        const points = pick.reduce((s, id) => s + TICKETS[id].points * (plan.open.includes(id) ? -1 : 1), 0);
        // 道の路線の点も入る。かかる手番（カード集めと、引く手番）は差し引く。終わりまでの手番を超える分は、つなぎきれない見込みが高い
        const turns = planTurns(plan.routes);
        const routePoints = [...plan.routes].reduce((s, id) => s + ROUTE_POINTS[ROUTES[id].len], 0);
        const over = Math.max(0, turns - turnsLeft(view));
        const value = points + routePoints - turns * conf.turnValue - over * 4 + random() * conf.noise;
        if (!best || value > best.value) best = { pick, value };
    }
    return best.pick;
}

// 払い方を選ぶ：引きたいほかの路線に要る色はなるべく残し、機関車はなるべく使わない
function choosePayment(me, route, needs) {
    const options = paymentOptions(me.hand, route);
    if (options.length === 0) return null;
    const cost = (o) => o.locos * 3 + (o.color === LOCO ? 0 : (needs[o.color] ?? 0) * 0.5 - me.hand[o.color] * 0.1);
    return options.sort((a, b) => cost(a) - cost(b))[0];
}

// 引きたい路線に、あと何枚要るか（色ごと。灰色は any）
function colorNeeds(me, routeIds) {
    const needs = {};
    routeIds.forEach(id => {
        const r = ROUTES[id];
        const key = r.color === 'gray' ? 'any' : r.color;
        needs[key] = (needs[key] ?? 0) + r.len;
    });
    COLORS.forEach(c => { if (needs[c]) needs[c] = Math.max(0, needs[c] - me.hand[c]); });
    return needs;
}

// カードを1枚引く手
function chooseDraw(view, me, needs, conf, random) {
    const candidates = [];
    view.faceUp.forEach((card, slot) => {
        if (card === null || card === undefined) return;
        if (card === LOCO) {
            if (!view.drewOne) candidates.push({ slot, value: 1.2 });
            return;
        }
        const need = needs[card] ?? 0;
        if (need > 0) candidates.push({ slot, value: 2 + need * 0.3 });
        else if (needs.any) candidates.push({ slot, value: 0.8 + Math.min(me.hand[card], 5) * 0.1 });
    });
    const deckOk = view.deckCount + view.discardCount > 0;
    if (deckOk) candidates.push({ slot: DECK_SLOT, value: 1 });
    candidates.forEach(c => { c.value += random() * conf.noise; });
    // やさしいは、表のカードをあまり見ない
    const pool = candidates.filter(c => c.slot === DECK_SLOT || random() < conf.faceUp);
    const list = (pool.length ? pool : candidates).sort((a, b) => b.value - a.value);
    // 表の機関車は1枚で手番が終わるので、2枚目に引けないときの代わりにはしない
    return list.length ? { type: 'draw', slot: list[0].slot } : null;
}

// rand を渡さないときの迷い。見えている局面から作るので、同じ局面なら同じ手を選ぶ
function viewRandom(view) {
    const s = JSON.stringify(view);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return createRandom(h >>> 0);
}

// ビューから、次の操作を1つ決める（手番でなければ null）
export function chooseCommand(view, level = 'normal', random = viewRandom(view)) {
    if (view.phase === 'end' || !view.actors.includes(view.you)) return null;
    const conf = LEVELS[level] ?? LEVELS.normal;
    const me = view.players[view.you];
    if (me.offered) return { type: 'keep', tickets: chooseTickets(view, me, conf, random) };

    const plan = makePlan(view, me, me.tickets);
    const allDone = plan.routes.size === 0;
    const lastRound = view.lastPlayer !== null;
    // 終わりが近い：最後の1周、自分の列車が少ない、ほかの人の列車が少ない
    const others = view.players.filter(p => p.id !== me.id).map(p => p.trains);
    const short = lastRound || me.trains <= 8 || Math.min(...others) <= 5;
    // 目的地を全部つないだら、長い路線（終わり近くは、残りの列車に合う路線）を狙う
    const targets = (allDone && conf.farm) || short
        ? ROUTES.filter(r => r.len >= (short ? 1 : 4) && usable(view, me, r.id)).sort((a, b) => b.len - a.len).slice(0, 3).map(r => r.id)
        : [];
    const needs = colorNeeds(me, allDone ? targets : plan.routes);
    if (view.drewOne) return chooseDraw(view, me, needs, conf, random) ?? { type: 'pass' };

    // 引きたい路線を、長いものから
    const wanted = [...plan.routes].filter(id => usable(view, me, id)).sort((a, b) => ROUTES[b].len - ROUTES[a].len);
    for (const id of wanted) {
        const pay = choosePayment(me, ROUTES[id], needs);
        if (pay) return { type: 'claim', route: id, ...pay };
    }
    // 目的地を全部つないだ：列車が十分あれば、新しい目的地を引く
    if (allDone && conf.ticketTrains > 0 && !lastRound && me.trains >= conf.ticketTrains && turnsLeft(view) >= conf.ticketTurns && view.ticketDeckCount > 0) return { type: 'tickets' };
    // 目的地に要る路線がない、または最後の1周：長い路線で点を稼ぐ（終わり近くは、残りの列車に合うもの）
    if (allDone || short) {
        const extra = ROUTES.filter(r => r.len >= (short ? 1 : 3) && usable(view, me, r.id) && paymentOptions(me.hand, r).length > 0)
            .sort((a, b) => b.len - a.len);
        if (extra.length && (short || extra[0].len >= 4 || targets.length === 0)) {
            return { type: 'claim', route: extra[0].id, ...choosePayment(me, extra[0], needs) };
        }
    }
    const draw = chooseDraw(view, me, needs, conf, random);
    if (draw) return draw;
    // 引くカードがない：払える路線をどれか引く。それもなければ目的地、最後は見送り
    const any = ROUTES.filter(r => usable(view, me, r.id) && paymentOptions(me.hand, r).length > 0).sort((a, b) => b.len - a.len);
    if (any.length) return { type: 'claim', route: any[0].id, ...choosePayment(me, any[0], needs) };
    if (view.ticketDeckCount > 0) return { type: 'tickets' };
    return { type: 'pass' };
}

// ヒント：人のビューから、おすすめの手（CPU の「ふつう」が選ぶ手）を返す。自分の番でなければ null
export function suggest(view) {
    return chooseCommand(view, 'normal');
}

// ---- ゲームを進める ----

// 操作を待っている CPU（いなければ undefined）
export function cpuActor(game) {
    return game.actors().find(seat => game.players[seat].isCPU);
}

export function isCpuTurn(game) {
    return cpuActor(game) !== undefined;
}

// CPU に1手打たせる。決めた手が通らなければ、単純な手で進める。進めたら true
export function runCpuStep(game, level = game.options.level, seat = cpuActor(game)) {
    if (seat === undefined) return false;
    const view = createGameView(game, seat, { events: false, since: Infinity });
    const random = createRandom((game.options.seed ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ seat) >>> 0);
    const command = chooseCommand(view, level, random);
    if (command && game.applyCommand(seat, command)) return true;
    const p = game.players[seat];
    if (p.offered) return game.applyCommand(seat, { type: 'keep', tickets: [...p.offered] });
    for (let slot = 0; slot <= DECK_SLOT; slot++) if (game.applyCommand(seat, { type: 'draw', slot })) return true;
    for (const r of ROUTES) {
        const pay = paymentOptions(p.hand, r)[0];
        if (pay && game.applyCommand(seat, { type: 'claim', route: r.id, ...pay })) return true;
    }
    return game.applyCommand(seat, { type: 'tickets' }) || game.applyCommand(seat, { type: 'pass' });
}

