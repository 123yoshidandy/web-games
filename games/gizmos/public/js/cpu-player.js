/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（山札の並びは見ない。研究で引いたカードは、自分が引いたものだけ）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 方針：場と保管庫のギズモを「点と、これから働く見込み」で評価し、建てられる良いものがあれば建てる
 *         なければ、ねらうギズモに足りない色を取るか、保管するか、研究する
 * - 強すぎないように、強さごとに見落とし・評価の揺れ・建てられるのに見送る、といった誤りを混ぜる
 */

import {
    CARDS, COLORS, LEVELS, ROW_SIZE, limitsOf, isBlocked, costFor, convertersOf, paymentFor, countEnergy,
    triggerMatches, END_GIZMOS
} from './game.js';
import { createGameView } from './game-view.js';
import { createRandom } from './random.js';

// 強さ。easy・normal は画面で選べる。strong は見落としのない比較用（強さを測るときだけ使う）
export const PROFILES = {
    easy: { overlook: 0.35, noise: 0.6, skipBuild: 0.25, engineWeight: 0.5, plan: false },
    normal: { overlook: 0.12, noise: 0.25, skipBuild: 0.05, engineWeight: 1, plan: true },
    strong: { overlook: 0, noise: 0.05, skipBuild: 0, engineWeight: 1.2, plan: true }
};
export const CPU_LEVELS = ['easy', 'normal'];
export const CPU_LEVEL_NAMES = { easy: 'やさしい', normal: 'ふつう' };

export const isCpuTurn = (game) => game.phase !== 'end' && game.players[game.current].isCPU;

// 判断用の乱数。ゲームの状態（シード・手数・席）だけから決まるので、同じ場面では同じ手になる
function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

const profileOf = (game, seat) => PROFILES[game.players[seat].cpuLevel ?? 'normal'] ?? PROFILES.normal;

// 手番の CPU の操作を1つ決める
export function chooseCpuCommand(game, seat = game.current, profile = profileOf(game, seat)) {
    const view = createGameView(game, seat);
    return decide(view, seat, cpuRandom(game, seat), profile);
}

// CPU に1手打たせる。決めた手が断られたら、通る手を順に試す（必ず前に進める）
export function runCpuStep(game, seat = game.current, profile) {
    if (game.phase === 'end' || seat !== game.current) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    return simpleCommands(game, seat).some(c => game.applyCommand(seat, c));
}

// 今の場面で試せる手の一覧（通るとは限らない）。CPU の手が通らないときと、テストのランダムな試合に使う
export function simpleCommands(game, seat) {
    const commands = [];
    if (game.phase === 'research') {
        game.research.cards.forEach(card => commands.push({ type: 'researchBuild', card }));
        game.research.cards.forEach(card => commands.push({ type: 'researchFile', card }));
        commands.push({ type: 'researchSkip' });
    }
    if (game.phase === 'chain') {
        game.usablePending().forEach(({ gizmo }) => {
            const kind = CARDS[gizmo].effect.kind;
            if (kind === 'pick') game.row.forEach((c, slot) => { if (c) commands.push({ type: 'use', gizmo, slot }); });
            else if (kind === 'file') game.displayCards().forEach(card => commands.push({ type: 'use', gizmo, card }));
            else if (kind === 'research') LEVELS.forEach(level => commands.push({ type: 'use', gizmo, level }));
            else if (kind === 'freeBuild') game.freeBuildTargets(seat).forEach(card => commands.push({ type: 'use', gizmo, card }));
            else commands.push({ type: 'use', gizmo });
        });
        commands.push({ type: 'stop' });
    }
    if (game.phase === 'action') {
        game.buildOptions(seat).forEach(({ card }) => commands.push({ type: 'build', card }));
        game.row.forEach((c, slot) => { if (c) commands.push({ type: 'pick', slot }); });
        game.displayCards().forEach(card => commands.push({ type: 'file', card }));
        LEVELS.forEach(level => commands.push({ type: 'research', level }));
        commands.push({ type: 'pass' });
    }
    return commands;
}

// ---- 判断 ----

function decide(view, seat, random, profile) {
    const me = view.players[seat];
    const ctx = makeContext(view, me, profile);
    if (view.phase === 'research') return decideResearch(view, me, ctx, random, profile);
    if (view.phase === 'chain') return decideChain(view, me, ctx, random, profile);
    return decideAction(view, me, ctx, random, profile);
}

// 何度も使う値をまとめる
function makeContext(view, me, profile) {
    const limits = me.limits;
    const progress = Math.min(1, me.built.length / END_GIZMOS);
    // 終わりが近いほど、これから働く見込みの価値は下がる
    const others = view.players.filter(p => p.id !== me.id);
    const leaderGizmos = Math.max(...view.players.map(p => p.built.length));
    const leaderL3 = Math.max(...view.players.map(p => p.level3));
    const remaining = Math.max(0.15, 1 - Math.max(leaderGizmos / END_GIZMOS, leaderL3 / 4) * 1.05);
    return { limits, progress, remaining, others, energy: countEnergy(me.energy), profile };
}

// ギズモの価値：点＋（これから働く見込み × 残りの長さ）
function cardValue(view, me, id, ctx) {
    const card = CARDS[id];
    let value = card.points ?? 0;
    const w = ctx.profile.engineWeight * ctx.remaining;
    if (card.upgrade) {
        const up = card.upgrade;
        if (up.score === 'energy') value = ctx.limits.storage * 0.7;
        if (up.score === 'tokens') value = me.vp + 4 * ctx.remaining;
        if (up.storage) value += up.storage * 0.9 * w;
        if (up.archive) value += up.archive * 0.7 * w;
        if (up.research) value += up.research * 0.4 * w;
        if (up.discount) value += 2.2 * w;
        if (up.block === 'research') value -= 0.3;
        if (up.block === 'file') value -= me.built.some(g => CARDS[g].trigger?.action === 'file' || CARDS[g].trigger?.fromArchive) ? 3 : 0.5;
    }
    if (card.convert) {
        // 持っている色・よく取る色に効く変換ほど高い
        value += card.convert.length * 1.3 * w;
    }
    if (card.trigger) {
        const per = { draw: 1.1, pick: 1.4, vp: 1.0, file: 0.9, research: 1.0, freeBuild: 2.2 }[card.effect.kind] ?? 1;
        const amount = card.effect.amount ?? 1;
        // 1巡に働く回数の見込み
        let chance = 0.6;
        const t = card.trigger;
        if (t.action === 'pick') chance = t.colors.length * 0.35;
        if (t.action === 'build' && t.colors) chance = t.colors.length * 0.3;
        if (t.fromArchive) chance = 0.35;
        if (t.level) chance = 0.3;
        if (t.action === 'file') chance = isBlocked(me, 'file') ? 0 : 0.35;
        value += per * amount * chance * 6 * w;
    }
    return value;
}

// ギズモを建てるのに、あと何個足りないか（変換を考えない大まかな数）
function shortage(me, id, source) {
    const card = CARDS[id];
    const need = costFor(me, card, source);
    if (card.color === 'any') return Math.max(0, need - countEnergy(me.energy));
    return Math.max(0, need - me.energy[card.color]);
}

function decideAction(view, me, ctx, random, profile) {
    const used = view.used;
    const options = [
        ...LEVELS.flatMap(level => view.display[level]).filter(id => id !== null).map(id => ({ id, source: 'display' })),
        ...me.archive.map(id => ({ id, source: 'archive' }))
    ].filter(opt => opt.source === 'archive' || random() >= profile.overlook);

    const scored = options.map(opt => {
        const value = cardValue(view, me, opt.id, ctx) * (1 + (random() * 2 - 1) * profile.noise);
        const pay = paymentFor(me, opt.id, opt.source, used);
        return { ...opt, value, pay, short: shortage(me, opt.id, opt.source) };
    });

    // 建てる：建てられるうち一番良いもの
    const buildable = scored.filter(s => s.pay).sort((a, b) => b.value - a.value);
    const targets = scored.filter(s => !s.pay).sort((a, b) => (b.value / (b.short + 1.5)) - (a.value / (a.short + 1.5)));
    const target = targets[0] ?? null;
    if (buildable.length > 0) {
        const best = buildable[0];
        const full = ctx.energy >= ctx.limits.storage;
        const worth = !target || best.value >= (target.value / (target.short + 1)) * 0.6;
        // 見送り：建てられるのに、今回は見送ることがある（エネルギーが上限なら必ず建てる）
        if (full || (worth && random() >= profile.skipBuild)) return { type: 'build', card: best.id, spend: best.pay.spend };
    }

    const roomEnergy = ctx.energy < ctx.limits.storage;
    const canFile = !me.blocked.file && me.archive.length < ctx.limits.archive;

    // 保管：ねらうギズモが場にあり、すぐには建てられないなら押さえる（保管で働くギズモがあれば積極的に）
    const fileTriggers = me.built.filter(id => triggerMatches(CARDS[id], { action: 'file' })).length;
    if (canFile && target && target.source === 'display') {
        const valuable = target.value >= 3 && target.short >= 2;
        if (valuable || (fileTriggers >= 2 && random() < 0.6) || !roomEnergy) return { type: 'file', card: target.id };
    }

    // 取る：ねらうギズモに足りない色。取ったら働くギズモの色も少し好む
    if (roomEnergy && view.row.some(c => c !== null)) {
        const weight = Object.fromEntries(COLORS.map(c => [c, random() * 0.2]));
        targets.slice(0, 3).forEach((t, rank) => {
            const card = CARDS[t.id];
            const factor = rank === 0 ? 3 : 1 / (rank + 1);
            if (card.color === 'any') COLORS.forEach(c => { weight[c] += factor * 0.4; });
            else weight[card.color] += factor;
        });
        me.built.forEach(id => {
            const t = CARDS[id].trigger;
            if (t?.action === 'pick' && !view.used.includes(id)) t.colors.forEach(c => { weight[c] += 1.5; });
        });
        let bestSlot = -1;
        view.row.forEach((c, slot) => {
            if (c && (bestSlot < 0 || weight[c] > weight[view.row[bestSlot]])) bestSlot = slot;
        });
        if (bestSlot >= 0) return { type: 'pick', slot: bestSlot };
    }

    if (buildable.length > 0) return { type: 'build', card: buildable[0].id, spend: buildable[0].pay.spend };
    if (canFile && target && target.source === 'display') return { type: 'file', card: target.id };
    if (!me.blocked.research) {
        const level = [2, 1, 3].find(l => view.deckCounts[l] > 0);
        if (level) return { type: 'research', level };
    }
    const anyCard = LEVELS.flatMap(l => view.display[l]).find(id => id !== null);
    if (canFile && anyCard !== undefined) return { type: 'file', card: anyCard };
    return { type: 'pass' };
}

function decideResearch(view, me, ctx, random, profile) {
    const cards = view.research.cards ?? [];
    const scored = cards.map(id => ({
        id, value: cardValue(view, me, id, ctx) * (1 + (random() * 2 - 1) * profile.noise),
        pay: paymentFor(me, id, 'research', view.used)
    }));
    const buildable = scored.filter(s => s.pay).sort((a, b) => b.value - a.value);
    if (buildable.length > 0 && buildable[0].value > 0.5) return { type: 'researchBuild', card: buildable[0].id, spend: buildable[0].pay.spend };
    const canFile = !me.blocked.file && me.archive.length < ctx.limits.archive;
    const best = [...scored].sort((a, b) => b.value - a.value)[0];
    if (canFile && best && best.value >= 2.5) return { type: 'researchFile', card: best.id };
    return { type: 'researchSkip' };
}

function decideChain(view, me, ctx, random, profile) {
    // 選ぶ必要のないものから使う。次に、取る・保管・建てる・研究
    const order = ['vp', 'draw', 'freeBuild', 'pick', 'file', 'research'];
    const pending = [...view.pending].sort((a, b) => order.indexOf(CARDS[a.gizmo].effect.kind) - order.indexOf(CARDS[b.gizmo].effect.kind));
    for (const entry of pending) {
        const kind = CARDS[entry.gizmo].effect.kind;
        if (kind === 'vp' || kind === 'draw') return { type: 'use', gizmo: entry.gizmo };
        if (kind === 'freeBuild') {
            const options = [...LEVELS.flatMap(l => view.display[l]), ...me.archive].filter(id => id !== null && CARDS[id].level === 1);
            const best = options.sort((a, b) => cardValue(view, me, b, ctx) - cardValue(view, me, a, ctx))[0];
            if (best !== undefined) return { type: 'use', gizmo: entry.gizmo, card: best };
        }
        if (kind === 'pick') {
            const slot = choosePickSlot(view, me, ctx, random);
            if (slot >= 0) return { type: 'use', gizmo: entry.gizmo, slot };
        }
        if (kind === 'file') {
            const options = LEVELS.flatMap(l => view.display[l]).filter(id => id !== null);
            const best = options.sort((a, b) => cardValue(view, me, b, ctx) - cardValue(view, me, a, ctx))[0];
            if (best !== undefined) return { type: 'use', gizmo: entry.gizmo, card: best };
        }
        if (kind === 'research') {
            const level = [3, 2, 1].find(l => view.deckCounts[l] > 0);
            if (level) return { type: 'use', gizmo: entry.gizmo, level };
        }
    }
    return { type: 'stop' };
}

// 取る色：場と保管庫で一番ねらいたいギズモの色
function choosePickSlot(view, me, ctx, random) {
    const weight = Object.fromEntries(COLORS.map(c => [c, random() * 0.2]));
    [...LEVELS.flatMap(l => view.display[l]).filter(id => id !== null), ...me.archive].forEach(id => {
        const card = CARDS[id];
        const v = cardValue(view, me, id, ctx) / (card.cost + 1);
        if (card.color === 'any') COLORS.forEach(c => { weight[c] += v * 0.3; });
        else weight[card.color] += v;
    });
    me.built.forEach(id => {
        const t = CARDS[id].trigger;
        if (t?.action === 'pick' && !view.used.includes(id)) t.colors.forEach(c => { weight[c] += 1; });
    });
    let best = -1;
    for (let slot = 0; slot < ROW_SIZE; slot++) {
        const c = view.row[slot];
        if (c && (best < 0 || weight[c] > weight[view.row[best]])) best = slot;
    }
    return best;
}

export { convertersOf };

// ヒント：人の手番の行動（取る・保管・建てる・研究）に、CPU（見落としのない設定）が選ぶ手を返す。その席から見える情報だけで決める
// 状態は変えず、ゲームの乱数も使わないので、記録の再現に影響しない
export function suggest(game, seat) {
    if (game.phase !== 'action' || game.current !== seat) return null;
    return chooseCpuCommand(game, seat, PROFILES.strong);
}
