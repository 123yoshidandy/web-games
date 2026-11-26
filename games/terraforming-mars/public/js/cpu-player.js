/**
 * CPU：自分のビュー（自分の手札、全員の盤・資源・生産）だけを見て選ぶ
 * カードと行動の値打ちを M€ に換算して比べる。生産の値打ちは、残りの世代の見込み（グローバル・パラメータの残り）で変わる
 * ゆらぎ（noise）で強さを変える。random は合法な手から無作為に選ぶ（測定用）
 */

import { cardOf } from './cards.js';
import { SPACES, isOnMars, neighbors, TEMPERATURE, OXYGEN, OCEANS } from './data.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

export const LEVELS = {
    easy: { noise: 8, greed: 1.0 },
    normal: { noise: 1.5, greed: 0.6 },
    strong: { noise: 0, greed: 0.6 },
    random: { random: true }
};

function viewRandom(view) {
    let h = 2166136261;
    const s = `${view.seat}|${view.generation}|${view.eventSeq}|${view.decision?.kind}`;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return createRandom(h >>> 0);
}

const pick = (list, random) => list[Math.floor(random() * list.length)];

// 残りの世代の見込み
export function gensLeft(view) {
    const steps = (TEMPERATURE.max - view.temperature) / TEMPERATURE.step + (OXYGEN.max - view.oxygen) + (OCEANS.max - view.oceans);
    return Math.max(1, Math.round(steps / (3 + view.players.length)));
}

const PROD = { mc: 1, steel: 1.6, titanium: 2.4, plants: 1.8, energy: 1.4, heat: 0.7 };
const STOCK = { mc: 1, steel: 2, titanium: 3, plants: 1.2, energy: 0.8, heat: 0.5 };
const TR = 7;

// 効果の値打ち（M€）
function effectValue(view, e) {
    const left = gensLeft(view);
    let v = 0;
    const prod = e.or ? e.or[0].production : e.production;
    const est = n => {
        if (typeof n === 'number') return n;
        if (n.count === 'cities') return Object.values(view.tiles).filter(t => t.type === 'city').length;
        if (n.count === 'citiesOnMars') return Object.entries(view.tiles).filter(([id, t]) => t.type === 'city' && isOnMars(id)).length;
        if (n.count === 'tagAtLeast') return (view.players[view.seat].tags[n.tag] ?? 0) >= n.min ? n.then : n.else;
        return Math.floor(((view.players[view.seat].tags[n.tag] ?? 0) + 1) / n.per);
    };
    for (const [r, n] of Object.entries({ ...prod }).concat(Object.entries(e.productionAfter ?? {}))) v += est(n) * PROD[r] * Math.min(left, 8);
    for (const [r, n] of Object.entries(e.stock ?? {})) v += est(n) * STOCK[r];
    if (e.global?.temperature) v += Math.min(e.global.temperature, (TEMPERATURE.max - view.temperature) / 2) * TR;
    if (e.global?.oxygen) v += Math.min(e.global.oxygen, OXYGEN.max - view.oxygen) * TR;
    v += (e.tr ?? 0) * TR;
    v += Math.min(e.ocean ?? 0, OCEANS.max - view.oceans) * (TR + 2);
    if (e.city) v += 10 + left;
    // 特別なタイル：都市は都市と同じ、海洋は海洋と同じ、ほかは配置ボーナスとタイルの数の分
    if (e.tile?.type === 'city') v += (isOnMars(e.tile.on) ? 10 : 4) + left;
    if (e.tile?.type === 'ocean') v += OCEANS.max > view.oceans ? TR + 2 : 0;
    if (e.tile?.type === 'special') v += 3;
    // 採掘権：置いたマスの鋼鉄かチタンの生産 +1
    if (e.tile?.on === 'mining') v += (PROD.steel + PROD.titanium) / 2 * Math.min(left, 8);
    if (e.greenery) v += TR + 5;
    if (e.draw) v += e.draw * 3;
    if (e.removeAnyPlants) v += 2;
    if (e.decreaseAnyProduction) v += 3;
    v += (e.addHere ?? 0) * 2.5 + [e.addAny ?? []].flat().reduce((s, a) => s + 1 + (a.count ?? 1), 0) + (e.removeAny ? 2 : 0) + (e.searchForLife ? 2 : 0);
    if (e.flood) v += 2;
    if (e.plantsOr) v += e.plantsOr.plants * STOCK.plants;
    // 断熱：熱の生産を M€ の生産に変える（熱が余っているほど値打ちがある）
    if (e.insulation) v += view.players[view.seat].prod.heat * (PROD.mc - PROD.heat) * Math.min(left, 8);
    return v;
}

// 温度・酸素・海洋の条件を、slack 段階ゆるめたときに満たすか（タグなどほかの条件は満たすとみなす）
function globalReqOk(view, card, slack) {
    return (card.req ?? []).every(r => {
        const [[k, v]] = Object.entries(r).filter(([x]) => x !== 'max');
        const now = { temperature: view.temperature, oxygen: view.oxygen, oceans: view.oceans }[k];
        if (now === undefined) return true;
        const step = k === 'temperature' ? 2 * slack : slack;
        return r.max ? now <= v + step : now >= v - step;
    });
}

// 常時の効果・誘発の値打ち（残りの世代に得られる見込み）
function ongoingValue(view, key) {
    const left = Math.min(gensLeft(view), 8);
    const slack = view.options?.reqSlack ?? 0;
    switch (key) {
        case 'adaptationTechnology': return 4;
        case 'researchOutpost': return left * 1.5;
        case 'shuttles': return left;
        case 'immigrantCity': return left * 1.5;
        case 'roverConstruction': return left * 1.2;
        case 'arcticAlgae': return (OCEANS.max - view.oceans) * 2 * STOCK.plants * 0.8;
        case 'optimalAerobraking': return 2 + (view.hand ?? []).filter(k => cardOf(k).type === 'event' && cardOf(k).tags.includes('space')).length * 4.5;
        // 特別設計：手札に、条件があと 2 段階ゆるめば出せるカードがあるときだけ
        case 'specialDesign': return (view.hand ?? []).some(k => k !== key && !globalReqOk(view, cardOf(k), slack) && globalReqOk(view, cardOf(k), slack + 2)) ? 9 : 0;
        default: return 0;
    }
}

// カード 1 枚の値打ち（M€）。行動を持つカードは、残りの世代に使える分を足す
export function cardValue(view, key) {
    const c = cardOf(key);
    let v = effectValue(view, c.effect) + ongoingValue(view, key);
    if (typeof c.vp === 'number') v += c.vp * 5;
    if (c.vp?.cities || c.vp?.tag || c.vp?.searchForLife || c.vp?.oceansNextTo) v += 5;
    if (c.vp?.resources) v += 4;
    if (c.action) v += Math.max(...(c.action.or ?? [c.action]).map(a => actionValue(view, a))) * Math.min(gensLeft(view), 6) * 0.6;
    v += c.tags.length * 0.5;
    return v;
}

// カードの行動 1 回の値打ち（払うものを引く）
export function actionValue(view, a) {
    return effectValue(view, a.effect) - (a.spend?.mc ?? 0) - (a.spend?.energy ?? 0) * 1.5 - (a.spend?.here ?? 0) * 2;
}

// タイルの置き場所の値打ち
function spaceValue(view, seat, tile, id) {
    const s = SPACES.find(x => x.id === id);
    let v = s.bonus.length * 2;
    const nb = neighbors(id);
    v += nb.filter(x => view.tiles[x]?.type === 'ocean').length * 2;
    if (tile === 'greenery') v += nb.filter(x => view.tiles[x]?.type === 'city' && view.tiles[x].owner === seat).length * 3;
    if (tile === 'city') v += nb.filter(x => !view.tiles[x] && !SPACES.find(y => y.id === x).ocean).length * 0.8 + nb.filter(x => view.tiles[x]?.type === 'greenery').length;
    return v;
}

function chooseKeep(view, cards, money, cfg, random) {
    const scored = cards.map(k => ({ k, v: cardValue(view, k) - cardOf(k).cost * cfg.greed + (random() - 0.5) * cfg.noise * 2 }))
        .filter(x => x.v > 3).sort((a, b) => b.v - a.v);
    return scored.slice(0, Math.floor(money / 3)).map(x => x.k);
}

function chooseAction(view, cfg, random) {
    const o = view.options;
    const me = view.players[view.seat];
    const candidates = [];
    const noise = () => (random() - 0.5) * cfg.noise * 2;
    if (o.milestones.length) return { type: 'milestone', key: o.milestones[0] };
    if (o.convertPlants) candidates.push({ c: { type: 'convertPlants' }, v: 30 });
    if (o.convertHeat) candidates.push({ c: { type: 'convertHeat' }, v: 25 });
    if (o.unmi) candidates.push({ c: { type: 'unmi' }, v: 20 });
    for (const a of o.cardActions ?? []) {
        const variants = cardOf(a.card).action?.or ?? [cardOf(a.card).action ?? { spend: { mc: 1 }, effect: { searchForLife: true } }];
        for (const i of a.variants) candidates.push({ c: { type: 'cardAction', card: a.card, variant: i }, v: actionValue(view, variants[i]) + 3 + noise() });
    }
    for (const k of o.playable) candidates.push({ c: { type: 'play', card: k, pay: o.autoPay[k] }, v: cardValue(view, k) - o.costs[k] * cfg.greed + noise() });
    const sp = { asteroid: TR * 1.4, aquifer: TR * 1.4 + 2, greenery: TR * 1.4 + 6, city: 12 + gensLeft(view), powerPlant: 1.4 * Math.min(gensLeft(view), 8) };
    for (const k of o.standard) if (sp[k] !== undefined) candidates.push({ c: { type: 'standard', project: k }, v: sp[k] - o.standardCosts[k] * cfg.greed + noise() - 2 });
    // 褒賞は、自分が先頭のときだけ
    for (const k of o.awards) {
        const val = p => ({ landlord: Object.values(view.tiles).filter(t => t.owner === p.id).length, banker: p.prod.mc, scientist: p.tags.science ?? 0, thermalist: p.res.heat, miner: p.res.steel + p.res.titanium }[k]);
        if (view.players.every(p => p.id === me.id || val(me) > val(p) + 1)) candidates.push({ c: { type: 'award', key: k }, v: 12 + noise() });
    }
    const best = candidates.sort((a, b) => b.v - a.v)[0];
    if (best && best.v > 0) return best.c;
    // 手札が多すぎて動けないときは、値打ちの低いカードを売る
    if (view.hand.length > 8 && o.standard.includes('sellPatents')) {
        const worst = [...view.hand].sort((a, b) => cardValue(view, a) - cardValue(view, b)).slice(0, view.hand.length - 6);
        return { type: 'standard', project: 'sellPatents', cards: worst };
    }
    return view.decision.done ? { type: 'endTurn' } : { type: 'pass' };
}

export function chooseCommand(view, cfg = LEVELS.normal, random = viewRandom(view)) {
    const d = view.decision;
    if (!d) return null;
    if (cfg.random) return randomCommand(view, random);
    const me = view.players[view.seat];
    switch (d.kind) {
        case 'setup': {
            const corp = [...d.corps].sort((a, b) => corpValue(b) - corpValue(a))[0];
            return { type: 'setup', corp, keep: chooseKeep(view, d.cards, cardOf(corp).mc - 15, cfg, random) };
        }
        case 'research': return { type: 'research', keep: chooseKeep(view, d.cards, me.res.mc, cfg, random) };
        case 'action': return chooseAction(view, cfg, random);
        case 'place': return { type: 'place', space: [...d.options].sort((a, b) => spaceValue(view, view.seat, d.tile, b) - spaceValue(view, view.seat, d.tile, a))[0] };
        case 'target': {
            const others = d.options.filter(s => s !== view.seat);
            if (!others.length) return { type: 'target', seat: d.optional ? null : d.options[0] };
            const key = d.what === 'removePlants' ? s => view.players[s].res.plants : d.what === 'removeMc' ? s => view.players[s].res.mc : s => view.players[s].tr;
            return { type: 'target', seat: others.sort((a, b) => key(b) - key(a))[0] };
        }
        // 値打ちのいちばん高い選び方
        case 'choose': return { type: 'choose', index: d.options.map((o, i) => ({ i, v: effectValue(view, o) })).sort((a, b) => b.v - a.v)[0].i };
        case 'targetCard': {
            // 載せるなら自分の点になるカード、取り除くならほかの人のカード
            const list = d.what === 'add' ? d.options : [...d.options.filter(o => o.seat !== view.seat), ...d.options.filter(o => o.seat === view.seat)];
            const best = d.what === 'add' ? [...list].sort((a, b) => (cardOf(b.card).vp ? 1 : 0) - (cardOf(a.card).vp ? 1 : 0))[0] : list[0];
            return { type: 'targetCard', seat: best.seat, card: best.card };
        }
        case 'finalGreenery': return { type: 'finalGreenery', space: [...d.options].sort((a, b) => spaceValue(view, view.seat, 'greenery', b) - spaceValue(view, view.seat, 'greenery', a))[0] };
        default: return null;
    }
}

function corpValue(key) {
    const c = cardOf(key);
    return c.mc + Object.entries(c.stock).reduce((s, [r, n]) => s + n * STOCK[r], 0) + Object.entries(c.production).reduce((s, [r, n]) => s + n * PROD[r] * 6, 0);
}

function randomCommand(view, random) {
    const d = view.decision;
    const me = view.players[view.seat];
    switch (d.kind) {
        case 'setup': return { type: 'setup', corp: pick(d.corps, random), keep: d.cards.filter(() => random() < 0.3).slice(0, 5) };
        case 'research': return { type: 'research', keep: d.cards.filter(() => random() < 0.4).slice(0, Math.floor(me.res.mc / 3)) };
        case 'action': {
            const o = view.options;
            const acts = o.playable.map(k => ({ type: 'play', card: k, pay: o.autoPay[k] }));
            o.standard.filter(k => k !== 'sellPatents').forEach(k => acts.push({ type: 'standard', project: k }));
            if (o.convertPlants) acts.push({ type: 'convertPlants' });
            if (o.convertHeat) acts.push({ type: 'convertHeat' });
            (o.cardActions ?? []).forEach(a => acts.push({ type: 'cardAction', card: a.card, variant: a.variants[0] }));
            if (!acts.length || random() < 0.1) return d.done ? { type: 'endTurn' } : { type: 'pass' };
            return pick(acts, random);
        }
        case 'place': return { type: 'place', space: pick(d.options, random) };
        case 'target': return { type: 'target', seat: pick(d.options, random) };
        case 'choose': return { type: 'choose', index: 0 };
        case 'targetCard': return { type: 'targetCard', ...pick(d.options, random) };
        case 'finalGreenery': return { type: 'finalGreenery', space: d.options[0] };
        default: return null;
    }
}

// ヒント：人のビューから、おすすめの手（CPU の「ふつう」が選ぶ手）を返す。自分が答える番でなければ null
export function suggest(view) {
    if (!view?.decision || view.decision.seat !== view.seat || view.phase === 'end') return null;
    return chooseCommand(view, LEVELS.normal);
}

export const isCpuToAct = game => !game.isOver() && !!game.decision && game.players[game.decision.seat].isCPU;

export function runCpuStep(game, levelOf = () => 'normal') {
    if (!isCpuToAct(game)) return false;
    const seat = game.decision.seat;
    const view = createGameView(game, seat);
    const command = chooseCommand(view, LEVELS[levelOf(seat)] ?? LEVELS.normal);
    if (command && game.applyCommand(seat, command)) return true;
    for (let i = 0; i < 20; i++) {
        const retry = chooseCommand(view, LEVELS.random, createRandom(i * 7919 + seat));
        if (retry && game.applyCommand(seat, retry)) return true;
    }
    return game.decision?.kind === 'action' && game.applyCommand(seat, { type: 'pass' });
}
