/**
 * CPU：自分のビュー（自分の手札・全員の場札・自分の判断と費用の材料）だけを見て選ぶ
 * カードの値打ち（勝利点・力・6 コストの開発の得点の見込み）で、行動・残すカード・開発・入植・消費を決める
 * ゆらぎ（noise）で強さを変える。random は合法な手から無作為に選ぶ（測定用）
 */

import { cardOf, keyOf, TRADE_VALUE } from './cards.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

export const LEVELS = {
    easy: { noise: 2.5, actionNoise: 3, plan: 0.5 },
    normal: { noise: 0.8, actionNoise: 1, plan: 1 },
    strong: { noise: 0, actionNoise: 0, plan: 1 },
    random: { random: true }
};

// ビューから CPU 用の乱数を作る（ゲームの乱数は使わない）
function viewRandom(view) {
    let h = 2166136261;
    const s = `${view.seat}|${view.round}|${view.phase}|${view.eventSeq}|${(view.hand ?? []).join(',')}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return createRandom(h >>> 0);
}

const pick = (list, random) => list[Math.floor(random() * list.length)];

// カード 1 枚の値打ち（場に置いたとき）。自分の場との相性を少し足す
export function cardValue(id, view) {
    const c = cardOf(id);
    const me = view.players[view.seat];
    let v = c.vp;
    for (const p of c.powers ?? []) {
        if (p.phase === 4 && p.code.some(x => x.startsWith('CONSUME'))) v += 0.6 * (p.value ?? 1) * (p.times ?? 1);
        else if (p.phase === 5 && p.code.includes('PRODUCE')) v += 1.2;
        else if (p.phase === 3 && p.code.includes('EXTRA_MILITARY')) v += 0.4 * Math.max(0, p.value);
        else if (p.phase === 3 && p.code.includes('REDUCE')) v += 0.6;
        else if (p.phase === 2 && p.code.includes('REDUCE')) v += 0.8 * p.value;
        else v += 0.6;
    }
    if (c.flags?.includes('windfall')) v += 0.6;
    if (c.bonus) {
        // 6 コストの開発：いまの場で当てはまるカードの数で見込む
        const tableau = me.tableau.map(cardOf);
        const count = c.bonus.reduce((s, b) => s + (b.type === 'NAME' ? tableau.filter(t => t.key === b.name).length * b.value : 0), 0);
        v += 3 + count + Math.min(4, tableau.length * 0.35);
    }
    return v;
}

// 手札に残す値打ち（安いカードほど出しやすい）
function keepValue(id, view) {
    const c = cardOf(id);
    return cardValue(id, view) - c.cost * 0.25 + (c.type === 'world' && !c.flags?.includes('military') ? 0.2 : 0);
}

const sortBy = (list, f) => [...list].sort((a, b) => f(a) - f(b));

// 置けるかと、置いたときの値打ち
function developPlan(view, opts, handSize) {
    let best = null;
    for (const [id, o] of Object.entries(opts.develop)) {
        if (o.duplicate || o.cost > handSize - 1) continue;
        const value = cardValue(id, view);
        const score = value - o.cost * 0.45;
        if (!best || score > best.score) best = { id, cost: o.cost, score, value };
    }
    return best;
}

function settlePlan(view, opts, handSize) {
    let best = null;
    for (const [id, o] of Object.entries(opts.settle)) {
        let plan = null;
        if (!o.military) {
            const cost = o.colonyShip && o.cost >= 2 ? 0 : o.cost;
            if (cost <= handSize - 1) plan = { id, cost, colonyShip: cost === 0 && o.cost > 0 ? opts.colonyShip : undefined };
        } else if (o.strength >= o.need) plan = { id, cost: 0 };
        else if (o.strength + 3 * opts.tactics.length >= o.need) plan = { id, cost: 0, tactics: opts.tactics.slice(0, Math.ceil((o.need - o.strength) / 3)) };
        else if (o.payCost !== undefined && o.payCost <= handSize - 1) plan = { id, cost: o.payCost, payMilitary: true };
        if (!plan) continue;
        plan.value = cardValue(id, view);
        plan.score = plan.value + 0.6 - plan.cost * 0.4 - (plan.tactics?.length ?? 0) * 1.5 - (plan.colonyShip ? 1 : 0);
        if (!best || plan.score > best.score) best = plan;
    }
    return best;
}

function payWith(view, exclude, n) {
    return sortBy(view.hand.filter(id => id !== exclude), id => keepValue(id, view)).slice(0, n);
}

function consumePowers(view) {
    return view.players[view.seat].tableau.flatMap(id => (cardOf(id).powers ?? []).filter(p => p.phase === 4 && p.code.some(c => c.startsWith('CONSUME'))));
}

// 消費で得られる勝利点の見込み（商品の数と、消費の力で）
function consumeVp(view) {
    const me = view.players[view.seat];
    let goods = me.goods.length;
    const powers = consumePowers(view).filter(p => p.code.includes('GET_VP')).map(p => ({ per: p.code.includes('CONSUME_TWO') || p.code.includes('CONSUME_3_DIFF') ? p.value / 2 : p.value, times: p.code.includes('CONSUME_ALL') ? 99 : p.times ?? 1 }));
    let vp = 0;
    for (const p of powers.sort((a, b) => b.per - a.per)) {
        const n = Math.min(goods, p.times);
        vp += n * p.per;
        goods -= n;
    }
    return vp;
}

// 行動ごとの勝利点の見込み（手札 1 枚は約 0.5 点とみる）
function chooseActions(view, cfg, random) {
    const me = view.players[view.seat];
    const hand = view.hand.length;
    const opts = view.options;
    const card = hand <= 2 ? 0.7 : 0.5;
    const goods = me.goods.length;
    const emptyProduction = me.tableau.filter(id => (cardOf(id).powers ?? []).some(p => p.phase === 5 && p.code.includes('PRODUCE')) && !me.goods.includes(id)).length;
    const emptyWindfall = me.tableau.filter(id => cardOf(id).flags?.includes('windfall') && !me.goods.includes(id)).length;
    const dev = developPlan(view, opts, hand + 1);
    const settle = settlePlan(view, opts, hand);
    const cvp = consumeVp(view);
    const bestPrice = goods ? Math.max(...me.goods.map(g => TRADE_VALUE[cardOf(g).good])) : 0;
    const scores = {
        // +1+1 は手札が 2 枚増える。+5 は 1 枚だが、7 枚から良いカードを選べる
        explore5: card + (hand <= 1 ? 0.8 : 0.3),
        explore1: card * 2 + (hand <= 2 ? 0.3 : 0),
        develop: dev ? dev.value - Math.max(0, dev.cost - 1) * card * 0.6 + 0.3 : -1,
        settle: settle ? settle.value - settle.cost * card * 0.6 + card : -1,
        trade: goods ? bestPrice * card + cvp * 0.5 : -1,
        vp2: goods && cvp ? cvp * 1.6 : -1,
        produce: emptyProduction || emptyWindfall ? emptyProduction * 0.9 + (emptyWindfall ? 0.6 : 0) : -1
    };
    if (view.advanced) {
        scores.develop2 = scores.develop - 0.3;
        scores.settle2 = scores.settle - 0.3;
    }
    for (const a of Object.keys(scores)) scores[a] = scores[a] * cfg.plan + (random() - 0.5) * cfg.actionNoise * 2;
    const ranked = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
    return ranked.slice(0, view.decision.count);
}

function chooseConsume(view, d, cfg, random) {
    const me = view.players[view.seat];
    const goodsByValue = sortBy(me.goods, g => TRADE_VALUE[cardOf(g).good]);
    const pickGoods = o => {
        let list = goodsByValue.filter(g => !o.kind || cardOf(g).good === o.kind);
        if (o.diff) {
            const seen = new Set();
            list = list.filter(g => !seen.has(cardOf(g).good) && seen.add(cardOf(g).good));
        }
        return list.slice(0, o.need);
    };
    // 商品を使う力：勝利点の多い力から
    const mandatory = d.options.filter(o => !o.optional);
    if (mandatory.length) {
        const best = sortBy(mandatory, o => -((o.power.code.includes('GET_VP') ? o.power.value * 2 : 0) + (o.power.code.some(c => c.includes('CARD')) ? 1 : 0)) / Math.max(1, o.need))[0];
        return { type: 'consume', use: best.use, goods: pickGoods(best) };
    }
    for (const o of d.options) {
        if (o.trade && view.hand.length <= 4) return { type: 'consume', use: o.use, goods: [goodsByValue.at(-1)] };
        if (o.discard && view.hand.length > 5) return { type: 'consume', use: o.use, cards: payWith(view, null, Math.min(o.discard, view.hand.length - 4)) };
        if (o.lucky && random() < 0.7) return { type: 'consume', use: o.use, number: pick([1, 2, 2, 3], random) };
    }
    return { type: 'consume', done: true };
}

export function chooseCommand(view, cfg = LEVELS.normal, random = viewRandom(view)) {
    const d = view.decision;
    if (!d) return null;
    if (cfg.random) return randomCommand(view, random);
    const noisy = id => keepValue(id, view) + (random() - 0.5) * cfg.noise * 2;
    switch (d.kind) {
        case 'startDiscard':
        case 'discard':
            return { type: d.kind, cards: sortBy(view.hand, noisy).slice(0, d.count) };
        case 'action':
            return { type: 'action', actions: chooseActions(view, cfg, random) };
        case 'explore':
            return { type: 'explore', keep: sortBy(d.drawn, id => -noisy(id)).slice(0, Math.min(d.keep, d.drawn.length)) };
        case 'develop': {
            const plan = developPlan(view, view.options, view.hand.length);
            if (!plan || plan.score + (random() - 0.5) * cfg.noise < -0.5) return { type: 'develop', card: null, pay: [] };
            return { type: 'develop', card: plan.id, pay: payWith(view, plan.id, plan.cost) };
        }
        case 'settle': {
            const plan = settlePlan(view, view.options, view.hand.length);
            if (!plan || plan.score + (random() - 0.5) * cfg.noise < -0.5) return { type: 'settle', card: null, pay: [] };
            const command = { type: 'settle', card: plan.id, pay: payWith(view, plan.id, plan.cost) };
            if (plan.tactics) command.tactics = plan.tactics;
            if (plan.colonyShip) command.colonyShip = plan.colonyShip;
            if (plan.payMilitary) command.payMilitary = true;
            return command;
        }
        case 'trade': {
            const me = view.players[view.seat];
            return { type: 'trade', good: sortBy(me.goods, g => -TRADE_VALUE[cardOf(g).good])[0] };
        }
        case 'consume':
            return chooseConsume(view, d, cfg, random);
        case 'windfall':
            return { type: 'windfall', world: sortBy(d.candidates, w => -TRADE_VALUE[cardOf(w).good])[0] };
        default:
            return null;
    }
}

// 合法な手から無作為に（測定用。払いは足りる分だけ）
function randomCommand(view, random) {
    const d = view.decision;
    const me = view.players[view.seat];
    const shuffled = list => sortBy(list, () => random());
    switch (d.kind) {
        case 'startDiscard': case 'discard': return { type: d.kind, cards: shuffled(view.hand).slice(0, d.count) };
        case 'action': return { type: 'action', actions: shuffled(Object.keys(LEVEL_ACTIONS(view))).slice(0, d.count) };
        case 'explore': return { type: 'explore', keep: shuffled(d.drawn).slice(0, Math.min(d.keep, d.drawn.length)) };
        case 'develop': {
            const ok = Object.entries(view.options.develop).filter(([, o]) => !o.duplicate && o.cost <= view.hand.length - 1);
            if (!ok.length || random() < 0.3) return { type: 'develop', card: null, pay: [] };
            const [id, o] = pick(ok, random);
            return { type: 'develop', card: id, pay: shuffled(view.hand.filter(x => x !== id)).slice(0, o.cost) };
        }
        case 'settle': {
            const ok = Object.entries(view.options.settle).filter(([, o]) => (o.military ? o.strength >= o.need : o.cost <= view.hand.length - 1));
            if (!ok.length || random() < 0.3) return { type: 'settle', card: null, pay: [] };
            const [id, o] = pick(ok, random);
            return { type: 'settle', card: id, pay: o.military ? [] : shuffled(view.hand.filter(x => x !== id)).slice(0, o.cost) };
        }
        case 'trade': return { type: 'trade', good: pick(me.goods, random) };
        case 'consume': {
            const o = d.mustUse ? pick(d.options.filter(x => !x.optional), random) : (random() < 0.5 ? null : pick(d.options, random));
            if (!o) return { type: 'consume', done: true };
            if (o.discard) return { type: 'consume', use: o.use, cards: shuffled(view.hand).slice(0, 1) };
            if (o.lucky) return { type: 'consume', use: o.use, number: 1 + Math.floor(random() * 7) };
            if (o.trade) return { type: 'consume', use: o.use, goods: [pick(me.goods, random)] };
            let goods = shuffled(me.goods).filter(g => !o.kind || cardOf(g).good === o.kind);
            if (o.diff) { const seen = new Set(); goods = goods.filter(g => !seen.has(cardOf(g).good) && seen.add(cardOf(g).good)); }
            return { type: 'consume', use: o.use, goods: goods.slice(0, o.need) };
        }
        case 'windfall': return { type: 'windfall', world: pick(d.candidates, random) };
        default: return null;
    }
}

const LEVEL_ACTIONS = view => Object.fromEntries((view.advanced
    ? ['explore5', 'explore1', 'develop', 'develop2', 'settle', 'settle2', 'trade', 'vp2', 'produce']
    : ['explore5', 'explore1', 'develop', 'settle', 'trade', 'vp2', 'produce']).map(a => [a, true]));

// 判断の要る CPU の席（同時に選ぶので複数）
export const cpuSeatsToAct = game => (game.isOver() ? [] : game.players.filter((p, i) => p.isCPU && game.pending[i]).map(p => p.id));

const FALLBACK = {
    develop: { type: 'develop', card: null, pay: [] },
    settle: { type: 'settle', card: null, pay: [] },
    consume: { type: 'consume', done: true }
};

// 1 人の CPU に 1 手打たせる。打てたら true
export function runCpuStep(game, seat, levelOf = () => 'normal') {
    if (!game.players[seat]?.isCPU || !game.pending[seat]) return false;
    const view = createGameView(game, seat);
    const level = levelOf(seat);
    const command = chooseCommand(view, LEVELS[level] ?? LEVELS.normal);
    if (command && game.applyCommand(seat, command)) return true;
    // 想定外の断りでも止めない：無作為な合法手を何度か試す
    for (let i = 0; i < 20; i++) {
        const retry = chooseCommand(view, LEVELS.random, createRandom(i * 7919 + seat));
        if (retry && game.applyCommand(seat, retry)) return true;
    }
    const fallback = FALLBACK[game.pending[seat].kind];
    return !!fallback && game.applyCommand(seat, fallback);
}
