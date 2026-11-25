/**
 * CPU のプレイヤー。その席のビュー（createGameView）だけを見て決める（game の中、ほかの人の手札、山の並びはのぞかない）
 * ゲームの乱数は使わない（使うと記録の再現がずれる）。迷いは、ビューの数から作ったハッシュで出す
 *
 * ふつう：豆1枚の価値を「それを植えることになったら、自分の畑にとってどうか」で見る
 * - 同じ種類の畑があれば良い（次の金額に届くならもっと良い）。空いた畑があれば少し良い。どちらもなければ、畑を売らされるので悪い
 * - 手札は、前の2枚ほど重く見る（次の手番に植えるため）。前のほうの悪いカードを手放せる取引は良い
 * - 提案は、もらう豆の価値から渡す豆の価値を引いて、得なら受ける
 * - 手番では、いらない表の豆を、その豆の畑を持っている人に回す（自分の畑の豆と交換を求め、だめならあげる）
 * - 手番でないときは、表に自分の畑の豆があれば、いらない手札と交換を求める
 * - 売れる金額が上限に届いた畑は売る。3つ目の畑は、序盤に3金あれば買う
 * やさしい：受ける・断るに大きな迷いを足し、自分から交換は求めない（いらない表の豆をあげるだけ）。3つ目の畑は買わない
 */

import { coinsFor, nextStep, legalFieldsFor, canHarvestField, FIELD_PRICE } from './cards.js';
import { createGameView } from './game-view.js';

export const CPU_LEVELS = ['easy', 'normal'];

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

// CPU のうち、今できることがある席（手番の CPU が人の提案を待っているときは、することがない）
function cpuMoves(game) {
    const moves = [];
    for (const seat of game.actors()) {
        if (!game.players[seat].isCPU) continue;
        const view = createGameView(game, seat, { since: game.logs.length, events: false });
        let command = null;
        try {
            command = chooseCommand(view, game.players[seat].cpuLevel ?? 'normal');
        } catch (error) {
            console.error(error);
        }
        moves.push({ seat, command, view });
        if (command) break;
    }
    return moves;
}

export function isCpuTurn(game) {
    return cpuMoves(game).some(m => m.command);
}

export function nextCpuSeat(game) {
    return cpuMoves(game).find(m => m.command)?.seat ?? null;
}

// CPU の番なら1手打つ。打った操作を返す（打てなければ null）
export function runCpuStep(game) {
    const moves = cpuMoves(game);
    const move = moves.find(m => m.command);
    if (move && game.applyCommand(move.seat, move.command)) return move.command;
    // 思わぬことで通らなければ、いちばん単純な答えで進める（人を待っている CPU は待つ）
    for (const m of moves) {
        if (!m.command && waitingForPeople(m.view)) continue;
        for (const fallback of fallbackCommands(m.view)) {
            if (game.applyCommand(m.seat, fallback)) return fallback;
        }
    }
    return null;
}

export function fallbackCommands(view) {
    const me = view.players[view.you];
    const list = [];
    me.fields.forEach((f, i) => { if (canHarvestField(me.fields, i)) list.push({ type: 'harvest', field: i }); });
    if (view.phase === 'plant') {
        me.fields.forEach((_, i) => list.unshift({ type: 'plant', field: i }));
        list.unshift({ type: 'next' });
    }
    if (view.phase === 'trade') {
        if (view.offer?.to === view.you) list.unshift({ type: 'respond', accept: false, hand: [] });
        else list.unshift(view.active === view.you ? { type: 'endTrade' } : { type: 'pass' });
    }
    if (view.phase === 'plantTraded') me.toPlant.forEach((_, k) => me.fields.forEach((__, i) => list.unshift({ type: 'plantPending', index: k, field: i })));
    return list;
}

// 手番の CPU が、まだ提案できる人を待っているか
function waitingForPeople(view) {
    return view.phase === 'trade' && view.active === view.you && !view.offer
        && view.players.some(p => p.id !== view.you && !p.isCPU && !view.passed.includes(p.id) && view.offersLeft[p.id] > 0);
}

export function chooseCommand(view, level = 'normal') {
    const ctx = { view, me: view.players[view.you], easy: level === 'easy', noise: (k) => hash(view.commandCount, view.turn, view.you, k) };
    // 上限に届いた畑は売る（ふつう）
    if (!ctx.easy) {
        const full = ctx.me.fields.findIndex((f, i) => f && nextStep(f.type, f.n) === null && canHarvestField(ctx.me.fields, i));
        if (full >= 0) return { type: 'harvest', field: full };
        if (view.canBuyField && ctx.me.fields.length < 3 && ctx.me.coins >= FIELD_PRICE && view.exhausted === 0) return { type: 'buyField' };
    }
    if (view.phase === 'plant') return choosePlant(ctx);
    if (view.phase === 'trade') {
        if (view.offer) return view.offer.to === view.you ? chooseResponse(ctx) : null;
        return view.active === view.you ? chooseActiveTrade(ctx) : chooseOtherTrade(ctx);
    }
    if (view.phase === 'plantTraded') return choosePlantTraded(ctx);
    return null;
}

// ---- 価値 ----

// 豆を1枚植えることになったときの価値。pending：それより先に植える豆
export function plantValue(fields, type, pending = []) {
    const sim = fields.map(f => (f ? { ...f } : null));
    let forced = 0;
    const place = (t) => {
        const legal = legalFieldsFor(sim, t);
        if (legal.length) {
            const i = legal[0];
            if (sim[i]) sim[i].n += 1;
            else sim[i] = { type: t, n: 1 };
            return;
        }
        forced += 1;
        // 一番少ない畑を売ったことにする
        let low = 0;
        sim.forEach((f, i) => { if (f && f.n < sim[low].n) low = i; });
        sim[low] = { type: t, n: 1 };
    };
    pending.forEach(place);
    const same = sim.findIndex(f => f && f.type === type);
    if (same >= 0) {
        const n = sim[same].n;
        return 0.6 + (coinsFor(type, n + 1) > coinsFor(type, n) ? 0.8 : 0) - forced * 0.1;
    }
    if (sim.some(f => !f)) return 0.3 - forced * 0.1;
    const smallest = Math.min(...sim.map(f => f.n));
    return -1.2 - smallest * 0.15;
}

// 手札の i 番目の価値（前の2枚は次の手番に植えるので重く見る）
function handValue(me, i) {
    const v = plantValue(me.fields, me.hand[i], i <= 1 ? me.hand.slice(0, i) : []);
    return i <= 1 ? v : v * 0.5;
}

// もらう豆の価値の合計（順に植えることにする）
function receiveValue(me, cards, already = me.toPlant) {
    let total = 0;
    const pending = [...already];
    cards.forEach(t => {
        total += plantValue(me.fields, t, pending);
        pending.push(t);
    });
    return total;
}

// 求められた種類を、手札のどの位置から渡すか（失う価値の小さい位置から）。足りなければ null
export function pickHand(me, types) {
    const picks = [];
    for (const [t, n] of Object.entries(types)) {
        const spots = me.hand.map((c, i) => (c === t ? i : -1)).filter(i => i >= 0)
            .sort((a, b) => handValue(me, a) - handValue(me, b));
        if (spots.length < n) return null;
        picks.push(...spots.slice(0, n));
    }
    return picks;
}

// ---- 植える ----

function chooseField(me, type) {
    const legal = legalFieldsFor(me.fields, type);
    if (legal.length) return legal.find(i => me.fields[i]) ?? legal[0];
    return null;
}

// 売る畑：金が一番多く、同じなら豆が少ないもの
function harvestChoice(me) {
    let best = null;
    me.fields.forEach((f, i) => {
        if (!canHarvestField(me.fields, i)) return;
        const coins = coinsFor(f.type, f.n);
        const score = coins * 10 - f.n;
        if (!best || score > best.score) best = { i, score };
    });
    return best?.i ?? null;
}

function choosePlant(ctx) {
    const { view, me, easy } = ctx;
    if (view.active !== view.you) return null;
    if (!me.hand.length) return { type: 'next' };
    const front = me.hand[0];
    if (view.planted >= 1) {
        // 2枚目：同じ種類の畑があるか、空いた畑が2つ以上あれば植える
        const same = me.fields.some(f => f && f.type === front);
        const empty = me.fields.filter(f => !f).length;
        if (!(same || (!easy && empty >= 2) || (easy && empty >= 1 && ctx.noise(1) < 0.5))) return { type: 'next' };
        const field = chooseField(me, front);
        return field === null ? { type: 'next' } : { type: 'plant', field };
    }
    const field = chooseField(me, front);
    if (field !== null) return { type: 'plant', field };
    const sell = harvestChoice(me);
    return sell === null ? null : { type: 'harvest', field: sell };
}

function choosePlantTraded(ctx) {
    const { me } = ctx;
    if (!me.toPlant.length) return null;
    // 同じ種類の畑がある豆から植える
    let pick = me.toPlant.findIndex(t => me.fields.some(f => f && f.type === t));
    if (pick < 0) pick = me.toPlant.findIndex(t => legalFieldsFor(me.fields, t).length);
    if (pick >= 0) return { type: 'plantPending', index: pick, field: chooseField(me, me.toPlant[pick]) };
    if (ctx.view.canBuyField && me.fields.length < 3 && me.coins >= FIELD_PRICE) return { type: 'buyField' };
    const sell = harvestChoice(me);
    return sell === null ? null : { type: 'harvest', field: sell };
}

// ---- 取引 ----

const tried = (view, offer) => view.turnOffers.some(o => o.from === view.you && o.to === offer.to
    && o.give.join() === offer.giveTypes.join() && o.want.join() === offer.wantList.join());

function chooseResponse(ctx) {
    const { view, me, easy } = ctx;
    const offer = view.offer;
    const picks = pickHand(me, offer.wantTypes);
    if (!picks) return { type: 'respond', accept: false, hand: [] };
    const active = view.active === view.you;
    // 手番の自分の表のカードを渡すなら、それを植えなくて済む
    const faceGiven = offer.wantFaceUp.map(i => view.faceUp[i]);
    const keptFace = active ? view.faceUp.filter((_, i) => !offer.wantFaceUp.includes(i)) : [];
    let gain = receiveValue(me, offer.give, [...me.toPlant, ...keptFace]);
    gain -= picks.reduce((s, i) => s + handValue(me, i), 0);
    if (active) gain -= receiveValue(me, faceGiven, [...me.toPlant, ...keptFace]);
    const threshold = easy ? (ctx.noise(2) - 0.5) * 2 : 0.25;
    return gain > threshold ? { type: 'respond', accept: true, hand: picks } : { type: 'respond', accept: false, hand: [] };
}

// 自分の畑で、一番伸ばしたい種類
function wantedTypes(me) {
    return me.fields.filter(Boolean).sort((a, b) => b.n - a.n).map(f => f.type);
}

function chooseActiveTrade(ctx) {
    const { view, me, easy } = ctx;
    const others = view.players.filter(p => p.id !== view.you);
    const candidates = [];
    // いらない表の豆（取っておくと植えることになる）
    view.faceUp.forEach((t, i) => {
        const keep = plantValue(me.fields, t, [...me.toPlant, ...view.faceUp.slice(0, i)]);
        if (keep >= 0.5) return;
        candidates.push({ type: t, give: { faceUp: [i], hand: [] }, priority: -keep });
    });
    // 前のほうのいらない手札（ふつう）
    if (!easy) {
        me.hand.slice(0, 3).forEach((t, i) => {
            const v = handValue(me, i);
            if (v < -0.3) candidates.push({ type: t, give: { faceUp: [], hand: [i] }, priority: -v - 0.3 });
        });
    }
    candidates.sort((a, b) => b.priority - a.priority);
    for (const c of candidates) {
        // その豆の畑を持つ人から、なければ空いた畑がある人
        const takers = [...others].sort((a, b) => score(b, c.type) - score(a, c.type));
        for (const p of takers) {
            if (score(p, c.type) <= 0 || view.offersLeft[view.you] <= 0) continue;
            const wants = easy ? [] : wantedTypes(me).filter(t => t !== c.type).slice(0, 2);
            const tries = [...wants.map(w => ({ [w]: 1 })), {}];
            for (const types of tries) {
                const offer = { to: p.id, give: c.give, want: { faceUp: [], types } };
                const meta = { to: p.id, giveTypes: [c.type], wantList: Object.keys(types) };
                if (tried(view, meta)) continue;
                return { type: 'offer', ...offer };
            }
        }
    }
    if (waitingForPeople(view)) return null;
    return { type: 'endTrade' };
}

// ほかの人が、その豆を欲しがりそうか（見えている畑から）
function score(p, type) {
    if (p.fields.some(f => f && f.type === type)) return 2;
    if (p.fields.some(f => !f)) return 1;
    return 0;
}

function chooseOtherTrade(ctx) {
    const { view, me, easy } = ctx;
    if (view.offersLeft[view.you] <= 0) return { type: 'pass' };
    const want = view.faceUp.map((t, i) => ({ t, i, v: plantValue(me.fields, t, me.toPlant) })).filter(x => x.v >= 0.5).sort((a, b) => b.v - a.v)[0];
    if (want && !(easy && ctx.noise(3) < 0.5)) {
        // いらない手札（一番価値の低いもの）を1枚つける
        let give = [];
        if (!easy) {
            const values = me.hand.map((_, i) => ({ i, v: handValue(me, i) })).sort((a, b) => a.v - b.v);
            if (values.length && values[0].v < 0) give = [values[0].i];
        }
        const tries = give.length ? [give, []] : [[]];
        for (const g of tries) {
            const meta = { to: view.active, giveTypes: g.map(i => me.hand[i]), wantList: [want.t] };
            if (tried(view, meta)) continue;
            return { type: 'offer', to: view.active, give: { faceUp: [], hand: g }, want: { faceUp: [want.i], types: {} } };
        }
    }
    return { type: 'pass' };
}

