/**
 * CPU の手の決め方
 * - 選択肢と置き場所は、ゲームの写しで1つずつ試し、そのあとの自分の状態を点数にして一番よいものを選ぶ
 *   写しでは山札を CPU 自身の乱数で混ぜ直すので、まだ見えていないカードをのぞかない
 * - 試したあとに続く自分の選択（どのブドウを植えるかなど）は、簡単な決まりで答える（訪問者の効果を選ぶときだけ、もう1段試す）
 * - 「やさしい」は、決める場面の一部でランダムに選ぶ
 * ゲームの乱数は使わない（CPU の判断は記録されないので、使うと再現がずれる）。乱数が要るときは状態から作る
 */

import { CARDS, STRUCTURE, WAKE_ROWS, vineValue, WIN_VP } from './cards.js';
import { wineCount, matchOrder } from './game.js';

export const CPU_LEVELS = ['easy', 'normal'];
const EASY_RANDOM = 0.45;          // やさしい CPU がランダムに選ぶ割合
const WINTER_NEED_VALUE = 12;       // 冬に要る人（収穫・醸造・注文）を夏に残した値打ち
const SUMMER_RESERVE = [4, 2, 1, 0, 0, 0];  // それより多く残した人の値打ち

export const cpuActors = (game) => game.actors().filter(seat => game.players[seat].isCPU);
export const isCpuTurn = (game) => cpuActors(game).length > 0;

// 状態から作る乱数（同じ場面では同じ値。ゲームの乱数は使わない）
function cpuRandom(game, seat, salt = 0) {
    let s = (game.options.seed ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ Math.imul(seat + 7, 0x85EBCA6B) ^ Math.imul(salt + 3, 0xC2B2AE35)) >>> 0;
    return () => {
        s = (s + 0x6D2B79F5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

// 1手打つ。進めたら true
export function runCpuStep(game, seat = cpuActors(game)[0]) {
    if (seat === undefined) return false;
    const command = decide(game, seat);
    if (command && game.applyCommand(seat, command)) return true;
    // 決めた手が通らなければ、いちばん単純な手で進める
    for (const fallback of simplestCommands(game)) {
        if (game.applyCommand(seat, fallback)) return true;
    }
    return false;
}

function simplestCommands(game) {
    if (game.pending) return [{ type: 'choose', index: 0 }];
    if (game.season === 'spring') return game.wakeTaken.map((s, row) => (s === null ? { type: 'wake', row } : null)).filter(Boolean);
    return [{ type: 'pass' }];
}

export function decide(game, seat) {
    const p = game.players[seat];
    const easy = p.cpuLevel === 'easy';
    const random = cpuRandom(game, seat);
    if (game.pending) {
        const n = game.pending.options.length;
        if (n === 1) return { type: 'choose', index: 0 };
        if (easy && random() < EASY_RANDOM) return { type: 'choose', index: Math.floor(random() * n) };
        return { type: 'choose', index: bestChoice(game, seat, 0) };
    }
    if (game.season === 'spring') return { type: 'wake', row: chooseWake(game, seat, easy ? random : null) };
    return choosePlacement(game, seat, easy ? random : null);
}

// ---- 春 ----

function chooseWake(game, seat, random) {
    const free = game.wakeTaken.map((s, row) => (s === null ? row : -1)).filter(row => row >= 0);
    if (random && random() < 0.6) return free[Math.floor(random() * free.length)];
    const p = game.players[seat];
    const early = game.year <= 3;
    const bonus = [0, 3, handCount(p, 'order') < 2 ? 6 : 3, 3, 3, 10, early ? 16 : 9];
    const score = (row) => (WAKE_ROWS.length - 1 - row) * 2 + bonus[row];
    return free.reduce((best, row) => (score(row) > score(best) ? row : best), free[0]);
}

// ---- 夏と冬 ----

function choosePlacement(game, seat, random) {
    // 同じ場所なら、ふつうの人で置ける形を先に使う（大きいワーカーは枠が埋まっているときだけ）
    const legal = game.legalPlacements(seat);
    const candidates = legal.filter(c => !c.grande || !legal.some(o => o.action === c.action && !o.grande));
    if (random && random() < EASY_RANDOM) {
        const k = Math.floor(random() * (candidates.length + 1));
        return k < candidates.length ? { type: 'place', ...candidates[k] } : { type: 'pass' };
    }
    let best = { type: 'pass' };
    let bestScore = simulate(game, seat, { type: 'pass' }, 0);
    candidates.forEach(c => {
        const command = { type: 'place', ...c };
        const score = simulate(game, seat, command, 0) - (c.grande ? 1 : 0);
        if (score > bestScore + 0.01) {
            best = command;
            bestScore = score;
        }
    });
    return best;
}

// ---- 選択 ----

// 今の選択の答えを1つずつ試して、一番よい番号を返す
function bestChoice(game, seat, depth) {
    const options = game.pending.options;
    let best = 0;
    let bestScore = -Infinity;
    options.forEach((_, index) => {
        const score = simulate(game, seat, { type: 'choose', index }, depth);
        if (score > bestScore + 0.01) {
            best = index;
            bestScore = score;
        }
    });
    return best;
}

// 写しで command を行い、続く自分の選択に答えたあとの点数
function simulate(game, seat, command, depth) {
    const copy = game.clone();
    // 試算の中で点が動いても、残りの年の見込みは試す前のまま（自分の点が上がると畑や人の値打ちが下がって見えるのを防ぐ）
    copy.horizon = yearsLeft(game);
    const random = cpuRandom(game, seat, 11 + depth);
    Object.values(copy.decks).forEach(deck => {
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
    });
    if (!copy.applyCommand(seat, command)) return -Infinity;
    for (let guard = 0; guard < 30 && copy.pending && copy.pending.seat === seat; guard++) {
        const handler = copy.pending.handler;
        const index = depth < 1 && (handler === 'tasks' || handler === 'visitor') && copy.pending.options.length > 1
            ? bestChoice(copy, seat, depth + 1)
            : quickChoice(copy, seat);
        if (!copy.applyCommand(seat, { type: 'choose', index })) break;
    }
    return evaluate(copy, seat);
}

// 試さずに決める簡単な答え
export function quickChoice(game, seat) {
    const { handler, options } = game.pending;
    const p = game.players[seat];
    const pick = (score) => options.reduce((best, o, i) => (score(o) > score(options[best]) ? i : best), 0);
    switch (handler) {
        case 'plant': return pick(o => (o.skip ? -1 : vineValue(CARDS[o.card]) * 10 - game.players[seat].fields[o.field].max));
        case 'harvest': return pick(o => (o.skip ? -1 : fieldValue(p.fields[o.field])));
        case 'make': return pick(o => (o.skip ? -1 : o.value + (o.kind === 'sparkling' ? 4 : o.kind === 'blush' ? 2 : 0) - o.sum * 0.1));
        case 'fill': return pick(o => (o.skip ? -1 : CARDS[o.card].vp * 2 + CARDS[o.card].residual));
        case 'build': return pick(o => (o.skip ? -100 : structureValue(game, p, o.id) - o.price * 3));
        case 'sell': return pick(o => (o.skip ? 0 : o.grape ? 1 - o.grape.value * 0.1 : -1));
        case 'discardCard': return pick(o => -cardValue(game, p, o.card));
        case 'drawDeck': return pick(o => drawWant(p, o.deck));
        default: return 0;
    }
}

// ---- 点数 ----

const handCount = (p, deck) => p.hand.filter(id => CARDS[id].deck === deck).length;
const fieldValue = (field) => field.vines.reduce((s, id) => s + vineValue(CARDS[id]), 0);

function drawWant(p, deck) {
    const counts = { vine: handCount(p, 'vine'), order: handCount(p, 'order'), summer: handCount(p, 'summer'), winter: handCount(p, 'winter') };
    const base = { vine: 3, order: 4, summer: 2.5, winter: 2.5 };
    return base[deck] - counts[deck] * 1.2;
}

// 冬に人が要りそうな行動の数（収穫・醸造・注文）
function winterNeed(p) {
    const planted = p.fields.some(f => f.vines.length > 0);
    const grapes = p.crush.red.length + p.crush.white.length > 0;
    const orders = p.hand.some(id => CARDS[id].deck === 'order');
    return (planted ? 1 : 0) + (planted || grapes ? 1 : 0) + (orders && (grapes || wineCount(p) > 0) ? 1 : 0);
}

// 残りの年の見込み（いちばん点の多い人が20点に届くまで）
function yearsLeft(game) {
    if (game.horizon !== undefined) return game.horizon;
    const lead = Math.max(...game.players.map(q => q.vp));
    return Math.max(0, Math.min(6, Math.ceil((WIN_VP - lead) / 6)));
}

function structureValue(game, p, id) {
    const future = Math.min(1, yearsLeft(game) / 2);
    const needing = (s) => p.hand.filter(c => CARDS[c].deck === 'vine' && CARDS[c].needs.includes(s)).length;
    const grapes = p.crush.red.length + p.crush.white.length;
    const base = {
        trellis: 3 + Math.min(3, needing('trellis')) * 4,
        irrigation: 3 + Math.min(3, needing('irrigation')) * 4,
        yoke: 3,
        windmill: 3 + Math.min(3, handCount(p, 'vine')) * 2,
        cottage: 3 * Math.min(3, yearsLeft(game)),
        tasting: 4 * Math.min(3, yearsLeft(game)),
        medium: 6 + (grapes >= 2 ? 3 : 0) + Math.min(3, ordersNeeding(p, w => w.min >= 4 || w.kind === 'blush')) * 5,
        large: 4 + (p.crush.red.length >= 2 && p.crush.white.length >= 1 ? 3 : 0) + Math.min(3, ordersNeeding(p, w => w.min >= 7 || w.kind === 'sparkling')) * 5
    }[id] ?? 0;
    return base * future;
}

// 手札の注文のうち、test に当たるワインを求めるものの数
const ordersNeeding = (p, test) => p.hand.filter(id => CARDS[id].deck === 'order' && CARDS[id].wines.some(test)).length;

function cardValue(game, p, id) {
    const card = CARDS[id];
    if (card.deck === 'order') return 3 + (matchOrder(p.cellar, card.wines) ? card.vp * 3 : card.vp);
    if (card.deck === 'vine') return 1.5 + vineValue(card) * 0.5;
    return 3;
}

// その人の状態の値打ち（点1つ＝10）
export function evaluate(game, seat) {
    const p = game.players[seat];
    if (game.isOver()) return p.vp * 10 + p.lira * 0.3 + (game.winners.includes(seat) ? 200 : 0);
    const future = Math.min(4, yearsLeft(game));
    let v = p.vp * 10;
    v += Math.min(p.lira, 10) * 2.8 + Math.max(0, Math.min(p.lira, 20) - 10) * 1.5 + Math.max(0, p.lira - 20) * 0.5;
    v += p.residual * 3 * future;
    if (future > 0) {
        const grow = future >= 2 ? 1 : 0.4;
        Object.values(p.cellar).flat().forEach(value => { v += 2 + value * 0.6; });
        [...p.crush.red, ...p.crush.white].forEach(value => { v += 1 + value * 0.3; });
        p.fields.forEach(field => {
            if (!field.sold) v += field.max * 3 + (future >= 2 ? 10 : 0);
            field.vines.forEach(id => { v += (6 + vineValue(CARDS[id]) * 3) * grow; });
        });
        p.structures.forEach(id => { v += structureValue(game, p, id); });
        v += p.workers * (future >= 3 ? 18 : future === 2 ? 10 : 3);
    }
    // 手札：役に立つ枚数まで
    const orders = p.hand.filter(id => CARDS[id].deck === 'order').map(id => cardValue(game, p, id)).sort((a, b) => b - a);
    orders.forEach((value, i) => { v += i < 3 ? value : 1; });
    const vines = p.hand.filter(id => CARDS[id].deck === 'vine').map(id => cardValue(game, p, id)).sort((a, b) => b - a);
    vines.forEach((value, i) => { v += future > 0 && i < 3 ? value : 0.5; });
    const visitors = p.hand.filter(id => ['summer', 'winter'].includes(CARDS[id].deck)).length;
    v += Math.min(visitors, 4) * 3 + Math.max(0, visitors - 4) * 0.5;
    if (wineCount(p) > 0 && p.structures.includes('tasting')) v += 1;
    // 夏に残した人は、冬に使える
    if (['spring', 'summer', 'fall'].includes(game.season)) {
        const left = game.availableWorkers(p) + (p.grandeFree ? 1 : 0);
        const need = winterNeed(p);
        for (let i = 0; i < left; i++) v += i < need ? WINTER_NEED_VALUE : SUMMER_RESERVE[Math.min(i - need, SUMMER_RESERVE.length - 1)];
    }
    return v;
}

// 建物の値打ち（画面のおすすめなどで使える形で出しておく）
export const structureWorth = (game, seat, id) => structureValue(game, game.players[seat], id) - STRUCTURE[id].cost * 3;
