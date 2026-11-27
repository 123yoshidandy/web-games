/**
 * CPU（ビューだけを見て判断する。相手のまだ置いていないダイスの目は見ない）
 * 相手の見えないダイスを何通りか仮に振り、仮の目ごとに「この回の2人のダイスの割り当て」の最もよいものを探して、回の終わりの盤を評価する
 * - 必須の置き場（軸・エンジン）に置くダイスの組み合わせは全部試す。残りのダイスは無線・着陸装置・フラップ・ブレーキ・コーヒーへ貪欲に置く
 * - コーヒーで目を変える分も試す
 * 候補の手（いま置けるもの）を、仮の目すべての平均で比べて選ぶ。仮の目には、ビューから作ったシード付きの別の乱数を使う（ゲームの乱数は使わない）
 * suggest はヒントと同じ関数（いまの席が打てる手。打てなければ null）
 */

import { createRandom } from './random.js';
import { createGameView } from './game-view.js';
import {
    SLOTS, SLOT_IDS, canPlace, canPlaceWithReserve, place, openMandatory, cloneBoard, trackEnd, gearCount, planesLeft,
    advanceFor, isFinalRound, landingFailures, AXIS_LIMIT
} from './rules.js';

export const CPU_LEVELS = ['easy', 'normal', 'hard'];
const SAMPLES = { easy: 2, normal: 10, hard: 24 };
const WIN = 1e6;
const LOSS = -1e6;
const COFFEE_COST = 6; // コーヒー1個を使う重み

// ---------- 盤の評価 ----------

// 回の終わりの盤の値（大きいほどよい）。最後の回なら着陸できたか
export function evaluate(b) {
    if (b.result) return b.result.win ? WIN : LOSS;
    if (isFinalRound(b)) {
        const failures = landingFailures(b);
        return failures.length === 0 ? WIN : LOSS + (6 - failures.length) * 1000;
    }
    const R = b.rounds - b.round; // このあとに残る回
    const M = R - 1;              // そのうち進める回（最後の回は進まない）
    const D = trackEnd(b) - b.pos;
    if (D > 2 * M) return LOSS / 2 - D * 1000;
    const gearLeft = 3 - gearCount(b);
    const flapsLeft = 4 - b.flaps;
    const brakesLeft = 3 - b.brakes;
    const planes = planesLeft(b);
    const pilotNeed = gearLeft + brakesLeft;
    if (pilotNeed > 2 * R || flapsLeft > 2 * R) return LOSS / 2 - 1000 * (pilotNeed + flapsLeft);
    let s = 0;
    s -= 70 * Math.max(0, D - M);
    s -= 6 * Math.max(0, M - D);
    s -= 30 * planes;
    if (b.planes[b.pos] > 0) s -= 12 * b.planes[b.pos];
    s -= 32 * gearLeft + 30 * flapsLeft + 24 * brakesLeft;
    const need = pilotNeed + flapsLeft + planes;
    if (need > 4 * R) s -= 200 * (need - 4 * R);
    s -= 40 * Math.max(0, pilotNeed - (2 * R - 1)) + 40 * Math.max(0, flapsLeft - (2 * R - 1));
    const tilt = Math.abs(b.axis);
    s -= 12 * tilt + (tilt >= 2 ? 25 : 0);
    s += 6 * b.coffee + 8 * b.rerolls;
    return s;
}

// 無線・装置・コーヒーに置いたときの値打ち（貪欲に選ぶときの目安）
function taskGain(b, slotId, value) {
    const slot = SLOTS[slotId];
    switch (slot.kind) {
    case 'radio': {
        const target = b.pos + value - 1;
        if (target > trackEnd(b) || !(b.planes[target] > 0)) return 0;
        return 30 + (target === b.pos ? 12 : 0);
    }
    case 'gear': return 32;
    case 'flap': return 30;
    case 'brake': return 24;
    case 'coffee': return b.coffee < 3 ? 7 : 0;
    default: return 0;
    }
}

const TASK_SLOTS = [0, 1].map(seat => SLOT_IDS.filter(id => !SLOTS[id].mandatory && (SLOTS[id].seat === null || SLOTS[id].seat === seat)));

// 残りのダイスを、必須でない置き場へ貪欲に置く。置いた盤と置き方を返す
function placeTasks(b0, seat, dice) {
    const b = cloneBoard(b0);
    const placements = [];
    let penalty = 0;
    for (const die of [...dice].sort((x, y) => x.v - y.v)) {
        let best = null;
        for (const slot of TASK_SLOTS[seat]) {
            for (let delta = -b.coffee; delta <= b.coffee; delta++) {
                const v = die.v + delta;
                if (!canPlace(b, seat, slot, v)) continue;
                const gain = taskGain(b, slot, v) - COFFEE_COST * Math.abs(delta) - (slot.startsWith('coffee') ? 0.5 : 0);
                if (!best || gain > best.gain) best = { gain, slot, delta };
            }
        }
        if (!best) {
            placements.push({ seat, die, slot: null, delta: 0 });
            penalty += 5;
            continue;
        }
        b.coffee -= Math.abs(best.delta);
        place(b, seat, best.slot, die.v + best.delta);
        placements.push({ seat, die, slot: best.slot, delta: best.delta });
    }
    return { board: b, placements, penalty };
}

// 必須の置き場に置くダイスの選び方（同じ目は1つにまとめる）
function mandatoryChoices(dice, open) {
    if (open.length === 0) return [{ mand: [], rest: dice }];
    const out = [];
    const seen = new Set();
    if (open.length === 1) {
        dice.forEach((d, i) => {
            if (seen.has(d.v)) return;
            seen.add(d.v);
            out.push({ mand: [{ slot: open[0], die: d }], rest: dice.filter((_, j) => j !== i) });
        });
        return out;
    }
    dice.forEach((a, i) => dice.forEach((c, j) => {
        if (i === j) return;
        const key = `${a.v}:${c.v}`;
        if (seen.has(key)) return;
        seen.add(key);
        out.push({ mand: [{ slot: open[0], die: a }, { slot: open[1], die: c }], rest: dice.filter((_, k) => k !== i && k !== j) });
    }));
    return out;
}

const restKey = dice => dice.map(d => d.v).sort().join('');

/**
 * この回の残りのダイス（hands[席] = [{ i, v }]）の、最もよい割り当て
 * 返り値：{ value, placements: [{ seat, die, slot, delta }] }
 */
export function bestPlan(b0, hands) {
    if (b0.result) return { value: evaluate(b0), placements: [] };
    const open = [openMandatory(b0, 0), openMandatory(b0, 1)];
    const choices = [mandatoryChoices(hands[0], open[0]), mandatoryChoices(hands[1], open[1])];
    const pilotTasks = new Map();
    let best = { value: -Infinity, placements: [] };
    for (const cp of choices[0]) {
        const pk = restKey(cp.rest);
        if (!pilotTasks.has(pk)) pilotTasks.set(pk, { tasks: placeTasks(b0, 0, cp.rest), cop: new Map() });
        const entry = pilotTasks.get(pk);
        const tp = entry.tasks;
        for (const cc of choices[1]) {
            const ck = restKey(cc.rest);
            if (!entry.cop.has(ck)) entry.cop.set(ck, placeTasks(tp.board, 1, cc.rest));
            const tc = entry.cop.get(ck);
            const result = resolveMandatory(tc.board, [...cp.mand.map(m => ({ ...m, seat: 0 })), ...cc.mand.map(m => ({ ...m, seat: 1 }))]);
            const value = result.value - tp.penalty - tc.penalty;
            if (value > best.value) {
                best = { value, placements: [...tp.placements.map(p => ({ ...p, seat: 0 })), ...tc.placements, ...cp.mand.map(m => ({ ...m, seat: 0, delta: result.deltas.get(m.die) ?? 0 })), ...cc.mand.map(m => ({ ...m, seat: 1, delta: result.deltas.get(m.die) ?? 0 }))] };
            }
        }
    }
    return best;
}

// 必須の置き場（軸・エンジン）にダイスを置いて回を終えたときの、最もよい値とコーヒーの使い方
function resolveMandatory(bt, mand) {
    const b = cloneBoard(bt);
    const T = b.coffee;
    const valueOf = slot => b.slots[slot]?.value ?? mand.find(m => m.slot === slot)?.die.v;
    const newDie = slot => mand.find(m => m.slot === slot)?.die ?? null;
    const axisNew = [newDie('axisP'), newDie('axisC')];
    const engineNew = [newDie('engineP'), newDie('engineC')];
    const axisOpen = axisNew[0] || axisNew[1];
    const engineOpen = engineNew[0] || engineNew[1];
    const axisBase = axisOpen ? b.axis + valueOf('axisP') - valueOf('axisC') : b.axis;
    const speedBase = engineOpen ? valueOf('engineP') + valueOf('engineC') : b.speed;
    const final = isFinalRound(b);
    // 傾き x・速度 y を変えられるか（変えるダイスを選ぶ）
    const axisAdjuster = x => {
        if (x === 0) return { die: null };
        if (axisNew[1] && axisNew[1].v - x >= 1 && axisNew[1].v - x <= 6) return { die: axisNew[1], delta: -x };
        if (axisNew[0] && axisNew[0].v + x >= 1 && axisNew[0].v + x <= 6) return { die: axisNew[0], delta: x };
        return null;
    };
    const engineAdjuster = y => {
        if (y === 0) return { die: null };
        for (const d of [engineNew[1], engineNew[0]]) if (d && d.v + y >= 1 && d.v + y <= 6) return { die: d, delta: y };
        return null;
    };
    let best = { value: -Infinity, deltas: new Map() };
    const xs = axisOpen ? range(T) : [0];
    for (const x of xs) {
        const ax = axisAdjuster(x);
        if (!ax) continue;
        const axis = axisBase + x;
        for (const y of engineOpen ? range(T - Math.abs(x)) : [0]) {
            const en = engineAdjuster(y);
            if (!en) continue;
            const value = outcome(b, axis, engineOpen ? speedBase + y : null, final, T - Math.abs(x) - Math.abs(y));
            if (value > best.value) {
                const deltas = new Map();
                if (ax.die) deltas.set(ax.die, ax.delta);
                if (en.die) deltas.set(en.die, (deltas.get(en.die) ?? 0) + en.delta);
                best = { value, deltas };
            }
        }
    }
    return best;
}

const range = t => {
    const out = [0];
    for (let k = 1; k <= t; k++) out.push(k, -k);
    return out;
};

// 傾きと速度が決まった盤の値
function outcome(b, axis, speed, final, coffee) {
    if (Math.abs(axis) >= AXIS_LIMIT) return LOSS;
    const save = { axis: b.axis, pos: b.pos, speed: b.speed, coffee: b.coffee };
    b.axis = axis;
    b.coffee = coffee;
    let value;
    if (speed !== null) {
        b.speed = speed;
        if (!final) {
            const advance = advanceFor(b, speed);
            for (let i = 0; i < advance; i++) {
                if (b.planes[b.pos] > 0 || b.pos + 1 > trackEnd(b)) {
                    value = LOSS;
                    break;
                }
                b.pos++;
            }
        }
    }
    if (value === undefined) value = evaluate(b);
    Object.assign(b, save);
    return value;
}

// ---------- 手を選ぶ ----------

function boardFromView(view) {
    const v = view.board;
    return {
        airport: view.airport.key, round: v.round, rounds: v.rounds, pos: v.pos, planes: [...v.planes], axis: v.axis,
        gear: [...v.gear], flaps: v.flaps, brakes: v.brakes, coffee: v.coffee, rerolls: v.rerolls,
        slots: structuredClone(v.slots), speed: v.speed, advance: v.advance, result: null
    };
}

// ビューから決まるシード（同じ局面では同じ手を選ぶ）
function hashView(view) {
    const text = JSON.stringify([view.seat, view.board, view.dice, view.eventSeq]);
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
}

// 計画の中で、いま置けるわたしの手（必須でない置き場を先に。必須だけなら、相手が置いた側を先に）
function movesNow(b, plan, me, diceLeft) {
    const mine = plan.placements.filter(p => p.seat === me && p.slot);
    const tasks = mine.filter(p => !SLOTS[p.slot].mandatory);
    const list = tasks.length ? tasks : mine;
    return list.filter(p => canPlaceWithReserve(b, me, p.slot, p.die.v + p.delta, diceLeft) && Math.abs(p.delta) <= b.coffee)
        .map(p => ({ type: 'place', die: p.die.i, slot: p.slot, delta: p.delta }));
}

const moveKey = m => `${m.die}:${m.slot}:${m.delta}`;

function legalMoves(b, me, myDice) {
    const out = [];
    for (const d of myDice) {
        for (const slot of SLOT_IDS) {
            for (let delta = -b.coffee; delta <= b.coffee; delta++) {
                if (canPlaceWithReserve(b, me, slot, d.v + delta, myDice.length)) out.push({ type: 'place', die: d.i, slot, delta });
            }
        }
    }
    return out;
}

// 手を1つ置いたあとの、仮の目での値
function valueAfter(b, me, myDice, move, sample) {
    const after = cloneBoard(b);
    const die = myDice.find(d => d.i === move.die);
    after.coffee -= Math.abs(move.delta);
    place(after, me, move.slot, die.v + move.delta);
    if (after.result) return evaluate(after);
    const rest = myDice.filter(d => d !== die);
    return bestPlan(after, me === 0 ? [rest, sample] : [sample, rest]).value;
}

/**
 * ビューから、その席の手を選ぶ（打てなければ null）
 */
export function chooseCommand(view, level = 'normal') {
    if (!view || view.phase !== 'place' || view.seat === null || view.turn !== view.seat) return null;
    const me = view.seat;
    const partner = 1 - me;
    const b = boardFromView(view);
    const myDice = view.dice.map((d, i) => ({ i, v: d.value, used: d.used })).filter(d => !d.used);
    if (myDice.length === 0) return null;
    const rand = createRandom(hashView(view));
    const k = view.players[partner].diceLeft;
    const count = k === 0 ? 1 : SAMPLES[level] ?? SAMPLES.normal;
    const roll = () => 1 + Math.floor(rand() * 6);
    const samples = Array.from({ length: count }, () => Array.from({ length: k }, () => ({ i: -1, v: roll() })));
    const hands = (mine, sample) => (me === 0 ? [mine, sample] : [sample, mine]);

    // 置ける場所がないダイスは外す
    const legal = legalMoves(b, me, myDice);
    if (legal.length === 0) return { type: 'discard', die: myDice[0].i };

    // 振り直し：今の目の見込みより、振り直した目の見込みのほうがはっきりよければ使う
    const plans = samples.map(s => bestPlan(b, hands(myDice, s)));
    if (b.rerolls > 0 && level !== 'easy') {
        const now = average(plans.map(p => p.value));
        const again = average(samples.map(s => bestPlan(b, hands(myDice.map(d => ({ i: d.i, v: roll() })), s)).value));
        if (again > now + 40 && now < WIN / 2) return { type: 'reroll', dice: myDice.map(d => d.i) };
    }

    const candidates = new Map();
    plans.forEach(plan => movesNow(b, plan, me, myDice.length).forEach(m => candidates.set(moveKey(m), m)));
    if (candidates.size === 0) return legal[0];
    const list = [...candidates.values()];
    if (list.length === 1) return list[0];
    const scored = list.map(m => ({ m, value: average(samples.map(s => valueAfter(b, me, myDice, m, s))) }));
    scored.sort((x, y) => y.value - x.value);
    return scored[0].m;
}

const average = list => list.reduce((a, x) => a + x, 0) / Math.max(1, list.length);

// ヒント：その席のおすすめの手（ふつうの強さの CPU と同じ）
export function suggest(game, seat) {
    if (game.isOver() || game.turn !== seat) return null;
    return chooseCommandFromGame(game, seat, 'normal');
}

// ゲームからビューを作って選ぶ（CPU もビューだけを見る）
export function chooseCommandFromGame(game, seat, level) {
    return chooseCommand(createGameView(game, seat), level);
}

// CPU の番の席（2人の協力ゲームなので、手番の席が CPU ならその席）
export function cpuSeatsToAct(game) {
    if (game.isOver()) return [];
    return game.players[game.turn].isCPU ? [game.turn] : [];
}

// CPU を1手進める。進めたら true
export function runCpuStep(game, seat, levelOf = () => 'normal') {
    if (game.isOver() || game.turn !== seat) return false;
    const command = chooseCommandFromGame(game, seat, levelOf(seat));
    if (command && game.applyCommand(seat, command)) return true;
    // 選んだ手が通らなければ、置ける手の最初のもの、それもなければ外す
    const b = game.board;
    const dice = game.dice[seat].map((d, i) => ({ i, v: d.value, used: d.used })).filter(d => !d.used);
    const fallback = legalMoves(b, seat, dice)[0] ?? { type: 'discard', die: dice[0]?.i };
    return game.applyCommand(seat, fallback);
}
