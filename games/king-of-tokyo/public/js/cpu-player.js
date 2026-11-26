/**
 * CPU：自分のビュー（ほぼすべて公開の情報）だけで判断する
 *
 * ダイス：目ごとに「残す値打ち」を付け、低いものを振り直す
 *   攻撃：攻撃先がいて、相手の体力が少ないほど高い。ハート：東京の外で体力が減っているほど高い
 *   数字：同じ数字がそろいそうなら高い（3 が一番高い）。エネルギー：いつも少し
 * 東京を明け渡すか：攻撃を受けたあとの体力が少なければ明け渡す
 * 買い物：カードの値打ち（勝利点の目安）を費用で割り、高いものから買う
 * 強すぎないように、ゆらぎと、慎重さの違いを入れる（LEVELS）
 */

import { createRandom } from './random.js';
import { cardOf, keyOf, WIN_POINTS } from './cards.js';
import { createGameView } from './game-view.js';

export const LEVELS = {
    easy: { noise: 0.9, yieldAt: 4, buyThreshold: 0.45, greed: 0.6 },
    normal: { noise: 0.35, yieldAt: 5, buyThreshold: 0.5, greed: 1 },
    // 強さを測るための、ゆらぎのない CPU（画面では使わない）
    strong: { noise: 0, yieldAt: 5, buyThreshold: 0.5, greed: 1 },
    // 比べるための、でたらめに打つ CPU（画面では使わない）
    random: { noise: 10, yieldAt: 0, buyThreshold: 0, greed: 0, random: true }
};

// カードの値打ち（勝利点の目安。持ち続けるカードは、ゲームの残りで得る見込み）
const CARD_VALUE = {
    acidAttack: 3.5, alienOrigin: 2, alphaMonster: 3, armorPlating: 2.5, backgroundDweller: 1.5, burrowing: 2.5,
    camouflage: 2, completeDestruction: 1, mediaFriendly: 2.5, eaterOfTheDead: 2.5, energyHoarder: 2.5, evenBigger: 3,
    extraHead: 5, fireBreathing: 2.5, freezeTime: 2, friendOfChildren: 2.5, giantBrain: 3.5, gourmet: 2, healingRay: 1.5,
    herbivore: 3, herdCuller: 2, itHasAChild: 4, jets: 2.5, madeInALab: 1.5, metamorph: 1, mimic: 3, batteryMonster: 2.5,
    novaBreath: 4, detritivore: 2.5, opportunist: 2, parasiticTentacles: 2, plotTwist: 1.5, poisonQuills: 2, poisonSpit: 3,
    psychicProbe: 1.5, rapidHealing: 2.5, regeneration: 2.5, rootingForTheUnderdog: 2, shrinkRay: 3.5, smokeCloud: 2,
    solarPowered: 1.5, spikedTail: 3.5, stretchy: 2, energyDrink: 2.5, urbavore: 3.5, weReOnlyMakingItStronger: 2, wings: 3,
    apartmentBuilding: 3, commuterTrain: 2, cornerStore: 1, deathFromAbove: 3.5, energize: 3, evacuationOrders: 4,
    flameThrower: 2.2, frenzy: 4.5, gasRefinery: 4, heal: 1.2, highAltitudeBombing: 1.5, jetFighters: 3, nationalGuard: 1.4,
    nuclearPowerPlant: 3.2, skyscraper: 4, tank: 2.6, vastStorm: 3.2
};

function viewRandom(view) {
    return createRandom((Math.imul(view.eventSeq + 1, 2654435761) ^ Math.imul(view.seat + 1, 40503) ^ (view.turnNo * 977)) >>> 0);
}

const hasCard = (p, key) => p.cards.some(id => keyOf(id) === key);

// カードの、今の値打ち（場面で上下させる）
function cardValue(view, seat, id) {
    const me = view.players[seat];
    const key = keyOf(id);
    let value = CARD_VALUE[key] ?? 2;
    const card = cardOf(id);
    // 勝利点のカードは、20 点に届くならとても高い
    const vp = { apartmentBuilding: 3, commuterTrain: 2, cornerStore: 1, skyscraper: 4, jetFighters: 5, tank: 4, nationalGuard: 2, nuclearPowerPlant: 2, gasRefinery: 2, deathFromAbove: 2, vastStorm: 2 }[key] ?? 0;
    if (vp && me.vp + vp >= WIN_POINTS) value += 20;
    // 体力を失うカードは、体力が少ないと危ない
    const selfDamage = { jetFighters: 4, tank: 3, nationalGuard: 2, highAltitudeBombing: 3 }[key] ?? 0;
    if (selfDamage && me.health <= selfDamage + 1) value -= 10;
    if (key === 'heal' || key === 'nuclearPowerPlant') value += (me.maxHealth - me.health) * 0.25;
    if (key === 'evenBigger') value += (me.maxHealth - me.health) * 0.1;
    // 持ち続けるカードは、ゲームの終わりが近いほど値打ちが下がる
    const leader = Math.max(...view.players.filter(p => p.alive).map(p => p.vp));
    if (card.kind === 'keep') value *= Math.max(0.3, 1 - leader / 25);
    if (card.kind === 'keep' && hasCard(me, key) && !['extraHead', 'evenBigger'].includes(key)) value *= 0.3;
    return value;
}

// ダイスの目の、残す値打ち
function faceValue(view, seat, face, counts, cfg) {
    const me = view.players[seat];
    const inTokyo = me.inTokyo;
    const others = view.players.filter(p => p.alive && p.id !== seat);
    if (face === 'claw') {
        const targets = inTokyo ? others.filter(p => !p.inTokyo) : others.filter(p => p.inTokyo);
        if (targets.length === 0) return inTokyo ? 0.3 : 0.9; // 東京が空いていれば入れる
        const weakest = Math.min(...targets.map(p => p.health));
        let v = 0.9 + targets.length * 0.15 + (weakest <= 3 ? 1 : 0);
        // 東京の外から攻撃すると、自分が東京に入ることになる。体力が少なければ控える
        if (!inTokyo && me.health <= 5) v -= 0.6;
        return v * cfg.greed;
    }
    if (face === 'heart') {
        if (inTokyo) return me.poison || me.shrink ? 0.6 : 0.05;
        const missing = me.maxHealth - me.health;
        return missing <= 0 ? 0.05 : 0.4 + missing * 0.18;
    }
    if (face === 'energy') return 0.75 + (hasCard(me, 'friendOfChildren') ? 0.2 : 0);
    const n = counts[face];
    const base = { 1: 0.25, 2: 0.4, 3: 0.55 }[face];
    if (n >= 3) return 1 + Number(face) * 0.3;
    if (n === 2) return base + 0.35;
    return base * 0.5;
}

export function chooseRoll(view, cfg, random) {
    const seat = view.seat;
    const me = view.players[seat];
    const counts = Object.fromEntries(['1', '2', '3', 'heart', 'energy', 'claw'].map(f => [f, view.dice.filter(d => d === f).length]));
    // 群れの間引き：1 が 2 つなら、ほかの目を 1 にして 3 つそろえる
    if (view.options.herdCuller && counts['1'] === 2) {
        const i = view.dice.findIndex(d => d !== '1' && d !== 'claw' && d !== 'energy');
        if (i >= 0) return { type: 'change', index: i, face: '1', card: 'herdCuller' };
    }
    const reroll = [];
    view.dice.forEach((face, i) => {
        const value = faceValue(view, seat, face, counts, cfg) + (random() * 2 - 1) * cfg.noise;
        if (value < 0.6) reroll.push(i);
    });
    if (cfg.random) return random() < 0.5 && view.options.canReroll ? { type: 'reroll', dice: view.dice.map((_, i) => i).filter(() => random() < 0.5).concat([0]).filter((v, i, a) => a.indexOf(v) === i) } : { type: 'resolve' };
    // 振り直しに使えるもの：無料の振り直しがあれば使う。煙幕・エナジードリンクは、振り直したいダイスが 3 つ以上のときだけ
    const free = view.rerollsLeft > 0;
    const paid = !free && view.options.canReroll && reroll.length >= 3 && (me.smoke > 0 || me.energy >= 4);
    if (reroll.length > 0 && (free || paid)) return { type: 'reroll', dice: reroll };
    // 背景の住人：3 は振り直せる（3 が 1 つだけなら）
    if (view.options.dweller && counts['3'] === 1) return { type: 'reroll', dice: [view.dice.indexOf('3')] };
    return { type: 'resolve' };
}

export function chooseBuy(view, cfg, random) {
    const seat = view.seat;
    const me = view.players[seat];
    const candidates = view.market.map(id => ({ command: { type: 'buy', card: id }, id, cost: view.options.costs[id] }));
    if (view.options.top) candidates.push({ command: { type: 'buyTop' }, id: view.options.top.card, cost: view.options.top.cost });
    view.options.fromOthers.forEach(o => candidates.push({ command: { type: 'buyFrom', seat: o.seat, card: o.card }, id: o.card, cost: o.cost }));
    let best = null;
    candidates.filter(c => c.cost <= me.energy).forEach(c => {
        const value = cardValue(view, seat, c.id) + (random() * 2 - 1) * cfg.noise * 2;
        const ratio = value / Math.max(1, c.cost);
        if (ratio >= cfg.buyThreshold && (!best || ratio > best.ratio)) best = { ...c, ratio };
    });
    if (cfg.random && candidates.some(c => c.cost <= me.energy) && random() < 0.6) {
        const list = candidates.filter(c => c.cost <= me.energy);
        return list[Math.floor(random() * list.length)].command;
    }
    if (best) return best.command;
    // 場によいカードがなく、エネルギーが余っていれば流す
    if (view.options.canSweep && me.energy >= 9 && random() < 0.7) return { type: 'sweep' };
    return { type: 'endBuy' };
}

export function chooseCommand(view, cfg = LEVELS.normal, random = viewRandom(view)) {
    const d = view.decision;
    const seat = view.seat;
    const me = view.players[seat];
    switch (d.kind) {
        case 'roll': return chooseRoll(view, cfg, random);
        case 'buy': return chooseBuy(view, cfg, random);
        case 'yield': {
            if (cfg.random) return { type: 'yield', yes: random() < 0.5 };
            const after = me.health - d.damage;
            const threshold = cfg.yieldAt + Math.round((random() * 2 - 1) * cfg.noise * 2);
            return { type: 'yield', yes: after <= 0 ? !hasCard(me, 'itHasAChild') : after <= threshold };
        }
        case 'wings': return { type: 'wings', yes: !cfg.random && (d.damage >= me.health || (d.damage >= 3 && me.energy >= 4)) };
        case 'psychicProbe': {
            if (cfg.random) return { type: 'probe', index: null };
            // 手番の人に一番役立ちそうな目を振り直させる（自分に向く攻撃を先に）
            const current = view.players[view.current];
            const targetsMe = current.inTokyo ? !me.inTokyo : me.inTokyo;
            let index = targetsMe ? view.dice.indexOf('claw') : -1;
            if (index < 0) {
                const counts = {};
                view.dice.forEach(f => { counts[f] = (counts[f] ?? 0) + 1; });
                index = view.dice.findIndex(f => ['1', '2', '3'].includes(f) && counts[f] === 3);
            }
            return { type: 'probe', index: index >= 0 ? index : null };
        }
        case 'healingRay': {
            // 東京にいて自分が回復できないときだけ、ほかのモンスターを回復してエネルギーをもらう
            const give = {};
            if (me.inTokyo) {
                let left = d.hearts;
                d.targets.forEach(t => {
                    const p = view.players[t];
                    const k = Math.min(left, p.maxHealth - p.health, p.energy);
                    if (k > 0) { give[t] = k; left -= k; }
                });
            }
            return { type: 'healingRay', give };
        }
        case 'opportunist': {
            const best = d.cards.map(id => ({ id, ratio: cardValue(view, seat, id) / Math.max(1, cardOf(id).cost) })).sort((a, b) => b.ratio - a.ratio)[0];
            return { type: 'opportunist', card: best && best.ratio >= cfg.buyThreshold + 0.1 ? best.id : null };
        }
        case 'mimic': {
            const best = d.targets.map(t => ({ t, v: CARD_VALUE[keyOf(t.card)] ?? 2 })).sort((a, b) => b.v - a.v)[0];
            // 番の初めの選び直しは、今より大きくよくなるときだけ
            if (d.move) {
                const now = me.mimic ? CARD_VALUE[keyOf(me.mimic.card)] ?? 2 : 0;
                return { type: 'mimic', target: best && best.v >= now + 1.5 ? best.t : null };
            }
            return { type: 'mimic', target: best?.t ?? null };
        }
        case 'metamorph': return { type: 'metamorph', cards: [] };
        default: return null;
    }
}

// 決める番が CPU なら、1 手打つ。打てたら true（CPU には自分のビューだけを渡す）
export function runCpuStep(game, levelOf = () => 'normal') {
    if (game.isOver() || !game.decision) return false;
    const seat = game.decision.seat;
    if (!game.players[seat].isCPU) return false;
    const view = createGameView(game, seat);
    const command = chooseCommand(view, LEVELS[levelOf(seat)] ?? LEVELS.normal);
    if (command && game.applyCommand(seat, command)) return true;
    // 想定外の断りでも止めない：いちばん控えめな答え
    const fallback = { roll: { type: 'resolve' }, buy: { type: 'endBuy' }, yield: { type: 'yield', yes: false }, wings: { type: 'wings', yes: false }, psychicProbe: { type: 'probe', index: null }, healingRay: { type: 'healingRay', give: {} }, opportunist: { type: 'opportunist', card: null }, mimic: { type: 'mimic', target: null }, metamorph: { type: 'metamorph', cards: [] } }[game.decision.kind];
    return !!fallback && game.applyCommand(seat, fallback);
}

export const isCpuToAct = game => !game.isOver() && !!game.decision && game.players[game.decision.seat].isCPU;

// ヒント：人の番に、CPU（いちばん強い設定）が選ぶ手を返す。CPU と同じく、その席から見える情報だけで決める
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (!(!game.isOver() && game.decision?.seat === seat)) return null;
    return chooseCommand(createGameView(game, seat), LEVELS.strong);
}
