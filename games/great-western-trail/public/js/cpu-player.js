/**
 * CPU
 * 盤面の良さを「終わりの得点の見込み」で点数にし（evaluate）、点数が一番上がる手を選ぶ
 * - 移動：行ける場所ごとに、その手番の残りを貪欲に進めてみて、最後の点数で比べる
 * - アクションの中の選択：選んだあとの点数で比べる。つよいは、選択の先にまた選択があれば1段だけ先まで見る
 * - ふつうは、選択の先を読まず、移動先の点数に揺れを混ぜる
 * 自分の山札・カンザスシティの山・牛と目標カードの山の並びは見ない（試すときは、状態から作った別の乱数で混ぜ直す）
 * ゲームの乱数は使わない
 */

import { BREEDS, BUILDINGS, PLOT_SPOTS, TRAIL, JOB_COSTS, DISCS, card } from './data.js';
import {
    trial, commandCandidates, scoreOf, ownedCards, handLimit, permCerts, clone, pathToll
} from './rules.js';

export const PROFILES = {
    // moveNoise：移動先の点数に混ぜる揺れ。noise：アクションの中の選択に混ぜる揺れ
    normal: { name: 'ふつう', moveNoise: 2, noise: 0, inner: false },
    strong: { name: 'つよい', moveNoise: 0, noise: 0, inner: true },
    random: { name: 'でたらめ', random: true }
};

// 円盤を外す順（CPU は配達や駅で、この順に外す）
const DISC_PRIORITY = ['step1', 'hand', 'cert4', 'auxDraw', 'auxMoney', 'auxCert', 'auxEngine', 'cert6', 'step2', 'auxRemove', 'station'];

function mix(a, b) {
    let h = (a ^ Math.imul(b, 0x9E3779B1)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 0xC2B2AE35) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// 見えないもの（自分の山札・各山の並び）を混ぜ直した写し
function hiddenShuffled(s, seat) {
    const sim = clone(s);
    let r = (s.rng ^ 0x5bd1e995) >>> 0;
    const rnd = () => {
        r = (r + 0x6D2B79F5) >>> 0;
        let t = r;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const shuffle = (a) => {
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(rnd() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
    };
    sim.players.forEach(p => shuffle(p.deck));
    sim.supply.forEach(shuffle);
    shuffle(sim.marketStack);
    shuffle(sim.objStack);
    sim.rng = (s.rng ^ 0x27d4eb2f) >>> 0;
    return sim;
}

// 手札（上限の枚数）を山から引いたときの、繁殖値の見込み
export function expectedHandValue(ids, size) {
    const n = ids.length;
    if (n === 0) return 0;
    const counts = {};
    ids.forEach(id => {
        const c = card(id);
        if (c.kind === 'cattle') counts[c.breed] = (counts[c.breed] ?? 0) + 1;
    });
    let total = 0;
    for (const [breed, k] of Object.entries(counts)) {
        let miss = 1;
        if (size >= n) miss = 0;
        else for (let i = 0; i < size; i++) miss *= Math.max(0, n - k - i) / (n - i);
        total += BREEDS[breed].value * (1 - miss);
    }
    return total;
}

// 評価の重み（序盤ほど効く分。終盤は0に近づく）
export const WEIGHTS = { money: 0.2, engine: 0.5, cowboy: 6, craftsman: 5, engineer: 6, hand: 5, cert: 0.8, near: 0.3 };

// 盤面の点数（seat から見た、終わりの得点の見込み）
export function evaluate(s, seat, weights = null) {
    const W = weights ?? WEIGHTS;
    const p = s.players[seat];
    const sc = scoreOf(s, seat);
    if (s.phase === 'over') return sc.total + p.money * 0.02;
    const progress = Math.min(1, (s.job.row + s.job.fill / s.n) / JOB_COSTS.length);
    const left = 1 - progress;
    let v = sc.total - sc.money;
    v += p.money * (0.2 + W.money * left);
    // 機関車：前にいるほど運賃が安く、駅を改良しやすい
    v += Math.min(p.engine, 20) * (0.15 + W.engine * left) + Math.max(0, Math.min(p.engine, 39) - 20) * 0.15 * left;
    // 労働者（4人目までは働きの見込み。5・6人目の得点は scoreOf に入っている）
    const w = p.workers;
    v += left * (W.cowboy * Math.min(w.cowboy - 1, 4) + W.craftsman * Math.min(w.craftsman - 1, 5) + W.engineer * Math.min(w.engineer - 1, 4));
    // 牛：これからカンザスシティに着くたびの収入と、遠くへの配達
    const owned = ownedCards(p);
    const hand = expectedHandValue(owned, handLimit(p)) + permCerts(p);
    v += hand * (0.6 + W.hand * left);
    v += p.cert * (0.5 + W.cert * left);
    // 外した円盤の働き
    const removed = (k) => DISCS[k].count - p.discs[k];
    v += left * (1.2 * removed('auxDraw') + 0.8 * removed('auxMoney') + 1.0 * removed('auxCert') + 0.8 * removed('auxEngine') + 0.5 * removed('auxRemove'));
    v += left * (1.5 * removed('step1') + 1.2 * removed('step2') + 0.6 * removed('cert4') + 0.4 * removed('cert6'));
    // 自分の建物（アクションと通行料）
    const mine = PLOT_SPOTS.filter(id => s.spots[id]?.t === 'building' && s.spots[id].owner === seat);
    v += left * mine.reduce((sum, id) => sum + 1.2 + (BUILDINGS[s.spots[id].n].hands ? 0.6 : 0), 0);
    // カンザスシティに近いほど、次の収入が早い
    if (p.loc && TRAIL[p.loc]) v += ((1180 - TRAIL[p.loc].y) / 1140) * W.near * left;
    return v;
}

// 候補を減らす（建てる場所は建物ごとに1か所、円盤は優先順の1つ）
function prune(s, seat, list) {
    const item = s.turn.queue[0];
    let result = list;
    if (item && ['build', 'workerBonus'].includes(item.p) && list.some(c => c.tile)) {
        const best = new Map();
        list.forEach(c => {
            if (!c.tile) return;
            const score = spotScore(s, c.tile, c.spot);
            if (!best.has(c.tile) || best.get(c.tile).score < score) best.set(c.tile, { c, score });
        });
        result = [...list.filter(c => !c.tile), ...[...best.values()].map(b => b.c)];
    }
    if (result.some(c => c.disc)) {
        const groups = new Map();
        result.forEach(c => {
            const key = JSON.stringify({ ...c, disc: null });
            const rank = DISC_PRIORITY.indexOf(c.disc);
            if (!groups.has(key) || groups.get(key).rank > rank) groups.set(key, { c, rank });
        });
        result = [...result.filter(c => !c.disc), ...[...groups.values()].map(g => g.c)];
    }
    // 道のり：行き先ごとに通行料の一番安いもの
    if (result.some(c => c.path)) {
        const best = new Map();
        result.forEach(c => {
            if (!c.path) return;
            const dest = c.path.at(-1);
            const toll = pathToll(s, seat, c.path);
            if (!best.has(dest) || best.get(dest).toll > toll) best.set(dest, { c, toll });
        });
        result = [...result.filter(c => !c.path), ...[...best.values()].map(b => b.c)];
    }
    return result;
}

// 建てる場所の良さ（リスクのアクション・森・ほかの人が通る道の上）
function spotScore(s, tile, spot) {
    const t = TRAIL[spot];
    let score = 0;
    if (t.risk) score += 1.5;
    if (t.woods) score += tile === 1 ? 3 : 0.3;
    if (s.spots[spot]) score += 2; // 建て替え（場所を使わない）
    score += (1180 - t.y) / 1180;
    return score;
}

function candidates(s, seat) {
    const list = prune(s, seat, commandCandidates(s, seat));
    // 建物のアクションから始めた選択を飛ばすと、同じ状態に戻って繰り返すので、ほかに手があれば飛ばさない
    const item = s.turn.queue[0];
    if (item?.src && list.some(c => c.type === 'choose' && trial(s, seat, c).ok)) return list.filter(c => c.type !== 'skip');
    return list;
}

// 選んだあとの点数。選択が続くなら、1段だけ先まで見る
function valueAfter(s, seat, command, inner) {
    const r = trial(s, seat, command);
    if (!r.ok) return null;
    const next = r.state;
    if (inner && next.phase === 'play' && next.turn.seat === seat && next.turn.queue.length > 0) {
        let best = -Infinity;
        const list = candidates(next, seat).filter(c => c.type !== 'skip').slice(0, 40);
        for (const c of list) {
            const r2 = trial(next, seat, c);
            if (r2.ok) best = Math.max(best, evaluate(r2.state, seat));
        }
        if (best > -Infinity) return best;
    }
    return evaluate(next, seat);
}

// 今の状態で一番よい手（貪欲）
function greedy(s, seat, profile, salt = 0) {
    let best = null;
    let bestValue = -Infinity;
    const list = candidates(s, seat);
    list.forEach((c, i) => {
        const v = valueAfter(s, seat, c, profile.inner || c.type === 'local' || c.type === 'aux' || c.type === 'objective');
        if (v === null) return;
        // 同じくらいなら、手番を終える・飛ばすより、進める手を選ぶ（ただし始めたアクションを飛ばして繰り返さない）
        const bias = c.type === 'end' ? 0.01 : c.type === 'skip' ? -0.05 : 0;
        const noisy = v + bias + (profile.noise ? (mix(s.rng + salt, i) - 0.5) * profile.noise : 0);
        if (noisy > bestValue) {
            bestValue = noisy;
            best = c;
        }
    });
    return best;
}

// 手番の終わりまで貪欲に進めて、最後の点数を返す
function playOut(s, seat, profile) {
    let sim = s;
    for (let step = 0; step < 24; step++) {
        if (sim.phase !== 'play' || sim.turn.seat !== seat) break;
        const c = greedy(sim, seat, { ...profile, inner: false, noise: 0 }, step);
        if (!c) break;
        const r = trial(sim, seat, c);
        if (!r.ok) break;
        sim = r.state;
    }
    return evaluate(sim, seat);
}

export function chooseCommand(s, seat, profile = PROFILES.normal) {
    if (s.phase !== 'play' || s.turn.seat !== seat) return null;
    if (profile.random) {
        const list = commandCandidates(s, seat).filter(c => trial(s, seat, c).ok);
        const pick = list.filter(c => c.type !== 'end');
        const pool = pick.length > 0 ? pick : list;
        return pool[Math.floor(mix(s.rng, s.turn.queue.length) * pool.length)] ?? null;
    }
    const sim = hiddenShuffled(s, seat);
    if (s.turn.stage === 'move' && s.turn.queue.length === 0) {
        const list = candidates(sim, seat).filter(c => c.type === 'move');
        let best = null;
        let bestValue = -Infinity;
        list.forEach((c, i) => {
            const r = trial(sim, seat, c);
            if (!r.ok) return;
            let v = playOut(r.state, seat, profile);
            if (profile.moveNoise) v += (mix(s.rng, i + 101) - 0.5) * profile.moveNoise;
            if (v > bestValue) {
                bestValue = v;
                best = c;
            }
        });
        if (best) return best;
    }
    return greedy(sim, seat, profile) ?? fallback(s, seat);
}


// 思わぬ形で手が見つからないとき：受け付けられる一番単純な手
function fallback(s, seat) {
    const list = commandCandidates(s, seat);
    const order = ['skip', 'end', 'choose', 'move', 'local', 'aux'];
    for (const type of order) {
        const c = list.find(x => x.type === type && trial(s, seat, x).ok);
        if (c) return c;
    }
    return null;
}

export const cpuActors = (game) => (!game.isOver() && game.players[game.turn]?.isCPU ? [game.turn] : []);

// CPU の手を1つ進める。進めたら true
export function runCpuStep(game, seat, profile = PROFILES.normal) {
    if (game.isOver() || game.turn !== seat || !game.players[seat].isCPU) return false;
    const command = chooseCommand(game.state, seat, profile);
    if (command && game.applyCommand(seat, command)) return true;
    const simple = fallback(game.state, seat);
    return !!simple && game.applyCommand(seat, simple);
}


// ヒント：人の手番に、CPU（つよい設定）が選ぶ次の操作を返す。CPU と同じく、山札は混ぜ直した写しで読む（のぞかない）
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (game.isOver() || game.turn !== seat) return null;
    return chooseCommand(game.state, seat, PROFILES.strong);
}
