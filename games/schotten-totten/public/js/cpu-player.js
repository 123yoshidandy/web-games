/**
 * CPU の手を決める（DOM に依存しない）
 * - 見るのは、その席のビューだけ（相手の手札・山札の並びはのぞかない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - 境界石ごとに、勝てる見込み（0〜1）を見積もる
 *   今すぐ主張できる石は1、相手が主張できる石は0。それ以外は、自分と相手が作れそうな組の強さの差から出す
 *   自分：手札だけで作れる組と、まだ出ていないカードまで使える組（足りない枚数ごとに割り引く）の強い方
 *   相手：まだ出ていないカード（相手の手札を含む）で作れる組を、足りない枚数ごとに割り引く
 * - 見込みの合計と、隣り合う3つを取れる見込みがいちばん増える手を選ぶ。戦術カードは、使うことの損を少し引いて同じように比べる
 * - 主張できる石は、すべて主張する
 * - easy（やさしい）・normal（ふつう）は、評価に揺れがあり、ときどき2番目以下の手を選ぶ（強すぎないように）
 */

import { isClan, isTactic, isJoker, wildChoices, wildKind, WILDS, MODES, STONES } from './game.js';
import { createGameView } from './game-view.js';
import { bestFormation, kindOf, COLORS, VALUES, colorOf, valueOf } from './formation.js';
import { createRandom } from './random.js';

export const PROFILES = {
    easy: { noise: 0.4, mistake: 0.4 },
    normal: { noise: 0.06, mistake: 0.08 },
    strong: { noise: 0, mistake: 0 },   // 揺れのない比較用
    random: { random: true }            // 通る手からでたらめに選ぶ（強さを測る比較用）
};
export const LEVELS = ['easy', 'normal'];
export const LEVEL_NAMES = { easy: 'やさしい', normal: 'ふつう' };

// まだ出ていないカードを当てにする組は、足りない1枚ごとにこれだけ割り引く
// 大きくしすぎると、空いた石に1枚置くだけで見込みが上がり、組をそろえる手より好まれてしまう
const UNCERTAIN = 2.5;
const PENDING = 1.5;        // 手札で埋められる組も、まだ出していない1枚ごとに少し割り引く（ほかの石に使うかもしれない・先にそろえた方が有利）
const SPREAD = 5;        // 見込みの差を勝てる見込みにするときの幅
const TACTIC_COST = 0.12;  // 戦術カードを使う損（相手も戦術カードを出せるようになる。とっておけなくなる）
const ADJACENT_WEIGHT = 1.5;

const sigmoid = (x) => 1 / (1 + Math.exp(-x));
const score = (strength) => (strength < 0 ? 0 : kindOf(strength) * 10 + (strength % 1000) / 3);

export const isCpuTurn = (game) => {
    const actor = game.actor();
    return actor !== null && game.players[actor].isCPU;
};

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// ---- 見込み ----

// ビューから、見積もりに使う形を作る
export function readModel(view, seat) {
    const seen = new Set();
    view.stones.forEach(stone => stone.sides.forEach(side => side.forEach(x => seen.add(x.card))));
    view.discards.forEach(card => seen.add(card));
    const hand = view.players[seat].hand;
    const tableClan = new Set();
    for (let id = 0; id < COLORS * VALUES; id++) if (!seen.has(id)) tableClan.add(id);
    const unseen = new Set([...tableClan].filter(id => !hand.includes(id)));
    const opp = view.players[1 - seat];
    const wildsOut = (exclude) => {
        if (!view.tactics) return [];
        const list = [];
        const jokers = ['joker1', 'joker2'].filter(j => !seen.has(j) && !exclude.includes(j));
        if (jokers.length && !opp.jokerPlayed) list.push('joker');
        ['spy', 'shield'].forEach(w => { if (!seen.has(w) && !exclude.includes(w)) list.push(w); });
        return list;
    };
    const me = view.players[seat];
    const usable = (card) => !isTactic(card) || (view.tactics && me.tacticsPlayed <= opp.tacticsPlayed && !(isJoker(card) && me.jokerPlayed));
    return {
        seat,
        stones: view.stones.map(s => ({ sides: s.sides.map(side => side.map(x => ({ ...x }))), modes: [...s.modes], completed: [...s.completed], owner: s.owner })),
        hand: [...hand],
        handPool: { clan: new Set(hand.filter(isClan)), wilds: hand.filter(c => WILDS.includes(c) && usable(c)).map(wildKind) },
        allPool: { clan: new Set([...unseen, ...hand.filter(isClan)]), wilds: [...hand.filter(c => WILDS.includes(c) && usable(c)).map(wildKind), ...wildsOut([])] },
        oppPool: { clan: unseen, wilds: wildsOut(hand) },
        tablePool: { clan: tableClan, wilds: wildsOut([]) },
        oppOut: opp.handCount === 0 && view.deckCount === 0 && view.tacticDeckCount === 0
    };
}

const sizeOf = (stone) => (stone.modes.includes('mud') ? 4 : 3);

// 主張できるか（ゲームの claimCheck と同じ判定を、モデルの上で行う）
function claimable(model, stone, seat) {
    if (stone.owner !== null) return false;
    const size = sizeOf(stone);
    const blind = stone.modes.includes('blind');
    const mine = stone.sides[seat];
    const theirs = stone.sides[1 - seat];
    if (mine.length < size) return false;
    const my = bestFormation(mine, size, undefined, blind);
    if (theirs.length >= size) {
        const their = bestFormation(theirs, size, undefined, blind);
        return my > their || (my === their && (stone.completed[seat] ?? Infinity) < (stone.completed[1 - seat] ?? Infinity));
    }
    const pool = seat === model.seat && model.oppOut ? { clan: new Set(), wilds: [] } : model.tablePool;
    return bestFormation(theirs, size, pool, blind) <= my;
}

// 1つの石を自分が取る見込み
export function stoneChance(model, stone) {
    const seat = model.seat;
    if (stone.owner !== null) return stone.owner === seat ? 1 : 0;
    if (claimable(model, stone, seat)) return 1;
    if (claimable(model, stone, 1 - seat)) return 0;
    const size = sizeOf(stone);
    const blind = stone.modes.includes('blind');
    const estimate = (side, sure, open) => {
        const need = size - side.length;
        if (need === 0) return score(bestFormation(side, size, undefined, blind));
        const certain = sure ? score(bestFormation(side, size, sure, blind)) - PENDING * need : 0;
        return Math.max(certain, score(bestFormation(side, size, open, blind)) - UNCERTAIN * need);
    };
    const mine = estimate(stone.sides[seat], model.handPool, model.allPool);
    const theirs = estimate(stone.sides[1 - seat], null, model.oppPool);
    return sigmoid((mine - theirs) / SPREAD);
}

// 盤面全体の良さ：見込みの合計と、隣り合う3つを取れる見込み
export function evaluate(model, chances = model.stones.map(s => stoneChance(model, s))) {
    let adjacent = 0;
    for (let i = 0; i + 3 <= STONES; i++) adjacent = Math.max(adjacent, chances[i] * chances[i + 1] * chances[i + 2]);
    return chances.reduce((s, p) => s + p, 0) + ADJACENT_WEIGHT * adjacent;
}

// ---- 手の候補 ----

// 石を書き換えたときの良さ（書き換えた石だけ見積もり直す）
function scoreWith(model, base, changes) {
    const chances = [...base];
    const saved = new Map();
    changes.forEach(({ index, apply }) => {
        if (!saved.has(index)) saved.set(index, model.stones[index]);
        const copy = structuredClone(model.stones[index]);
        apply(copy);
        model.stones[index] = copy;
    });
    saved.forEach((_, index) => { chances[index] = stoneChance(model, model.stones[index]); });
    saved.forEach((stone, index) => { model.stones[index] = stone; });
    return evaluate(model, chances);
}

export function candidateActions(view, seat) {
    const model = readModel(view, seat);
    const base = model.stones.map(s => stoneChance(model, s));
    const before = evaluate(model, base);
    const me = view.players[seat];
    const opp = view.players[1 - seat];
    const open = model.stones.map((s, i) => i).filter(i => model.stones[i].owner === null);
    const placeable = open.filter(i => model.stones[i].sides[seat].length < sizeOf(model.stones[i]));
    const canTactic = (card) => view.tactics && me.tacticsPlayed <= opp.tacticsPlayed && !(isJoker(card) && me.jokerPlayed);
    const list = [];
    const add = (command, changes, cost = 0) => list.push({ command, score: scoreWith(model, base, changes) - before - cost });
    const place = (index, entry) => ({ index, apply: (stone) => stone.sides[seat].push(entry) });
    const clanRefs = (owner) => open.flatMap(stone => model.stones[stone].sides[owner].map((x, index) => (isClan(x.card) ? { stone, index } : null)).filter(Boolean));

    new Set(model.hand).forEach(card => {
        if (isClan(card)) {
            placeable.forEach(stone => add({ type: 'play', card, stone }, [place(stone, { card, c: colorOf(card), v: valueOf(card) })]));
            return;
        }
        if (!canTactic(card)) return;
        if (WILDS.includes(card)) {
            placeable.forEach(stone => {
                let best = null;
                wildChoices(card).forEach(as => {
                    const value = scoreWith(model, base, [place(stone, { card, ...as })]);
                    if (!best || value > best.value) best = { as, value };
                });
                list.push({ command: { type: 'play', card, stone, as: best.as }, score: best.value - before - TACTIC_COST });
            });
        } else if (MODES.includes(card)) {
            open.filter(i => !model.stones[i].modes.includes(card)).forEach(stone => add({ type: 'play', card, stone }, [{ index: stone, apply: s => s.modes.push(card) }], TACTIC_COST));
        } else if (card === 'banshee') {
            clanRefs(1 - seat).forEach(target => add({ type: 'play', card, target }, [{ index: target.stone, apply: s => s.sides[1 - seat].splice(target.index, 1) }], TACTIC_COST));
        } else if (card === 'traitor') {
            clanRefs(1 - seat).forEach(target => {
                const moved = model.stones[target.stone].sides[1 - seat][target.index];
                placeable.forEach(to => add({ type: 'play', card, target, to }, [
                    { index: target.stone, apply: s => s.sides[1 - seat].splice(target.index, 1) }, place(to, moved)
                ], TACTIC_COST));
            });
        } else if (card === 'strategist') {
            clanRefs(seat).forEach(from => {
                const moved = model.stones[from.stone].sides[seat][from.index];
                const remove = { index: from.stone, apply: s => s.sides[seat].splice(from.index, 1) };
                add({ type: 'play', card, from, to: null }, [remove], TACTIC_COST);
                placeable.filter(to => to !== from.stone).forEach(to => add({ type: 'play', card, from, to }, [remove, place(to, moved)], TACTIC_COST));
            });
        } else if (card === 'recruiter') {
            const total = Math.min(3, view.deckCount + view.tacticDeckCount);
            const clan = Math.min(total, view.deckCount);
            list.push({ command: { type: 'play', card, draws: [...Array(clan).fill('clan'), ...Array(total - clan).fill('tactic')] }, score: 0.02 - TACTIC_COST });
        }
    });
    if (!view.canPlaceClan) list.push({ command: { type: 'pass' }, score: 0 });
    return list;
}

// 新兵募集で戻す2枚：置いたときの良さがいちばん小さいもの
function chooseReturn(view, seat) {
    const model = readModel(view, seat);
    const base = model.stones.map(s => stoneChance(model, s));
    const before = evaluate(model, base);
    const placeable = model.stones.map((s, i) => i).filter(i => model.stones[i].owner === null && model.stones[i].sides[seat].length < sizeOf(model.stones[i]));
    const worth = (card) => {
        if (!isClan(card)) return 0.05; // 戦術カードは、とっておく値打ちが少しある
        let best = -Infinity;
        placeable.forEach(stone => {
            const value = scoreWith(model, base, [{ index: stone, apply: s => s.sides[seat].push({ card, c: colorOf(card), v: valueOf(card) }) }]) - before;
            best = Math.max(best, value);
        });
        return best;
    };
    const ranked = model.hand.map(card => ({ card, value: worth(card) })).sort((a, b) => a.value - b.value);
    return [ranked[0].card, ranked[1].card];
}

// 人の席のおすすめの手（ヒント）。CPU（ふつう）と同じ判断を、その席のビューだけで出す。画面に出すだけで、記録には入れない
export function suggest(game, seat) {
    if (game.isOver() || seat !== game.actor()) return null;
    return chooseCpuCommand(game, seat, PROFILES.normal);
}

export function chooseCpuCommand(game, seat = game.actor(), profile = PROFILES.normal) {
    const view = createGameView(game, seat, { since: game.logs.length, events: false });
    const random = cpuRandom(game, seat);
    if (view.phase === 'claim') {
        if (view.claimable.length > 0) return { type: 'claim', stone: view.claimable[0] };
        if (!view.tactics) return { type: 'end', draw: 'clan' };
        const wantTactic = view.tacticDeckCount > 0 && view.players[seat].tacticsInHand === 0 && random() < 0.4;
        return { type: 'end', draw: wantTactic || view.deckCount === 0 ? 'tactic' : 'clan' };
    }
    if (view.phase === 'recruit') return { type: 'return', cards: chooseReturn(view, seat) };
    const candidates = candidateActions(view, seat);
    if (candidates.length === 0) return { type: 'pass' };
    if (profile.random) return candidates[Math.floor(random() * candidates.length)].command;
    candidates.forEach(c => { c.score += (random() * 2 - 1) * profile.noise; });
    candidates.sort((a, b) => b.score - a.score);
    if (candidates.length > 1 && random() < profile.mistake) {
        return candidates[1 + Math.floor(random() * Math.min(3, candidates.length - 1))].command;
    }
    return candidates[0].command;
}

// CPU に1手打たせる。決めた手が断られたら、いちばん単純な手を順に試す（必ず前に進める）
export function runCpuStep(game, seat = game.actor(), profile = PROFILES.normal) {
    if (game.isOver() || seat === null || seat !== game.actor()) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    const hand = game.players[seat].hand;
    const fallbacks = [
        { type: 'end', draw: 'clan' },
        { type: 'end', draw: 'tactic' },
        { type: 'return', cards: hand.slice(0, 2) },
        ...hand.filter(isClan).flatMap(card => Array.from({ length: STONES }, (_, stone) => ({ type: 'play', card, stone }))),
        { type: 'pass' }
    ];
    return fallbacks.some(c => game.applyCommand(seat, c));
}
