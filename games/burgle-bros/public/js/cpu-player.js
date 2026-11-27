/**
 * CPU とヒント
 * ビュー（createGameView）だけを見て1手ずつ選ぶ。めくっていない部屋や巡回の山の並びは見ない
 * ゲームの乱数は使わないので、同じ局面なら同じ手を打つ（CPU の試合も記録から再現できる）
 *
 * 考え方
 * - 階の仕事：金庫を探す → 金庫の列と行の部屋をのぞいて数字を出す → 金庫でダイスを足して振る → 階段を探して上へ
 * - 手番の残りのアクションでできる並び（移動・のぞく・ダイス・金庫・ハック・階段）をすべて試し、
 *   「進み具合 − 手番の終わりの部屋で見つかる確率 × 重み − 目標までの残りの道のり」がいちばん大きい並びの、最初の1手を打つ
 * - 見つかる確率は、見張りの次の動き（自分の手番の終わりと、自分の次の手番までの同じ階の仲間の手番のぶん）を、
 *   巡回の捨て札からわかる残りのカードで枝分かれさせて出す（rules.js の guardRisk）
 */

import { createGameView } from './game-view.js';
import { CELLS, ROOMS, neighbors, idOf, floorOf, cellOf } from './data.js';
import {
    tileAt, playerNeighbors, moveCost, canRoof, guardRisk, guardNeighbors, safeCell, stairsCell, safeNeeds, allCracked, topFloor
} from './rules.js';

const INF = Infinity;
// 手の選び方の重み（見つかったときの重さ・目標までの道のり・見つかる確率の数え方）
export const TUNING = { w2: 30, w1: 80, goal: 1.2, all: 1, first: 0.25, hurry: 25, split: true };

export function isCpuTurn(game) {
    return !game.isOver() && !!game.players[game.current]?.isCPU;
}

// ヒント：その席が今打てるおすすめの手（打てなければ null）。状態は変えない
export function suggest(game, seat) {
    if (game.isOver() || !game.actors().includes(seat)) return null;
    const view = createGameView(game, seat, { since: game.logTotal, events: false });
    return chooseCommand(view, seat);
}

// CPU の席の番なら1手打つ。打てたら true
export function runCpuStep(game) {
    if (!isCpuTurn(game)) return false;
    const seat = game.current;
    const command = suggest(game, seat);
    if (command && game.applyCommand(seat, command)) return true;
    // 思わぬ理由で断られたら、手番を終える
    return game.applyCommand(seat, game.phase === 'spot' ? { type: 'spotKeep' } : { type: 'pass' });
}

// ---- 手を選ぶ ----

export function chooseCommand(v, seat) {
    if (v.phase === 'spot') return chooseSpot(v);
    if (canRoof(v, seat)) return { type: 'roof' };
    const ctx = makeContext(v, seat);
    const free = freeTool(ctx);
    if (free) return free;
    const plan = planTurn(ctx);
    if (plan.first) return plan.first;
    // 手番の終わりに見つかりそうなら、道具で身を守る
    if (ctx.risk(ctx.p.cell) >= 0.5) {
        if (ctx.p.tools.includes('invisible') && !v.invisible.includes(seat)) return { type: 'tool', tool: 'invisible' };
        if (ctx.p.tools.includes('smoke') && ctx.first[ctx.p.cell] > 0) return { type: 'tool', tool: 'smoke' };
    }
    return { type: 'pass' };
}

// 見張り役：見た行き先が仲間の近くなら、山の下へ回す
function chooseSpot(v) {
    const { floor, cell } = v.spotted;
    const near = v.players.some(p => !p.escaped && p.floor === floor && manhattan(p.cell, cell) <= 2);
    return { type: near ? 'spotBottom' : 'spotKeep' };
}

const manhattan = (a, b) => Math.abs((a >> 2) - (b >> 2)) + Math.abs((a & 3) - (b & 3));

function makeContext(v, seat) {
    const p = v.players[seat];
    const f = p.floor;
    const g = v.floors[f].guard;
    // 同じ階の仲間の手番のぶんも見張りは動く（自分の次の手番まで）
    const sameFloor = v.players.filter(q => !q.escaped && q.floor === f).length;
    const ctx = { v, seat, p, f, g, a: v.actionsLeft };
    // 見張りの確率。計画の中で警報を鳴らすときは、その警報を足した盤で計算し直す（警報の部屋ごとに覚えておく）
    const cache = new Map();
    ctx.riskSet = (alarm = -1) => {
        if (!cache.has(alarm)) {
            const state = alarm < 0 ? v : withAlarm(v, f, alarm);
            const first = guardRisk(state, f, 1);
            const all = sameFloor > 1 ? guardRisk(state, f, sameFloor) : first;
            const certain = new Set(first.map((r, c) => (r >= 0.99 ? c : -1)).filter(c => c >= 0));
            cache.set(alarm, { first, all, certain });
        }
        return cache.get(alarm);
    };
    Object.assign(ctx, ctx.riskSet());
    // 手番の終わりにその部屋にいて見つかる確率（部屋の種類も入れる）
    ctx.risk = (cell, alarm = -1) => endRisk(ctx, cell, ctx.riskSet(alarm));
    // 見つかったときの重さ（隠密が少ないほど重い。0なら負け）
    ctx.weight = p.stealth >= 2 ? TUNING.w2 : p.stealth === 1 ? TUNING.w1 : 200;
    return ctx;
}

function withAlarm(v, f, cell) {
    return { ...v, floors: v.floors.map((fl, i) => (i === f ? { ...fl, tiles: fl.tiles.map((t, c) => (c === cell ? { ...t, alarm: true } : t)) } : fl)) };
}

function endRisk(ctx, cell, { certain, first, all }) {
    const { v, f, seat } = ctx;
    if (v.invisible.includes(seat)) return 0;
    let r = Math.min(1, TUNING.all * all[cell] + TUNING.first * first[cell]);
    const t = tileAt(v, f, cell);
    if (t.revealed && t.type === 'foyer' && guardNeighbors(v, f, cell).some(n => certain.has(n))) r = 1;
    if (t.revealed && t.type === 'camera' && [...certain].some(c => c !== cell && tileAt(v, f, c).revealed && tileAt(v, f, c).type === 'camera')) r = 1;
    if (t.revealed && t.type === 'lavatory' && t.lav > 0) r *= 0.2;
    return r;
}

// ---- 目標 ----

/**
 * 階の目標：{ kind, stand（目指す部屋。なければ -1）, peekValue(cell)（めくっていない部屋をのぞく値） }
 */
function chooseGoal(ctx) {
    const { v, f, p } = ctx;
    const fl = v.floors[f];
    const top = topFloor(v);
    const stairs = stairsCell(v, f);
    const unknownValue = (value) => (cell) => (tileAt(v, f, cell).revealed ? 0 : value);
    if (fl.safe.cracked) {
        const higherOpen = v.floors.some((x, i) => i > f && !x.safe.cracked);
        const lowerOpen = v.floors.some((x, i) => i < f && !x.safe.cracked);
        if (f < top && (higherOpen || allCracked(v))) return { kind: 'up', stand: stairs, peekValue: unknownValue(stairs < 0 ? 5 : 0.3) };
        if (f === top && allCracked(v)) return { kind: 'roof', stand: stairs, peekValue: unknownValue(stairs < 0 ? 5 : 0.3) };
        if (lowerOpen) {
            const below = stairsCell(v, f - 1);
            return { kind: 'down', stand: below, peekValue: (c) => (tileAt(v, f, c).revealed ? 0 : c === below ? 8 : below < 0 ? 3 : 0.3) };
        }
        return { kind: 'none', stand: -1, peekValue: unknownValue(0.3) };
    }
    const s = safeCell(v, f);
    const stairsWanted = stairs < 0 && (f < top || v.floors.every((x, i) => i === f || x.safe.cracked));
    if (s < 0) return { kind: 'find', stand: -1, peekValue: unknownValue(5) };
    const needs = safeNeeds(v, f);
    const hidden = needs.filter(c => !tileAt(v, f, c).revealed);
    const other = stairsWanted ? 2.5 : 0.8;
    if (hidden.length) return { kind: 'line', stand: -1, peekValue: (c) => (tileAt(v, f, c).revealed ? 0 : hidden.includes(c) ? 8 : other) };
    // ほかの仲間の方が金庫に近ければ、その人に任せて階段を探す
    const helper = v.players.some(q => q.id !== p.id && !q.escaped && q.floor === f && manhattan(q.cell, s) < manhattan(p.cell, s));
    if (helper && stairsWanted) return { kind: 'find', stand: -1, peekValue: unknownValue(4) };
    // 階段がわかっていて上の階の金庫も閉じていれば、先に上がって階を分ける（同じ階の見張りが動く回数が減る）
    if (TUNING.split && helper && stairs >= 0 && f < top && v.floors.some((x, i) => i > f && !x.safe.cracked)) return { kind: 'up', stand: stairs, peekValue: unknownValue(0.3) };
    return { kind: 'safe', stand: s, peekValue: unknownValue(other) };
}

// 目標までの道のり（めくった部屋を通る。閉じた暗証番号の扉は3として数える）
// 目指す部屋があればそこまで。探す目標なら、値のあるめくっていない部屋をのぞける部屋までに、のぞく1を足す
function distancesTo(ctx, goal) {
    const { v, f, g, p } = ctx;
    const dist = Array(CELLS).fill(INF);
    const queue = [];
    if (goal.stand >= 0) {
        dist[goal.stand] = 0;
        queue.push(goal.stand);
    } else {
        const hawk = p.char === 'hawk';
        let wanted = 0;
        for (let u = 0; u < CELLS; u++) {
            if (tileAt(v, f, u).revealed || goal.peekValue(u) < 2) continue;
            wanted++;
            const spots = hawk ? neighbors(u) : neighbors(u).filter(q => playerNeighbors(v, f, q).includes(u));
            spots.forEach(q => {
                if (tileAt(v, f, q).revealed && dist[q] > 1) {
                    dist[q] = 1;
                    queue.push(q);
                }
            });
        }
        // のぞきたい部屋がなければどこも0。あるのにのぞける部屋がなければ、行けない（14）
        if (!queue.length) return dist.fill(wanted ? 14 : 0);
    }
    // 少ない順に広げる（重みは1か3なので、毎回いちばん近いものを取り出す）
    const done = new Set();
    while (queue.length) {
        queue.sort((x, y) => dist[x] - dist[y]);
        const c = queue.shift();
        if (done.has(c)) continue;
        done.add(c);
        // n から c へ入る重さ（目標の側から広げるので、入る先は c）
        const here = tileAt(v, f, c);
        // 見張りのいる部屋は、見張りが動けば通れるので、重くするだけにする
        const step = (here.type === 'deadbolt' || (here.type === 'keypad' && !here.open) ? 3 : 1) + (g.active && g.cell === c ? 2 : 0);
        playerNeighbors(v, f, c).forEach(n => {
            const t = tileAt(v, f, n);
            if (!t.revealed) return;
            if (dist[c] + step < dist[n]) {
                dist[n] = dist[c] + step;
                queue.push(n);
            }
        });
    }
    // めくっていない部屋（入る手の見積もり）：値があれば0、なければとなりのめくった部屋から
    return dist.map((d, c) => {
        if (tileAt(v, f, c).revealed) return d === INF ? 14 : d;
        if (goal.stand < 0 && goal.peekValue(c) >= 2) return 0;
        const near = playerNeighbors(v, f, c).filter(n => tileAt(v, f, n).revealed).map(n => dist[n]);
        return Math.min(14, 1 + Math.min(INF, ...near));
    });
}

// ---- 手番の計画 ----

function planTurn(ctx) {
    const { v, p, f, a } = ctx;
    let goal = chooseGoal(ctx);
    let toGoal = distancesTo(ctx, goal);
    // めくった部屋だけでは目標へ行けなければ、道を開くために、どのめくっていない部屋もさがす
    if (toGoal[p.cell] >= 14 && v.floors[f].tiles.some(t => !t.revealed)) {
        const base = goal.peekValue;
        goal = { ...goal, stand: -1, peekValue: (c) => (tileAt(v, f, c).revealed ? 0 : Math.max(base(c), 2.5)) };
        toGoal = distancesTo(ctx, goal);
    }
    // 手番が進むほど急ぐ（安全を取り続けて進まないのを防ぐ）
    const rounds = v.turnNo / Math.max(1, v.players.filter(q => !q.escaped).length);
    // 60巡を過ぎたら、20巡ごとに倍にして、いつかは必ず進む
    const goalWeight = TUNING.goal * (1 + rounds / TUNING.hurry) * 2 ** (Math.max(0, rounds - 60) / 20);
    const fl = v.floors[f];
    const hacker = p.char === 'hacker';
    const needs = safeNeeds(v, f) ?? [];
    const needNums = needs.filter(c => tileAt(v, f, c).revealed).map(c => tileAt(v, f, c).num);
    const hiddenNeeds = needs.some(c => !tileAt(v, f, c).revealed);
    const extraDie = p.char === 'peterman' ? 1 : 0;
    let best = { score: -INF, first: null };

    // 終わりの点：見つかる確率と、目標までの残りの道のり
    const finish = (cell, value, first, alarm = -1) => {
        // 熱センサーで手番を終えると、その部屋で警報が鳴る
        const t = tileAt(v, f, cell);
        if (alarm < 0 && t.revealed && t.type === 'thermo') alarm = cell;
        const score = value - ctx.weight * ctx.risk(cell, alarm) - goalWeight * toGoal[cell] - (alarm >= 0 ? 6 : 0);
        if (score > best.score + 1e-9) best = { score, first };
    };
    // 金庫を振ったときの見込み（新しく印の付く部屋の数と、開く確率）
    const crackValue = (dice) => {
        if (hiddenNeeds || !needNums.length || dice <= 0) return 0;
        const hit = 1 - (5 / 6) ** (dice + extraDie);
        const nums = new Set(needNums).size;
        return 5 * needNums.length * hit + 40 * hit ** nums;
    };
    // 上がった先の見張り。まだいない階では、現れた見張りがすぐ来る見込みを、上がったあとのアクションの数で見積もる
    const upRisk = (floor, cell, left) => (v.floors[floor].guard.active ? (v.floors[floor].guard.cell === cell ? 1 : guardRisk(v, floor, 1)[cell]) : [0.3, 0.15, 0.05][Math.min(2, Math.max(0, left - 1))]);

    const dfs = (cell, left, value, peeked, dice, motion, hawkFree, first, depth, alarm) => {
        finish(cell, value, first, alarm);
        if (left <= 0 || depth >= 6) return;
        const here = tileAt(v, f, cell);
        // この手番で入った動体センサーから出ると、そこで警報
        const leaveAlarm = !hacker && motion.includes(cell) && v.hacks.motion === 0 ? cell : -1;
        const leavePenalty = 0;
        const alarmAfterLeave = alarm >= 0 ? alarm : leaveAlarm;
        // 移動
        for (const n of playerNeighbors(v, f, cell)) {
            const t = tileAt(v, f, n);
            const cmd = first ?? { type: 'move', to: idOf(f, n) };
            if (ctx.g.active && ctx.g.cell === n) continue;
            if (!t.revealed) {
                // めくっていない部屋へ入る：のぞくよりアクションは安いが、警報や扉の見込みがある
                if (!peeked.includes(n)) finish(n, value + goal.peekValue(n) * 0.8 - 2.5, cmd, alarmAfterLeave);
                continue;
            }
            if (t.type === 'keypad' && !t.open) {
                // 暗証番号の扉を試す：開けば入れる（6が出る見込みで、目標に近づく分を数える）
                const gain = Math.max(0, toGoal[cell] - toGoal[n]) * goalWeight;
                if (gain > 0) finish(cell, value + 0.3 * gain - 0.5, cmd, alarm);
                continue;
            }
            let cost = moveCost(v, f, n);
            let pen = 0;
            let nextAlarm = alarmAfterLeave;
            if (!hacker && t.type === 'laser') {
                if (left - cost >= 1) cost += 1;
                else if (v.hacks.laser === 0 && nextAlarm < 0) nextAlarm = n;
            }
            if (!hacker && t.type === 'fingerprint' && v.hacks.fingerprint === 0 && nextAlarm < 0) nextAlarm = n;
            const nextMotion = !hacker && t.type === 'motion' ? [...motion, n] : motion;
            if (t.type === 'foyer' && ctx.g.active && guardNeighbors(v, f, n).includes(ctx.g.cell)) pen += ctx.weight;
            if (t.type === 'camera' && v.floors.some((x, i) => x.guard.active && tileAt(v, i, x.guard.cell)?.revealed && tileAt(v, i, x.guard.cell).type === 'camera' && !(i === f && x.guard.cell === n))) pen += ctx.weight;
            if (t.type === 'lab' && !t.used) pen -= 4;
            if (cost > left) continue;
            dfs(n, left - cost, value - pen, peeked, dice, nextMotion, hawkFree, cmd, depth + 1, nextAlarm);
        }
        // のぞく（今の部屋から）
        const peekCostNow = p.char === 'hawk' && hawkFree ? 0 : 1;
        if (peekCostNow <= left) {
            const cells = p.char === 'hawk' ? neighbors(cell) : playerNeighbors(v, f, cell);
            for (const u of cells) {
                if (tileAt(v, f, u).revealed || peeked.includes(u)) continue;
                const val = goal.peekValue(u);
                if (val <= 0) continue;
                const cmd = first ?? { type: 'peek', to: idOf(f, u) };
                dfs(cell, left - peekCostNow, value + val, [...peeked, u], dice, motion, false, cmd, depth + 1, alarm);
            }
        }
        // 金庫（ダイスを足す・振る）
        if (here.revealed && here.type === 'safe' && !fl.safe.cracked && !hiddenNeeds) {
            if (left >= 2 && dice < 6) {
                const cmd = first ?? { type: 'addDie' };
                dfs(cell, left - 2, value + (dice < 3 ? 7 : dice < 5 ? 3 : 1), peeked, dice + 1, motion, hawkFree, cmd, depth + 1, alarm);
            }
            if (dice > 0) {
                // 振るのは、その手番で1回として見積もる（2回目からは、1回目の結果を見て決め直す）
                const cmd = first ?? { type: 'crack' };
                finish(cell, value + crackValue(dice), cmd, alarm);
                if (left >= 2) dfs(cell, left - 1, value + crackValue(dice) * 0.6, peeked, dice, motion, hawkFree, cmd, depth + 1, alarm);
            }
        }
        // ハック
        const hack = here.revealed ? ROOMS[here.type]?.hack : null;
        if (hack && v.hacks[hack] < 6) {
            const cmd = first ?? { type: 'hack' };
            dfs(cell, left - 1, value + (v.hacks[hack] < 2 ? 1.5 : 0.3), peeked, dice, motion, hawkFree, cmd, depth + 1, alarm);
        }
        // 階段（ここで計画を終える）
        const leaveBy = (cmd, floor) => {
            const score = value + 60 - ctx.weight * upRisk(floor, cell, left) - (leaveAlarm >= 0 ? 3 : 0);
            if (score > best.score) best = { score, first: first ?? cmd };
        };
        if (here.revealed && here.type === 'stairs' && goal.kind === 'up' && f < topFloor(v)) leaveBy({ type: 'up' }, f + 1);
        if (goal.kind === 'down' && f > 0 && tileAt(v, f - 1, cell).revealed && tileAt(v, f - 1, cell).type === 'stairs') leaveBy({ type: 'down' }, f - 1);
    };

    const motion = (v.turn.motion ?? []).filter(id => floorOf(id) === f).map(cellOf);
    dfs(p.cell, a, 0, [], fl.safe.dice, motion, !!v.turn.hawkFree, null, 0, -1);
    return best;
}

// アクションを使わない道具で、すぐ使ってよいもの
function freeTool(ctx) {
    const { v, p, f } = ctx;
    if (!p.tools.length) return null;
    const fl = v.floors[f];
    if (p.tools.includes('virus') && v.hacks.fingerprint + v.hacks.laser + v.hacks.motion <= 3) return { type: 'tool', tool: 'virus' };
    if (p.tools.includes('stethoscope') && safeCell(v, f) >= 0 && !fl.safe.cracked && fl.safe.dice < 6) return { type: 'tool', tool: 'stethoscope' };
    if (p.tools.includes('blueprints') && !fl.safe.cracked) {
        const s = safeCell(v, f);
        const hidden = s >= 0 ? (safeNeeds(v, f) ?? []).filter(c => !tileAt(v, f, c).revealed) : [];
        const pick = hidden[0] ?? (s < 0 ? fl.tiles.findIndex(t => !t.revealed) : -1);
        if (pick >= 0) return { type: 'tool', tool: 'blueprints', to: idOf(f, pick) };
    }
    if (p.tools.includes('rollerskates') && safeCell(v, f) === p.cell && !fl.safe.cracked && ctx.a <= 2 && !(safeNeeds(v, f) ?? []).some(c => !tileAt(v, f, c).revealed)) return { type: 'tool', tool: 'rollerskates' };
    return null;
}
