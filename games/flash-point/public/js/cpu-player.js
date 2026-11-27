/**
 * CPU の仲間（消防士）
 * - 準備：専門職は決めた好みの順に、始める場所は要救助者の印にいちばん近い入口のそばを選ぶ（仲間と重ならないように）
 * - 手番：残りの AP で打てる手の並びを、ビーム探索（幅 BEAM）で試し、評価が一番高い並びの先頭を打つ。何もしない方がよければ手番を終える
 *   評価は、助け出した人数、運んでいる人と出口の距離、次に向かう印との距離、火と煙の数、印や危険物のそばの火、
 *   火の中で手番を終える危なさ、壁のダメージ、持ち越す AP、を足したもの
 * - 見てよい情報だけを使う：正体の分からない印の中身はのぞかない（写しでは中身を消してある）
 * - ゲームの乱数は使わない（記録の再現がずれないように）。同じ状態なら、いつも同じ手を打つ
 */

import {
    CELL_COUNT, NEIGHBORS, isInside, edgeKey, stepFrom, INSIDE_CELLS, OUTSIDE_CELLS, SAVE_LIMIT, rowOf, colOf, ENGINE_QUADRANT, inQuadrant, ENGINE_SPOTS
} from './board.js';

export const BEAM = 24;
const MAX_DEPTH = 14;
// 評価の重み
export const W = {
    rescued: 1000,
    carried: 820,
    carryStep: 55,
    targetStep: 10,
    fire: 120,
    smoke: 35,
    poiSmoke: 70,
    poiFire: 120,
    poiSmokeNear: 12,
    hazmat: 20,
    hazmatFire: 50,
    inFire: 450,
    damage: 25,
    savedAp: 4,
    hotspotFire: 4,
    blast: 0
};
const ROLE_ORDER = ['generalist', 'cafs', 'rescue', 'paramedic', 'imaging', 'hazmat', 'driver', 'captain'];

// CPU が何かをする番か
export function isCpuTurn(game) {
    if (game.isOver()) return false;
    return game.actors().some(s => game.players[s].isCPU);
}

// CPU に1手打たせる。seat を渡すと、その席として打つ
export function runCpuStep(game, seat = null) {
    if (game.isOver()) return false;
    const actor = seat ?? game.actors().find(s => game.players[s].isCPU);
    if (actor === undefined || !game.actors().includes(actor)) return false;
    const command = decide(game, actor);
    if (command && game.applyCommand(actor, command)) return true;
    // 決めた手が通らなければ、いちばん単純な手で進める
    for (const fb of fallbacks(game, actor)) {
        if (game.applyCommand(actor, fb)) return true;
    }
    return false;
}

// ヒント（おすすめの手）。操作する番の人にだけ返す。状態は変えない
export function suggest(game, seat) {
    if (game.isOver() || !game.actors().includes(seat)) return null;
    return decide(game, seat);
}

function fallbacks(game, seat) {
    if (game.phase === 'role') return game.unusedRoles().map(role => ({ type: 'role', role }));
    if (game.phase === 'place') return OUTSIDE_CELLS.map(cell => ({ type: 'place', cell }));
    void seat;
    return [{ type: 'end' }];
}

export function decide(game, seat) {
    if (game.phase === 'role') {
        const free = game.unusedRoles();
        return { type: 'role', role: ROLE_ORDER.find(r => free.includes(r)) ?? free[0] };
    }
    if (game.phase === 'place') return { type: 'place', cell: chooseStart(game, seat) };
    if (game.phase !== 'turn') return null;
    return rule(game, seat) ?? plan(game, seat);
}

// ---- 距離 ----

// 辺を通れるか・扉を開ける AP（閉じた扉は1、通れなければ null）
function edgeCost(g, a, b) {
    const e = g.edges[edgeKey(a, b)];
    if (!e || e.t === 'broken') return 0;
    if (e.t === 'door') return e.s === 'open' ? 0 : 1;
    return null;
}

// マスごとの、たどり着くのにかかる AP（from から。carry：運んでいる。heavy：1歩2AP）
// 運んでいるときは、火のマスは煙にしてから入る（1AP 足す）
function distFrom(g, from, { carry = false, heavy = false } = {}) {
    const dist = new Array(CELL_COUNT).fill(Infinity);
    const buckets = [[from]];
    dist[from] = 0;
    for (let d = 0; d < buckets.length; d++) {
        const list = buckets[d];
        if (!list) continue;
        for (const a of list) {
            if (dist[a] !== d) continue;
            for (const b of NEIGHBORS[a]) {
                const door = edgeCost(g, a, b);
                if (door === null) continue;
                const step = carry ? (heavy ? 2 : 1) + (g.fire[b] === 2 ? 1 : 0) : (g.fire[b] === 2 ? 2 : 1);
                const nd = d + door + step;
                if (nd < dist[b]) {
                    dist[b] = nd;
                    (buckets[nd] ??= []).push(b);
                }
            }
        }
    }
    return dist;
}

// 建物の外までの AP（運んでいる人用。外のマスから逆にたどる）
function exitDist(g, heavy) {
    const dist = new Array(CELL_COUNT).fill(Infinity);
    const buckets = [[]];
    OUTSIDE_CELLS.forEach(c => { dist[c] = 0; buckets[0].push(c); });
    for (let d = 0; d < buckets.length; d++) {
        const list = buckets[d];
        if (!list) continue;
        for (const b of list) {
            if (dist[b] !== d) continue;
            for (const a of NEIGHBORS[b]) {
                if (!isInside(a)) continue;
                const door = edgeCost(g, a, b);
                if (door === null) continue;
                const nd = d + door + (heavy ? 2 : 1) + (g.fire[b] === 2 ? 1 : 0);
                if (nd < dist[a]) {
                    dist[a] = nd;
                    (buckets[nd] ??= []).push(a);
                }
            }
        }
    }
    return dist;
}

// ---- 準備 ----

function chooseStart(game, seat) {
    const g = game.simClone();
    const taken = game.players.filter(p => p.id !== seat && p.cell !== null).map(p => p.cell);
    const targets = g.pois.map(x => x.cell);
    let best = OUTSIDE_CELLS[0];
    let bestScore = Infinity;
    OUTSIDE_CELLS.forEach(cell => {
        const dist = distFrom(g, cell);
        const near = targets.length ? Math.min(...targets.map(t => dist[t])) : 0;
        const crowd = taken.filter(t => Math.abs(rowOf(t) - rowOf(cell)) + Math.abs(colOf(t) - colOf(cell)) <= 1).length;
        const score = near + 3 * crowd;
        if (score < bestScore) {
            bestScore = score;
            best = cell;
        }
    });
    return best;
}

// ---- 決まった手（探索の外で決める） ----

function rule(game, seat) {
    const p = game.players[seat];
    // 探査隊員：遠くの印は、行く前に正体を調べる
    if (p.role === 'imaging' && p.ap >= 1) {
        const dist = distFrom(game, p.cell);
        const far = game.pois.filter(x => !x.revealed && dist[x.cell] > 2).sort((a, b) => dist[a.cell] - dist[b.cell])[0];
        if (far) return { type: 'identify', cell: far.cell };
    }
    // 消防車に乗っていて、区画に火が多く隊員がいなければ放水する
    if (game.vehicles && game.onVehicle(seat, 'engine')) {
        const q = ENGINE_QUADRANT[game.vehicles.engine];
        const fires = INSIDE_CELLS.filter(c => inQuadrant(c, q) && game.fire[c] === 2).length;
        const cmd = { type: 'gun' };
        if (fires >= 4 && !game.commandError(seat, cmd)) return cmd;
    }
    void ENGINE_SPOTS;
    return null;
}

// ---- 手の並びの探索 ----

function candidates(g, seat) {
    const p = g.players[seat];
    const list = [];
    if (!p.carry) {
        const victim = g.pois.find(x => x.cell === p.cell && x.revealed && !g.carrierOf(`p${x.id}`));
        if (victim) list.push({ type: 'carry', item: `p${victim.id}` });
        else {
            const h = g.hazmats.find(x => x.cell === p.cell && !g.carrierOf(`h${x.id}`));
            if (h && p.role !== 'hazmat') list.push({ type: 'carry', item: `h${h.id}` });
        }
    }
    if (p.role === 'paramedic' && g.pois.some(x => x.cell === p.cell && x.revealed && !x.treated)) list.push({ type: 'treat' });
    if (p.role === 'hazmat' && g.hazmatAt(p.cell)) list.push({ type: 'dispose' });
    if (isInside(p.cell) && g.fire[p.cell]) list.push({ type: 'extinguish', cell: p.cell });
    for (const n of NEIGHBORS[p.cell]) {
        const e = g.edges[edgeKey(p.cell, n)];
        if (e?.t === 'door' && e.s === 'closed') list.push({ type: 'door', to: n });
        if (isInside(n) && g.fire[n] && g.passable(p.cell, n)) list.push({ type: 'extinguish', cell: n });
        list.push({ type: 'move', to: n });
    }
    return list;
}

function stateKey(g, seat) {
    const p = g.players[seat];
    let fire = '';
    for (let i = 0; i < CELL_COUNT; i++) fire += g.fire[i];
    const doors = Object.entries(g.edges).filter(([, e]) => e.t === 'door' && e.s === 'open').map(([k]) => k).join(',');
    return `${p.cell}|${p.carry}|${p.ap}|${p.ext}|${p.mv}|${g.rescued}|${fire}|${doors}|${g.pois.map(x => x.treated ? 1 : 0).join('')}|${g.hazmats.length}`;
}

function cloneSim(g) {
    const c = Object.create(Object.getPrototypeOf(g));
    Object.assign(c, g);
    c.fire = [...g.fire];
    c.edges = { ...g.edges };
    c.pois = g.pois.map(x => ({ ...x }));
    c.hazmats = g.hazmats.map(h => ({ ...h }));
    c.players = g.players.map(p => ({ ...p }));
    return c;
}

function plan(game, seat) {
    const root = game.simClone();
    const ctx = context(root, seat);
    let beam = [{ g: root, first: null, score: evaluate(root, seat, ctx) }];
    let best = beam[0];
    const seen = new Set([stateKey(root, seat)]);
    for (let depth = 0; depth < MAX_DEPTH && beam.length; depth++) {
        const next = [];
        for (const node of beam) {
            for (const cmd of candidates(node.g, node.g.current === seat ? seat : seat)) {
                if (node.g.commandError(seat, cmd)) continue;
                const g = cloneSim(node.g);
                if (!g.simApply(seat, cmd)) continue;
                const key = stateKey(g, seat);
                if (seen.has(key)) continue;
                seen.add(key);
                const child = { g, first: node.first ?? cmd, score: evaluate(g, seat, ctx) };
                next.push(child);
                if (child.score > best.score + 1e-9) best = child;
            }
        }
        next.sort((a, b) => b.score - a.score);
        beam = next.slice(0, BEAM);
    }
    return best.first ?? { type: 'end' };
}

// 探索のはじめに1回だけ計算するもの：ほかの隊員が向かう印（自分は、ほかの人のほうが近い印を後回しにする）
function context(g, seat) {
    const others = g.players.filter(p => p.id !== seat && p.cell !== null && !p.carry);
    const otherDist = new Map();
    const maps = others.map(p => distFrom(g, p.cell));
    g.pois.forEach(x => {
        otherDist.set(x.id, maps.length ? Math.min(...maps.map(m => m[x.cell])) : Infinity);
    });
    const mine = distFrom(g, g.players[seat].cell);
    const claimed = new Set(g.pois.filter(x => otherDist.get(x.id) + 1 < mine[x.cell]).map(x => x.id));
    return { claimed };
}

// 手番を終えたあと、必ず起きるフラッシュオーバー（火のとなりの煙は火になる）を当てた火と煙
function projectFire(g) {
    const fire = [...g.fire];
    for (let again = true; again;) {
        again = false;
        for (const cell of INSIDE_CELLS) {
            if (fire[cell] !== 1) continue;
            if (NEIGHBORS[cell].some(n => isInside(n) && fire[n] === 2 && g.passable(cell, n))) {
                fire[cell] = 2;
                again = true;
            }
        }
    }
    return fire;
}

// そのマスで爆発したときに、壁と扉に入るダメージの見込み（火のマスは衝撃波が突き抜ける）
function blastDamage(g, fire, origin) {
    let n = 0;
    for (let dir = 0; dir < 4; dir++) {
        let cur = origin;
        for (;;) {
            const next = stepFrom(cur, dir);
            if (next < 0) break;
            const e = g.edges[edgeKey(cur, next)];
            if (e?.t === 'wall' || (e?.t === 'door' && e.s === 'closed')) {
                n++;
                break;
            }
            if (!isInside(next) || fire[next] !== 2) break;
            cur = next;
        }
    }
    return n;
}

// 盤面の良さ（その席の手番を、ここで終えるとして）
export function evaluate(g, seat, ctx = { claimed: new Set() }) {
    const p = g.players[seat];
    const fire = projectFire(g);
    let score = W.rescued * g.rescued;
    // 運んでいる人：外までの距離
    let carryingVictim = false;
    g.players.forEach(q => {
        if (!q.carry || q.carry[0] !== 'p') return;
        const it = g.item(q.carry);
        const ex = exitDist(g, !it?.treated)[q.cell];
        score += W.carried - W.carryStep * Math.min(ex, 20);
        if (q.id === seat) carryingVictim = true;
    });
    // 自分が次に向かう印
    if (!p.carry && p.cell !== null) {
        const dist = distFrom(g, p.cell);
        const free = g.pois.filter(x => !g.carrierOf(`p${x.id}`));
        const open = free.filter(x => !ctx.claimed.has(x.id));
        const list = open.length ? open : free;
        if (list.length) {
            const d = Math.min(...list.map(x => dist[x.cell] - (x.revealed ? 0.5 : 0)));
            score -= W.targetStep * Math.min(Math.max(d, 0), 20);
        }
    }
    void carryingVictim;
    // 火と煙
    for (const cell of INSIDE_CELLS) {
        const f = fire[cell];
        if (f === 2) score -= W.fire + W.blast * blastDamage(g, fire, cell) + (g.hotspots.includes(cell) ? W.hotspotFire : 0);
        else if (f === 1) score -= W.smoke;
    }
    // 印のそばの火（運ばれていない印）
    g.pois.forEach(x => {
        if (g.carrierOf(`p${x.id}`)) return;
        const value = x.revealed ? 1 : 0.67;
        let risk = 0;
        if (fire[x.cell] === 2) risk += W.rescued;
        else if (fire[x.cell] === 1) risk += W.poiSmoke;
        for (const n of NEIGHBORS[x.cell]) {
            if (!isInside(n) || !g.passable(x.cell, n)) continue;
            if (fire[n] === 2) risk += W.poiFire;
            else if (fire[n] === 1) risk += W.poiSmokeNear;
        }
        score -= value * risk;
    });
    // 危険物（運んでいても、外へ出すまでは危険物として数える）
    g.hazmats.forEach(h => {
        score -= W.hazmat;
        if (g.carrierOf(`h${h.id}`)) return;
        for (const n of NEIGHBORS[h.cell]) {
            if (isInside(n) && fire[n] === 2 && g.passable(h.cell, n)) score -= W.hazmatFire;
        }
        if (fire[h.cell] === 2) score -= 4 * W.hazmatFire;
        else if (fire[h.cell] === 1) score -= W.hazmatFire;
    });
    // 火の中で手番を終えると倒れる
    g.players.forEach(q => {
        if (q.cell !== null && isInside(q.cell) && fire[q.cell] === 2) score -= W.inFire + (q.carry ? W.rescued : 0);
    });
    score -= W.damage * g.damage;
    score += W.savedAp * Math.min(p.ap, SAVE_LIMIT);
    return score;
}
