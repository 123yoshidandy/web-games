/**
 * CPU の判断（DOM に依存しない）。見るのは自分のビューだけ（山札の並びはのぞかない）
 *
 * 紙の良さを点数にし（evaluate）、組み合わせ・番号・家・効果のうち、点数が一番上がるものを選ぶ
 * - 今の得点（公園・プール・完成した家並み・ビスと断りの減点）と、派遣の人数
 * - 家並みの見込み：フェンスで区切った6軒以下の区画は、建った家の割合に応じて、家並みの値の一部を足す
 * - 埋まらない家：両隣の番号の間に、書ける番号が足りない空き家を減点する（出やすい番号ほど埋まりやすいと見る）
 * - 都市計画：そろえられるなら、すぐ達成する。そろいかけの計画にも少し加点する
 * 先に効果なしで全部の置き方を比べ、上位の置き方だけ、効果の使い方まで比べる
 *
 * 強さ：ふつう（normal）とやさしい（easy）。やさしいは、そろいかけの計画と派遣を軽く見て、候補の点数に大きなゆらぎを足す
 * CPU の判断にはゲームの乱数を使わない（記録の再現がずれるため）。状態から作った別の乱数を使う
 */

import { createRandom } from './random.js';
import { CARDS, STREET_SIZES, STREETS, MAX_NUMBER, MAX_ESTATE, ESTATE_VALUES, PLANS } from './cards.js';
import {
    cloneSheet, writableHouses, bisSpots, fenceSpots, canRaiseEstate, canAddPark, isPoolSpot, segments,
    planEstates, writeHouse, sheetScore, builtCount
} from './sheet.js';
import Game, { CHOICE_EFFECTS } from './game.js';
import { createGameView } from './game-view.js';

export const LEVELS = {
    // dead：埋まらない家の減点、soft：埋まりにくい家の減点、estate：家並みの見込みの重み、plan：そろいかけの計画の重み
    // noise：候補の点数に足すゆらぎ、choices：上位いくつから選ぶか、deep：効果の使い方まで比べる候補の数
    normal: { dead: 2.2, soft: 0.7, estate: 0.8, plan: 0.5, temp: 1.1, noise: 0.3, choices: 1, deep: 8 },
    easy: { dead: 2.2, soft: 0.7, estate: 0.6, plan: 0, temp: 0.6, noise: 3, choices: 1, deep: 3 }
};

// 番号ごとの、出やすさ（カードの枚数。0・16・17 は派遣でしか書けない）
const FREQ = Array.from({ length: MAX_NUMBER + 1 }, (_, v) => CARDS.filter(c => c.n === v).length || 1);
const capacity = (a, b) => {
    let sum = 0;
    for (let v = a + 1; v < b; v++) sum += FREQ[v];
    return sum;
};

// 盤の良さ。ctx：{ conf, progress（0〜1）, plans（まだ達成していない計画）, solo }
export function evaluate(sheet, ctx) {
    const { conf } = ctx;
    const s = sheetScore(sheet);
    let value = s.parks + s.pools + s.estates - s.bis - s.refusals;
    value -= sheet.refusals * 3;                                 // 断りは、ゲームを早く終わらせる危うさもある
    value += sheet.parks.reduce((a, c) => a + c, 0) * 0.6;       // 公園・プールは、後ほど点が伸びる
    value += sheet.pools.flat().filter(Boolean).length * 0.8;
    value += ctx.solo
        ? Math.min(sheet.temps, 6) * conf.temp
        : Math.min(sheet.temps, 7) * conf.temp * 0.8;
    value += sheet.estates.reduce((a, c) => a + c, 0) * 0.3;

    // 空き家の並び：両隣の番号の間に、書ける番号が足りるか
    const alive = STREET_SIZES.map(n => Array(n).fill(true));
    for (let st = 0; st < STREETS; st++) {
        const row = sheet.houses[st];
        let h = 0;
        while (h < row.length) {
            if (row[h]) { h++; continue; }
            const start = h;
            while (h < row.length && !row[h]) h++;
            const k = h - start;
            const a = start > 0 ? row[start - 1].n : -1;
            const b = h < row.length ? row[h].n : MAX_NUMBER + 1;
            const room = b - a - 1;
            const dead = Math.max(0, k - room);
            value -= dead * conf.dead;
            if (room <= 0) for (let i = start; i < h; i++) alive[st][i] = false;
            value -= Math.max(0, k - capacity(a, b) / 6) * conf.soft;
        }
    }

    // 家並みの見込み
    const needs = new Map();   // まだ達成していない計画に要る大きさ
    ctx.plans.forEach(p => p.sizes.forEach(z => needs.set(z, (needs.get(z) ?? 0) + p.points[0] / p.sizes.length)));
    segments(sheet).forEach(seg => {
        if (seg.built === seg.size) return;
        if (seg.size > MAX_ESTATE) {
            value += seg.built * 0.15;
            return;
        }
        let ok = true;
        for (let i = seg.start; i < seg.start + seg.size; i++) if (!sheet.houses[seg.street][i] && !alive[seg.street][i]) ok = false;
        if (!ok) return;
        const f = seg.built / seg.size;
        const v = ESTATE_VALUES[seg.size - 1][Math.min(sheet.estates[seg.size - 1], ESTATE_VALUES[seg.size - 1].length - 1)];
        value += (v + (needs.get(seg.size) ?? 0) * conf.plan) * Math.pow(f, 1.5) * conf.estate * (1 - ctx.progress * 0.4);
    });

    // 都市計画：そろえば達成できる（点を足す）。そろいかけなら少し
    ctx.plans.forEach(p => {
        if (planEstates(sheet, p)) value += p.points[p.claimed ? 1 : 0];
    });
    return value;
}

// 建てたあとの紙（公園・プール・派遣は自動）
function afterBuild(sheet, combo, street, house, value) {
    const next = cloneSheet(sheet);
    writeHouse(next, street, house, value);
    if (combo.e === 'temp') next.temps++;
    if (combo.e === 'pool' && isPoolSpot(street, house)) next.pools[street][house] = true;
    if (combo.e === 'park' && canAddPark(next, street)) next.parks[street]++;
    return next;
}

// 選んで使う効果の候補：{ command, sheet }
function effectOptions(sheet, kind) {
    const list = [];
    if (kind === 'surveyor') {
        fenceSpots(sheet).forEach(({ street, pos }) => {
            const next = cloneSheet(sheet);
            next.fences[street][pos] = true;
            list.push({ command: { type: 'effect', street, pos }, sheet: next });
        });
    } else if (kind === 'estate') {
        for (let size = 1; size <= MAX_ESTATE; size++) {
            if (!canRaiseEstate(sheet, size)) continue;
            const next = cloneSheet(sheet);
            next.estates[size - 1]++;
            list.push({ command: { type: 'effect', size }, sheet: next });
        }
    } else if (kind === 'bis') {
        bisSpots(sheet).forEach(({ street, house, n }) => {
            const next = cloneSheet(sheet);
            writeHouse(next, street, house, n, { bis: true });
            next.bis++;
            list.push({ command: { type: 'effect', street, pos: house, value: n }, sheet: next });
        });
    }
    return list;
}

function contextOf(view, me, conf) {
    const plans = view.plans
        .map((p, k) => ({ ...p, k }))
        .filter(p => !me.plans[p.k] && !me.turn.plans.includes(p.k));
    return { conf, plans, solo: view.solo, progress: Math.min(1, builtCount(me.sheet) / 30) };
}

// rand を渡さないときの迷い。見えている局面から作るので、同じ局面なら同じ手を選ぶ
function viewRandom(view) {
    const s = JSON.stringify(view);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return createRandom(h >>> 0);
}

// ビューから、次の操作を1つ決める（手を終えていれば null）
export function chooseCommand(view, level = 'normal', random = viewRandom(view)) {
    if (view.phase === 'end' || !view.actors.includes(view.you)) return null;
    const conf = LEVELS[level] ?? LEVELS.normal;
    const me = view.players[view.you];
    const t = me.turn;
    const ctx = contextOf(view, me, conf);

    if (!t.built && !t.refused) {
        if (me.mustRefuse) return { type: 'refuse' };
        const candidates = [];
        view.combos.forEach(combo => {
            Game.values(combo).forEach(value => {
                writableHouses(me.sheet, value).forEach(({ street, house }) => {
                    const sheet = afterBuild(me.sheet, combo, street, house, value);
                    candidates.push({
                        command: { type: 'build', num: combo.num, eff: combo.eff, value, street, house },
                        combo, sheet, value: evaluate(sheet, ctx) + random() * conf.noise
                    });
                });
            });
        });
        candidates.sort((a, b) => b.value - a.value);
        // 上位の置き方は、効果の使い方まで比べる
        candidates.slice(0, conf.deep).forEach(c => {
            if (!CHOICE_EFFECTS.includes(c.combo.e)) return;
            effectOptions(c.sheet, c.combo.e).forEach(o => {
                c.value = Math.max(c.value, evaluate(o.sheet, ctx) + random() * conf.noise);
            });
        });
        candidates.sort((a, b) => b.value - a.value);
        const top = candidates.slice(0, Math.max(1, conf.choices));
        return top[Math.floor(random() * top.length)].command;
    }

    // 効果
    if (t.built && CHOICE_EFFECTS.includes(t.built.effect) && !t.effectUsed) {
        const base = evaluate(me.sheet, ctx);
        let best = null;
        effectOptions(me.sheet, t.built.effect).forEach(o => {
            const v = evaluate(o.sheet, ctx) + random() * conf.noise;
            if (!best || v > best.value) best = { ...o, value: v };
        });
        if (best && best.value > base + 0.2) return best.command;
    }

    // 都市計画：そろっていれば達成する
    for (const p of ctx.plans) {
        if (planEstates(me.sheet, PLANS[p.id])) return { type: 'plan', plan: p.k, reshuffle: false };
    }
    return { type: 'end' };
}

// ---- ゲームを進める ----

// 操作を待っている CPU（いなければ undefined）
export function cpuActor(game) {
    return game.actors().find(seat => game.players[seat].isCPU);
}

export function isCpuTurn(game) {
    return cpuActor(game) !== undefined;
}

// CPU に1手打たせる。決めた手が通らなければ、断りか手を終えるで進める。進めたら true
export function runCpuStep(game, level = game.options.level, seat = cpuActor(game)) {
    if (seat === undefined) return false;
    const view = createGameView(game, seat, { events: false, since: Infinity, scores: false });
    const random = createRandom((game.options.seed ^ Math.imul(game.commands.length + 1, 0x9E3779B1) ^ seat) >>> 0);
    const command = chooseCommand(view, level, random);
    if (command && game.applyCommand(seat, command)) return true;
    if (game.applyCommand(seat, { type: 'end' }) || game.applyCommand(seat, { type: 'refuse' })) return true;
    // まだ建てていなければ、書ける最初の場所に建てる
    for (const combo of game.combos()) {
        for (const value of Game.values(combo)) {
            const spot = writableHouses(game.players[seat].sheet, value)[0];
            if (spot && game.applyCommand(seat, { type: 'build', num: combo.num, eff: combo.eff, value, ...spot })) return true;
        }
    }
    return false;
}

