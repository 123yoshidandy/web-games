/**
 * CPU（ヒントと同じ関数で手を選ぶ）
 * - 英雄の番：残りのアクションの並びをビーム探索で試し、盤面の評価が一番高い並びの先頭を打つ。良くならなければ手番を終える
 * - 怪物の番の選択：標的は、防げる英雄 → 村人 → 英雄の順。防御は、いちばん要らないアイテムを捨てて必ず防ぐ
 * - 特典：夜更かし・差し入れ・探し物はすぐ使う。夜明けは、手番を終えるときに怪物のそばに人がいれば使う
 * 見てよい情報だけを使い（袋・山札の並びは見ない）、ゲームの乱数は使わない。同じ状態なら同じ手を打つ
 */

import { LOCATIONS, NEIGHBORS, DIST, ITEMS, COLORS, MONSTER, VILLAGERS, PERK_CARDS, LOCATION_COUNT } from './data.js';
import Game from './game.js';

const BEAM = 6;
const MAX_DEPTH = 5;

// ---- 目的に要るもの ----

// 残っている要りもの：{ color（null はどの色でも）, total, loc, monster, kind（task・defeat・evidence）, active（今進められるか） }
export function requirements(g) {
    const reqs = [];
    g.monsters.forEach((m, i) => {
        if (m.defeated) return;
        const def = MONSTER[m.key];
        const done = g.taskDone(m);
        switch (m.key) {
            case 'vampire':
                def.coffins.forEach((l, k) => { if (!m.task[k]) reqs.push({ color: 'red', total: def.need.total, loc: l, monster: i, kind: 'task', active: true }); });
                break;
            case 'mummy':
                COLORS.forEach((c, k) => { if (!m.task[k]) reqs.push({ color: c, total: def.need.total, loc: def.at, monster: i, kind: 'task', active: true }); });
                break;
            case 'invisible': {
                const left = 5 - m.task.length;
                if (left > 0) reqs.push({ color: null, total: left, loc: def.at, monster: i, kind: 'evidence', active: true, used: m.task });
                break;
            }
            default: {
                const left = def.steps - m.task;
                for (let k = 0; k < left; k++) reqs.push({ color: def.need.color, total: def.need.total, loc: def.at, monster: i, kind: 'task', active: k === 0 });
            }
        }
        reqs.push({ color: def.defeat.color, total: def.defeat.total, loc: m.loc, monster: i, kind: 'defeat', active: done });
    });
    return reqs;
}

// 色ごとに、残りの目的に要る強さの合計
function demandOf(reqs) {
    const d = { red: 0, blue: 0, yellow: 0 };
    reqs.forEach(r => { if (r.color) d[r.color] += r.total; });
    return d;
}

// 合計が need 以上になる、強さの合計がいちばん小さい組（なければ null）。ids は同じ色のアイテム
export function minimalSet(ids, need) {
    if (need <= 0) return [];
    const sorted = [...ids].sort((a, b) => ITEMS[a].strength - ITEMS[b].strength || a - b);
    const cap = need + 6;
    let best = new Map([[0, []]]);
    for (const id of sorted) {
        const next = new Map(best);
        for (const [s, set] of best) {
            const t = Math.min(cap, s + ITEMS[id].strength);
            const cand = [...set, id];
            const cur = next.get(t);
            if (!cur || cand.length < cur.length) next.set(t, cand);
        }
        best = next;
    }
    for (let s = need; s <= cap; s++) if (best.has(s)) return best.get(s);
    return null;
}

const strengthOf = (ids) => ids.reduce((s, id) => s + ITEMS[id].strength, 0);
const ofColor = (items, color) => items.filter(id => ITEMS[id].color === color);

// ---- 盤面の評価（チーム全体。大きいほど良い） ----

export function evaluate(g) {
    if (g.result) return g.result.won ? 1e6 : -1e6;
    let score = 0;
    const reqs = requirements(g);
    const demand = demandOf(reqs);
    const alive = g.monsters.filter(m => !m.defeated);

    // 進み具合
    g.monsters.forEach(m => {
        if (m.defeated) score += 1000;
        else score += Game.taskProgress(m) * (m.key === 'invisible' ? 90 : 160);
    });
    score -= g.terror * 120;

    // 持っているアイテム：要る色は強さの分、要らない分は少しだけ（防御に使える）
    const held = { red: 0, blue: 0, yellow: 0 };
    g.players.forEach(p => p.items.forEach(id => { held[ITEMS[id].color] += ITEMS[id].strength; }));
    COLORS.forEach(c => { score += Math.min(held[c], demand[c] + 3) * 4 + Math.max(0, held[c] - demand[c] - 3) * 0.6; });

    // 今進められる目的：揃えた英雄が近いほど高い
    reqs.forEach(r => {
        if (!r.active) return;
        let best = 0;
        g.players.forEach(p => {
            const d = DIST[p.loc][r.loc];
            let v;
            if (r.kind === 'evidence') {
                const froms = new Set();
                p.items.forEach(id => { if (!r.used.includes(ITEMS[id].at)) froms.add(ITEMS[id].at); });
                v = Math.min(froms.size, r.total) * 18 - d * 5 * Math.min(1, froms.size);
            } else {
                const own = strengthOf(ofColor(p.items, r.color)) + (p.hero === 'scientist' ? 1 : 0);
                v = own >= r.total ? 90 - d * 11 : 45 * own / r.total - d * 2;
            }
            if (v > best) best = v;
        });
        score += best;
    });

    // 村に置かれたアイテム：要る色のものに、近い英雄がいるほど高い
    for (let l = 0; l < LOCATION_COUNT; l++) {
        if (!g.board[l].length) continue;
        let near = Infinity;
        g.players.forEach(p => { near = Math.min(near, DIST[p.loc][l]); });
        const worth = g.board[l].reduce((s, id) => s + (held[ITEMS[id].color] < demand[ITEMS[id].color] + 3 ? ITEMS[id].strength : 0.5), 0);
        score += worth * 1.6 / (1 + near);
    }

    // 村人：家から遠いほど、怪物に近いほど低い。送り届けて得た特典は高い
    g.villagers.forEach((l, v) => {
        if (l === null) return;
        score -= 25 + DIST[l][VILLAGERS[v].home] * 7;
        alive.forEach(m => { if (DIST[l][m.loc] <= 2) score -= 14 - DIST[l][m.loc] * 4; });
        let near = Infinity;
        g.players.forEach(p => { near = Math.min(near, DIST[p.loc][l]); });
        score -= near * 2;
    });
    g.players.forEach(p => { score += p.perks.length * 30; });

    // 怪物のそばの英雄：アイテムが少ないほど危ない
    g.players.forEach(p => {
        alive.forEach((m, k) => {
            const d = DIST[p.loc][m.loc];
            if (d > 1) return;
            const frenzy = g.monsters.indexOf(m) === g.frenzy ? 1.4 : 1;
            const base = p.items.length >= 3 ? 6 : p.items.length >= 1 ? 14 : 30;
            score -= base * (d === 0 ? 1.3 : 0.8) * frenzy;
            void k;
        });
    });
    return score;
}

// ---- 手の候補 ----

export function candidateActions(g, seat) {
    const p = g.players[seat];
    const list = [];
    const canAct = g.actionsLeft > 0;
    if (canAct) {
        // 移動（家に近づく村人は連れて行く）
        NEIGHBORS[p.loc].forEach(to => {
            list.push({ type: 'move', to });
            const vs = g.villagersAt(p.loc).filter(v => DIST[to][VILLAGERS[v].home] < DIST[p.loc][VILLAGERS[v].home]);
            if (vs.length) list.push({ type: 'move', to, villagers: vs });
        });
        // 拾う
        if (g.board[p.loc].length) list.push({ type: 'pickup' });
        if (p.hero === 'archaeologist') NEIGHBORS[p.loc].forEach(n => { if (g.board[n].length) list.push({ type: 'pickup', from: n }); });
        // 共有：同じ地点の英雄と、色ごとにまとめて渡す・受け取る
        g.players.forEach(q => {
            if (q.id === seat || q.loc !== p.loc) return;
            COLORS.forEach(c => {
                const give = ofColor(p.items, c);
                const take = ofColor(q.items, c);
                if (give.length) list.push({ type: 'share', with: q.id, give });
                if (take.length) list.push({ type: 'share', with: q.id, take });
            });
        });
        // 前進・退治
        g.monsters.forEach((m, i) => {
            if (m.defeated) return;
            if (!g.taskDone(m)) {
                advanceOptions(g, seat, i).forEach(items => list.push({ type: 'advance', monster: i, items }));
            } else if (m.loc === p.loc) {
                const def = MONSTER[m.key].defeat;
                const set = minimalSet(ofColor(p.items, def.color), def.total - g.bonusFor(seat));
                if (set && set.length) list.push({ type: 'defeat', monster: i, items: set });
            }
        });
        // 運び屋
        if (p.hero === 'courier') [...new Set(g.players.filter(q => q.id !== seat && q.loc !== p.loc).map(q => q.loc))].forEach(to => list.push({ type: 'special', to }));
    }
    // 案内（警部は手番に1回アクションなし）
    if (canAct || g.freeGuide(seat)) {
        g.villagersAt(p.loc).forEach(v => {
            const to = NEIGHBORS[p.loc].reduce((best, n) => (DIST[n][VILLAGERS[v].home] < DIST[best][VILLAGERS[v].home] ? n : best), p.loc);
            if (to !== p.loc) list.push({ type: 'guide', villager: v, to });
        });
        NEIGHBORS[p.loc].forEach(n => g.villagersAt(n).forEach(v => {
            if (DIST[p.loc][VILLAGERS[v].home] < DIST[n][VILLAGERS[v].home]) list.push({ type: 'guide', villager: v, to: p.loc });
        }));
    }
    // 急ぎ足（アクションを使わない）
    const hurry = p.perks.find(id => id >= 0 && PERK_CARDS[id].key === 'hurry');
    if (hurry !== undefined) {
        for (let l = 0; l < LOCATION_COUNT; l++) if (DIST[p.loc][l] === 2) list.push({ type: 'perk', card: hurry, to: l });
    }
    return list;
}

// この地点で進められる目的と、使うアイテムの組
function advanceOptions(g, seat, i) {
    const p = g.players[seat];
    const m = g.monsters[i];
    const def = MONSTER[m.key];
    const bonus = g.bonusFor(seat);
    const out = [];
    if (m.key === 'vampire') {
        const k = def.coffins.indexOf(p.loc);
        if (k >= 0 && !m.task[k]) {
            const set = minimalSet(ofColor(p.items, 'red'), def.need.total - bonus);
            if (set && set.length) out.push(set);
        }
    } else if (m.key === 'invisible') {
        if (p.loc === def.at) {
            // 出どころの違うものを、要らない順に（弱い順）
            const seen = new Set(m.task);
            const picks = [];
            [...p.items].sort((a, b) => ITEMS[a].strength - ITEMS[b].strength || a - b).forEach(id => {
                if (picks.length < 5 - m.task.length && !seen.has(ITEMS[id].at)) {
                    seen.add(ITEMS[id].at);
                    picks.push(id);
                }
            });
            if (picks.length) out.push(picks);
        }
    } else if (p.loc === def.at) {
        const colors = m.key === 'mummy' ? COLORS.filter((_, k) => !m.task[k]) : [def.need.color];
        colors.forEach(c => {
            const set = minimalSet(ofColor(p.items, c), def.need.total - bonus);
            if (set && set.length) out.push(set);
        });
    }
    return out;
}

// ---- 英雄の番 ----

function bestAction(game, seat) {
    const root = game.simClone();
    const base = evaluate(root);
    let beam = [{ g: root, first: null, score: base }];
    let best = { first: null, score: base };
    const depth = Math.min(MAX_DEPTH, Math.max(1, game.actionsLeft + 1));
    for (let d = 0; d < depth; d++) {
        const next = [];
        beam.forEach(node => {
            candidateActions(node.g, seat).forEach(command => {
                const g = node.g.simClone();
                g.result = node.g.result;
                if (!g.applyCommand(seat, command)) return;
                const score = evaluate(g);
                next.push({ g, first: node.first ?? command, score });
            });
        });
        if (!next.length) break;
        next.sort((a, b) => b.score - a.score);
        // 同じ盤面の重なりを除く
        const seen = new Set();
        beam = [];
        for (const n of next) {
            const key = n.g.players.map(p => `${p.loc}:${p.items.length}:${p.perks.length}`).join('|') + n.g.villagers.join(',') + n.g.monsters.map(m => `${m.defeated}${Game.taskProgress(m)}`).join('');
            if (seen.has(key)) continue;
            seen.add(key);
            beam.push(n);
            if (beam.length >= BEAM) break;
        }
        if (beam[0].score > best.score + 0.01) best = beam[0];
    }
    return best.first;
}

// 盤面で怪物のそばにいる人の数（夜明けを使うかの目安）
function threatened(game) {
    let n = 0;
    game.monsters.forEach(m => {
        if (m.defeated) return;
        game.players.forEach(p => { if (DIST[p.loc][m.loc] <= 1 && p.items.length < 2) n++; });
        game.villagers.forEach(l => { if (l !== null && DIST[l][m.loc] <= 2) n++; });
    });
    return n;
}

// 探し物で取るアイテム：要る色の、いちばん強いもの
function searchPick(game) {
    const demand = demandOf(requirements(game));
    let best = null;
    game.board.forEach(list => list.forEach(id => {
        const v = ITEMS[id].strength * (demand[ITEMS[id].color] > 0 ? 1 : 0.2);
        if (!best || v > best.v) best = { id, v };
    }));
    return best?.id ?? null;
}

// 標的と防御の選び方
function promptAnswer(game, seat) {
    const pr = game.prompt;
    if (pr.type === 'target') {
        const heroes = pr.options.map((o, i) => ({ o, i })).filter(x => x.o.kind === 'hero');
        const blockers = heroes.filter(x => game.players[x.o.id].items.length >= pr.dice).sort((a, b) => game.players[b.o.id].items.length - game.players[a.o.id].items.length);
        if (blockers.length) return { type: 'target', choice: blockers[0].i };
        const villager = pr.options.findIndex(o => o.kind === 'villager');
        if (villager >= 0) return { type: 'target', choice: villager };
        const most = heroes.sort((a, b) => game.players[b.o.id].items.length - game.players[a.o.id].items.length)[0];
        return { type: 'target', choice: most.i };
    }
    // 防御：要らない順に捨てる
    const demand = demandOf(requirements(game));
    const items = [...game.players[seat].items]
        .map(id => ({ id, v: ITEMS[id].strength * (demand[ITEMS[id].color] > 0 ? 1 : 0.3) }))
        .sort((a, b) => a.v - b.v || a.id - b.id)
        .slice(0, pr.hits)
        .map(x => x.id);
    return { type: 'defend', items };
}

// その席が今打つ手（打つ番でなければ null）。状態は変えない
export function chooseCommand(game, seat) {
    if (game.isOver() || !game.actors().includes(seat)) return null;
    if (game.prompt) return promptAnswer(game, seat);
    const p = game.players[seat];
    const perk = (key) => p.perks.find(id => PERK_CARDS[id].key === key);
    const late = perk('late');
    if (late !== undefined) return { type: 'perk', card: late };
    const supply = perk('supply');
    if (supply !== undefined && game.bag.length + game.used.length > 0) return { type: 'perk', card: supply };
    const search = perk('search');
    if (search !== undefined) {
        const item = searchPick(game);
        if (item !== null) return { type: 'perk', card: search, item };
    }
    const action = bestAction(game, seat);
    if (action) return action;
    const dawn = perk('dawn');
    if (dawn !== undefined && !game.skipMonster && threatened(game) >= 2) return { type: 'perk', card: dawn };
    return { type: 'end' };
}

// ヒント：操作する番の人にだけ返す
export const suggest = (game, seat) => chooseCommand(game, seat);

// CPU の席が操作する番か
export function isCpuTurn(game) {
    return !game.isOver() && game.actors().some(s => game.players[s].isCPU);
}

// CPU の1手（seat を省くと、操作する番の CPU）。打てたら true
export function runCpuStep(game, seat) {
    const s = seat ?? game.actors().find(a => game.players[a].isCPU);
    if (s === undefined) return false;
    const command = chooseCommand(game, s);
    if (command && game.applyCommand(s, command)) return true;
    // 思わぬ形で断られたら、いちばん単純な答えで先へ進める
    const fallback = game.prompt ? (game.prompt.type === 'target' ? { type: 'target', choice: 0 } : { type: 'defend', items: [] }) : { type: 'end' };
    return game.applyCommand(s, fallback);
}

export { LOCATIONS };
