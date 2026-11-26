/**
 * CPU
 * 自分から見えるもの（ビュー）だけで決める。ほかの人の手牌や牌山の並びは見ない
 * - 和了できれば必ず和了する
 * - 打牌は、向聴数が小さく、受け入れ（向聴数が進む牌の残り枚数）が多いものを選ぶ。ドラ・赤・役牌の対子は少し残す
 * - テンパイしたら、門前なら立直する（待ちが残っていないときはしない）
 * - 立直者（や3つ鳴いた人）がいて、手が遠いときは降りる（現物・筋・見えている字牌の順に安全とみる）
 * - 鳴くのは、役牌のポンと、喰いタンや役牌がすでにあるときで、向聴数が進むときだけ
 * 強さ：ふつう（normal）は上のとおり。やさしい（easy）は、鳴かず（ロンはする）、降りず、受け入れを見ずに向聴数と牌の惜しさだけで打牌する
 * ゲームの乱数は使わない（使うと記録の再現がずれる）
 */

import { createGameView } from './game-view.js';
import {
    kindOf, toCounts, isRed, isHonor, isDragon, isYaochu, doraFromIndicator, suitOf, numberOf, KIND_COUNT
} from './tiles.js';
import { shanten, kokushiShanten } from './shanten.js';

export function cpuActors(game) {
    return game.actors().filter(seat => game.players[seat].isCPU);
}

// 1手進める。進んだら true
export function runCpuStep(game, seat) {
    const view = createGameView(game, seat, { since: game.logs.length, events: false });
    let command = null;
    try {
        command = decideCommand(view, game.options.level);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    // 思わぬことで決められなかったら、一番単純な答えで必ず進める
    const fallback = simplestCommand(view);
    return !!fallback && game.applyCommand(seat, fallback);
}

export function simplestCommand(view) {
    const o = view.options;
    if (!o) return null;
    if (o.type === 'next') return { type: 'next' };
    if (o.type === 'call') return { type: 'pass' };
    return { type: 'discard', tile: o.discards.includes(view.players[view.you].drawn) ? view.players[view.you].drawn : o.discards[0] };
}

export function decideCommand(view, level = 'normal') {
    const o = view.options;
    if (!o) return null;
    if (o.type === 'next') return { type: 'next' };
    if (o.type === 'call') return level === 'easy' ? { type: o.ron ? 'ron' : 'pass' } : decideCall(view, o);
    return decideTurn(view, o, level);
}

// ヒント：その席の人に、ふつうの CPU が選ぶ手を返す（操作する番だけ）。自分のビューだけで決める
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (!game.actors().includes(seat)) return null;
    return decideCommand(createGameView(game, seat, { since: game.logs.length, events: false }), 'normal');
}

// ---- 見立て ----

const handCounts = (view) => toCounts(view.players[view.you].hand);
const meldCountOf = (view) => view.players[view.you].melds.length;
const doraKinds = (view) => view.doraIndicators.map(id => doraFromIndicator(kindOf(id)));
const valueWinds = (view) => [view.players[view.you].seatWind, view.roundWind];
const isValueHonor = (view, k) => isDragon(k) || valueWinds(view).includes(k);

// 危ない相手（立直した人、3つ以上鳴いた人）
function threats(view) {
    return view.players.filter(p => p.id !== view.you && (p.riichi > 0 || p.riichiPending || p.melds.length >= 3)).map(p => p.id);
}

// 受け入れの枚数（その牌を引くと向聴数が進む、まだ見えていない牌の数）
function ukeire(counts, meldCount, seen, base) {
    let total = 0;
    for (let k = 0; k < KIND_COUNT; k++) {
        const left = 4 - seen[k];
        if (left <= 0 || counts[k] >= 4) continue;
        counts[k]++;
        if (shanten(counts, meldCount) < base) total += left;
        counts[k]--;
    }
    return total;
}

// 相手 seat に対して kind がどれだけ危ないか（0 が安全）
function danger(view, seat, kind) {
    const target = view.players[seat];
    const safe = new Set(target.discards.map(d => kindOf(d.tile)));
    if (safe.has(kind)) return 0;
    const seen = view.seen[kind];
    if (isHonor(kind)) {
        const base = seen >= 3 ? 1 : seen === 2 ? 3 : 6;
        return base + (isDragon(kind) || kind === target.seatWind || kind === view.roundWind ? 1 : 0);
    }
    const n = numberOf(kind);
    const sujiSafe = (d) => {
        const m = n + d;
        if (m < 1 || m > 9) return null;
        return safe.has(kind + d);
    };
    let base = n === 1 || n === 9 ? 5 : n === 2 || n === 8 ? 7 : 9;
    const low = sujiSafe(-3);
    const high = sujiSafe(3);
    const sides = [low, high].filter(v => v !== null);
    const covered = sides.filter(Boolean).length;
    if (covered === sides.length && covered > 0) base *= 0.4;
    else if (covered > 0) base *= 0.7;
    // 4枚見えている隣の牌があると、両面で待たれにくい（壁）
    if (seen >= 3) base *= 0.8;
    return base;
}

const maxDanger = (view, seats, kind) => seats.reduce((m, s) => Math.max(m, danger(view, s, kind)), 0);

// 捨てると惜しい度合い（ドラ・赤・役牌の対子）
function keepValue(view, counts, tile) {
    const k = kindOf(tile);
    let v = 0;
    v += doraKinds(view).filter(d => d === k).length * 3;
    if (isRed(tile)) v += 3;
    if (isValueHonor(view, k) && counts[k] >= 2) v += 4;
    if (isHonor(k) && counts[k] === 1) v -= isValueHonor(view, k) ? 0.5 : 1.5; // 孤立した字牌は早めに切る
    if (!isHonor(k) && (numberOf(k) === 1 || numberOf(k) === 9) && counts[k] === 1) v -= 0.5;
    return v;
}

// 捨てる候補ごとの評価
function evaluateDiscards(view, tiles) {
    const counts = handCounts(view);
    const meldCount = meldCountOf(view);
    const seen = view.seen;
    const seenKinds = new Set();
    // 同じ種類なら、赤でないほうを先に捨てる
    const ordered = [...tiles].sort((a, b) => Number(isRed(a)) - Number(isRed(b)));
    const results = [];
    for (const tile of ordered) {
        const k = kindOf(tile);
        if (seenKinds.has(k)) continue;
        seenKinds.add(k);
        counts[k]--;
        const s = shanten(counts, meldCount);
        const u = ukeire(counts, meldCount, seen, s);
        counts[k]++;
        results.push({ tile, kind: k, shanten: s, ukeire: u, keep: keepValue(view, counts, tile) });
    }
    return results;
}

function decideTurn(view, o, level = 'normal') {
    const me = view.players[view.you];
    if (o.tsumo) return { type: 'tsumo' };
    const counts = handCounts(view);
    if (o.kyuushu && kokushiShanten(counts) > 2) return { type: 'kyuushu' };
    const threatSeats = threats(view);
    if (me.riichi > 0) {
        if (o.kans.length) return { type: 'kan', kind: o.kans[0] };
        return { type: 'discard', tile: me.drawn };
    }

    const options = evaluateDiscards(view, o.discards);
    const best = Math.min(...options.map(e => e.shanten));

    // カン：向聴数が下がらず、危ない相手がいないとき
    for (const k of o.kans) {
        if (threatSeats.length) break;
        const c = [...counts];
        const kakan = c[k] < 4;
        c[k] -= kakan ? 1 : 4;
        const after = shanten(c, meldCountOf(view) + (kakan ? 0 : 1));
        if (after <= best) return { type: 'kan', kind: k };
    }

    // 立直：待ちが一番多い牌で
    if (o.riichi.length) {
        const riichiOptions = options.filter(e => o.riichi.includes(e.tile) || o.riichi.some(id => kindOf(id) === e.kind));
        riichiOptions.sort((a, b) => b.ukeire - a.ukeire || a.keep - b.keep);
        const pick = riichiOptions[0];
        if (pick && pick.ukeire > 0) {
            const tile = o.riichi.find(id => kindOf(id) === pick.kind && !isRed(id)) ?? o.riichi.find(id => kindOf(id) === pick.kind);
            return { type: 'discard', tile, riichi: true };
        }
    }

    // やさしい：受け入れも危なさも見ず、向聴数と牌の惜しさだけで選ぶ
    if (level === 'easy') {
        options.sort((a, b) => a.shanten - b.shanten || a.keep - b.keep);
        return { type: 'discard', tile: options[0].tile };
    }

    // 降りる：危ない相手がいて、手が遠い（1向聴でも、安全な牌が少ないとき）
    if (threatSeats.length) {
        options.forEach(e => { e.danger = maxDanger(view, threatSeats, e.kind); });
        const efficient = options.filter(e => e.shanten === best).sort((a, b) => b.ukeire - a.ukeire)[0];
        const fold = best >= 2 || (best === 1 && efficient.danger > 2.5);
        if (fold) {
            options.sort((a, b) => a.danger - b.danger || a.shanten - b.shanten || b.ukeire - a.ukeire);
            return { type: 'discard', tile: options[0].tile };
        }
        options.sort((a, b) => score(b) - score(a) + (a.danger - b.danger) * 20);
        return { type: 'discard', tile: options[0].tile };
    }

    options.sort((a, b) => score(b) - score(a));
    return { type: 'discard', tile: options[0].tile };
}

const score = (e) => -e.shanten * 1000 + e.ukeire * 4 - e.keep * 6;

// ---- 鳴き ----

function decideCall(view, o) {
    if (o.ron) return { type: 'ron' };
    const me = view.players[view.you];
    const counts = handCounts(view);
    const meldCount = meldCountOf(view);
    const now = shanten(counts, meldCount);
    if (threats(view).length && now >= 2) return { type: 'pass' };
    const kind = kindOf(view.call.tile);

    // 鳴いたあとの向聴数（一番よい打牌をしたとき）
    const afterCall = (used) => {
        const c = [...counts];
        used.forEach(id => { c[kindOf(id)]--; });
        let best = 9;
        for (let k = 0; k < KIND_COUNT; k++) {
            if (!c[k] || k === kind) continue;
            c[k]--;
            best = Math.min(best, shanten(c, meldCount + 1));
            c[k]++;
        }
        return best;
    };

    // 鳴いても役がありそうか
    const yakuhaiMeld = me.melds.some(m => m.type !== 'chi' && isValueHonor(view, kindOf(m.tiles[0])));
    const tanyaoPlan = (used) => {
        if (isYaochu(kind)) return false;
        if (me.melds.some(m => m.tiles.some(t => isYaochu(kindOf(t))))) return false;
        const c = [...counts];
        used.forEach(id => { c[kindOf(id)]--; });
        const yaochu = c.reduce((s, n, k) => s + (isYaochu(k) ? n : 0), 0);
        return yaochu <= 1;
    };
    const honitsuPlan = (used) => {
        const c = [...counts];
        used.forEach(id => { c[kindOf(id)]--; });
        const suits = new Set();
        c.forEach((n, k) => { if (n && !isHonor(k)) suits.add(suitOf(k)); });
        me.melds.forEach(m => m.tiles.forEach(t => { if (!isHonor(kindOf(t))) suits.add(suitOf(kindOf(t))); }));
        if (!isHonor(kind)) suits.add(suitOf(kind));
        return suits.size <= 1 && c.some((n, k) => n >= 2 && isValueHonor(view, k));
    };

    if (o.pon.length) {
        const used = o.pon[0];
        const after = afterCall(used);
        if (isValueHonor(view, kind) && after <= now) return { type: 'pon', tiles: used };
        if (after < now && (yakuhaiMeld || tanyaoPlan(used) || honitsuPlan(used))) return { type: 'pon', tiles: used };
    }
    if (o.chi.length) {
        const ranked = o.chi.map(used => ({ used, after: afterCall(used) })).sort((a, b) => a.after - b.after);
        const pick = ranked[0];
        if (pick.after < now && (yakuhaiMeld || tanyaoPlan(pick.used))) return { type: 'chi', tiles: pick.used };
    }
    return { type: 'pass' };
}
