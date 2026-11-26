/**
 * CPU の手を決める（DOM に依存しない）
 * - ゲームの乱数は使わない。判断の揺れには、シードと手数と席から作った別の乱数を使う（記録の再現がずれないように）
 * - ふつう・つよい：振り直しを期待値で選ぶ
 *   - 出目の組（順番を問わない5個）は252通り、残し方の組は462通り。残りの振り直しの回数ぶん、
 *     「残し方 → 振った結果の組と確率」の表を使って、各残し方の期待値を正確に計算する
 *   - 振り終えたときの値は、記入できる欄のうち一番よい欄の値。欄の値は
 *     「点数 − その欄を後に取っておいたときの平均の点数」に、上段ボーナスに近づく分（ボーナスを取れる見込みの差 × 35）を足したもの
 * - つよいは揺れなし。ふつうは欄の値に揺れを混ぜ、ボーナスの見込みを軽く見る
 * - やさしい：期待値を計算しない。一番多い目（ストレートが見えたら続いた目）を残し、点数が一番高い欄に書く。揺れが大きい
 */

import { CATEGORIES, UPPER, faceOf, pointsFor, legalCategories, countsOf } from './game.js';
import { createRandom } from './random.js';

// 欄を後に取っておいたときの平均の点数のめやす（よい戦い方での1欄あたりの平均に近い値）
export const BASELINE = {
    ones: 2.1, twos: 5.3, threes: 8.6, fours: 12.2, fives: 15.7, sixes: 19.2,
    threeKind: 21.7, fourKind: 13.1, fullHouse: 22.6, smallStraight: 29.5, largeStraight: 32.7, yahtzee: 16.9, chance: 22.0
};

export const PROFILES = {
    easy: { greedy: true, noise: 6 },
    normal: { bonusWeight: 0.5, noise: 4 },
    strong: { bonusWeight: 1.5, noise: 0 },
    random: { random: true } // でたらめに選ぶ（強さを測る比較用）
};

// 画面で選ぶ強さ
export const LEVELS = { easy: 'やさしい', normal: 'ふつう', strong: 'つよい' };

// 今操作が必要な CPU の席
export const cpuActors = (game) => game.actors().filter(seat => game.players[seat].isCPU);

function cpuRandom(game, seat) {
    let h = (game.options.seed ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ game.commands.length, 0x85EBCA6B) >>> 0;
    h = Math.imul(h ^ (seat + 1) * 0x27D4EB2F, 0xC2B2AE35) >>> 0;
    return createRandom(h);
}

// ゲームから、その席の判断に要る情報だけを取り出す
export function stateOf(game, seat) {
    const player = game.players[seat];
    return {
        scores: { ...player.scores },
        dice: [...game.dice],
        rollsLeft: game.rollsLeft,
        rolled: game.hasRolled()
    };
}

export function chooseCpuCommand(game, seat, profile = PROFILES.normal) {
    return decide(stateOf(game, seat), cpuRandom(game, seat), profile);
}

// ヒント：seat のおすすめの手（CPU の「ふつう」が選ぶ手）。seat の番でなければ null
export function suggest(game, seat) {
    if (game.phase === 'end' || !game.actors().includes(seat)) return null;
    return chooseCpuCommand(game, seat, PROFILES.normal);
}

// seat の CPU に1手打たせる。決めた手が断られたら、記入できる最初の欄に書く（必ず前に進む）
export function runCpuStep(game, seat, profile) {
    if (!game.actors().includes(seat)) return false;
    let command = null;
    try {
        command = chooseCpuCommand(game, seat, profile);
    } catch (error) {
        console.error(error);
    }
    if (command && game.applyCommand(seat, command)) return true;
    if (!game.hasRolled()) return game.applyCommand(seat, { type: 'roll', keep: [false, false, false, false, false] });
    return game.applyCommand(seat, { type: 'score', category: game.legal()[0] });
}

// ---- 出目の組の表 ----

// size 個のサイコロの、順番を問わない組をすべて作る（counts[1]〜counts[6]）
function multisets(size) {
    const list = [];
    const counts = [0, 0, 0, 0, 0, 0, 0];
    (function fill(face, left) {
        if (face === 6) {
            counts[6] = left;
            list.push([...counts]);
            return;
        }
        for (let n = left; n >= 0; n--) {
            counts[face] = n;
            fill(face + 1, left - n);
        }
    })(1, size);
    return list;
}

const keyOf = (counts) => counts.reduce((key, n, face) => (face === 0 ? 0 : key * 6 + n), 0);
const diceOf = (counts) => counts.flatMap((n, face) => Array(face === 0 ? 0 : n).fill(face));
const FACTORIAL = [1, 1, 2, 6, 24, 120];

let tables = null;

// HANDS：5個の組（252）、KEEPS：残す組（0〜5個、462）とその振った結果（手の番号と確率）、subKeeps：手ごとに選べる残し方
function getTables() {
    if (tables) return tables;
    const hands = multisets(5).map(counts => ({ counts, dice: diceOf(counts) }));
    const handIndex = new Map(hands.map((h, i) => [keyOf(h.counts), i]));
    const keeps = [];
    const keepIndex = new Map();
    for (let size = 0; size <= 5; size++) {
        multisets(size).forEach(counts => {
            keepIndex.set(keyOf(counts), keeps.length);
            keeps.push({ counts, size, outcomes: [] });
        });
    }
    keeps.forEach(keep => {
        const rolled = 5 - keep.size;
        multisets(rolled).forEach(roll => {
            const ways = FACTORIAL[rolled] / roll.slice(1).reduce((p, n) => p * FACTORIAL[n], 1);
            const hand = keep.counts.map((n, face) => n + roll[face]);
            keep.outcomes.push([handIndex.get(keyOf(hand)), ways / 6 ** rolled]);
        });
    });
    const subKeeps = hands.map(hand => {
        const list = [];
        const counts = [0, 0, 0, 0, 0, 0, 0];
        (function fill(face) {
            if (face === 7) {
                list.push(keepIndex.get(keyOf(counts)));
                return;
            }
            for (let n = 0; n <= hand.counts[face]; n++) {
                counts[face] = n;
                fill(face + 1);
            }
        })(1);
        return list;
    });
    tables = { hands, handIndex, keeps, subKeeps, full: hands.map(h => keepIndex.get(keyOf(h.counts))) };
    return tables;
}

// ---- 欄の値 ----

const sigmoid = (x) => 1 / (1 + Math.exp(-x));

// 上段ボーナスを取れる見込み（upper：上段の合計、openUpper：空いている上段の欄）
export function bonusChance(upper, openUpper) {
    if (upper >= 63) return 1;
    if (openUpper.length === 0) return 0;
    const par = openUpper.reduce((s, c) => s + 3 * faceOf(c), 0);
    const surplus = upper + par - 63;
    return sigmoid((surplus + 1) / (2 + 2.2 * Math.sqrt(openUpper.length)));
}

// 手（dice）で記入できる欄ごとの値を返す関数を作る
function makeValuer(scores, profile, random) {
    const upper = UPPER.reduce((s, c) => s + (scores[c] ?? 0), 0);
    const openUpper = UPPER.filter(c => scores[c] === null);
    const before = bonusChance(upper, openUpper);
    // 揺れは欄ごとに1回だけ決める（同じ手番の中で、判断がぶれないように）
    const jitter = Object.fromEntries(CATEGORIES.map(c => [c, profile.noise ? (random() * 2 - 1) * profile.noise : 0]));
    return (dice, category) => {
        const { points, bonus } = pointsFor(scores, dice, category);
        let value = points + bonus - BASELINE[category] + jitter[category];
        if (profile.bonusWeight && UPPER.includes(category)) {
            const after = bonusChance(upper + points, openUpper.filter(c => c !== category));
            value += profile.bonusWeight * 35 * (after - before);
        }
        return value;
    };
}

// 手ごとの一番よい欄と値
function bestCategory(scores, dice, valueOf) {
    let best = null;
    let bestValue = -Infinity;
    legalCategories(scores, dice).forEach(category => {
        const value = valueOf(dice, category);
        if (value > bestValue) {
            bestValue = value;
            best = category;
        }
    });
    return { category: best, value: bestValue };
}

// 残しの組を、実際のサイコロの位置の true/false にする
function keepFlags(dice, counts) {
    const left = [...counts];
    return dice.map(d => {
        if (left[d] > 0) {
            left[d]--;
            return true;
        }
        return false;
    });
}

// random を渡さないときの迷い。局面（得点表・ダイス・残りの振り直し）から作るので、同じ局面なら同じ手を選ぶ
function stateRandom(state) {
    const s = JSON.stringify(state);
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
    return createRandom(h >>> 0);
}

// 期待値で、振り直すなら残し方を、振らないなら記入する欄を選ぶ
export function planTurn(state, profile = PROFILES.strong, random = stateRandom(state)) {
    const { hands, handIndex, keeps, subKeeps, full } = getTables();
    const valueOf = makeValuer(state.scores, profile, random);
    const scoreNow = hands.map(h => bestCategory(state.scores, h.dice, valueOf));
    const here = handIndex.get(keyOf(countsOf(state.dice)));
    if (state.rollsLeft === 0) return { type: 'score', category: scoreNow[here].category };
    // values[h]：手 h から、残りの振り直しを最善に使ったときの値
    let values = scoreNow.map(s => s.value);
    let expected = null;
    for (let r = 1; r <= state.rollsLeft; r++) {
        const prev = values;
        expected = keeps.map(keep => keep.outcomes.reduce((s, [h, p]) => s + p * prev[h], 0));
        values = hands.map((_, h) => Math.max(...subKeeps[h].map(k => expected[k])));
    }
    let bestKeep = full[here];
    subKeeps[here].forEach(k => {
        if (expected[k] > expected[bestKeep] + 1e-9) bestKeep = k;
    });
    if (bestKeep === full[here]) return { type: 'score', category: scoreNow[here].category };
    return { type: 'roll', keep: keepFlags(state.dice, keeps[bestKeep].counts), expected: expected[bestKeep] };
}

// ---- やさしい ----

function greedyKeep(dice) {
    const counts = countsOf(dice);
    // 4つ以上続いた目があれば、ストレートを狙う
    for (const run of [[1, 2, 3, 4, 5], [2, 3, 4, 5, 6], [1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]]) {
        if (run.every(f => counts[f] > 0)) {
            if (run.length === 5) return null; // そろっている
            const want = [...run];
            return dice.map(d => {
                const i = want.indexOf(d);
                if (i < 0) return false;
                want.splice(i, 1);
                return true;
            });
        }
    }
    // 一番多い目（同じなら大きい目）を残す
    let face = 6;
    for (let f = 6; f >= 1; f--) if (counts[f] > counts[face]) face = f;
    if (counts[face] === 5) return null;
    return dice.map(d => d === face);
}

function greedyCategory(scores, dice, random, noise) {
    let best = null;
    let bestValue = -Infinity;
    legalCategories(scores, dice).forEach(category => {
        const { points, bonus } = pointsFor(scores, dice, category);
        // チャンスと小さい目は、点数が同じでも少しだけ後回しにする
        const value = points + bonus - (category === 'chance' ? 8 : 0) + (random() * 2 - 1) * noise;
        if (value > bestValue) {
            bestValue = value;
            best = category;
        }
    });
    return best;
}

// ---- 判断 ----

export function decide(state, random, profile = PROFILES.normal) {
    if (!state.rolled) return { type: 'roll', keep: [false, false, false, false, false] };
    if (profile.random) {
        if (state.rollsLeft > 0 && random() < 0.5) {
            const keep = state.dice.map(() => random() < 0.5);
            if (!keep.every(Boolean)) return { type: 'roll', keep };
        }
        const legal = legalCategories(state.scores, state.dice);
        return { type: 'score', category: legal[Math.floor(random() * legal.length)] };
    }
    if (profile.greedy) {
        const keep = state.rollsLeft > 0 ? greedyKeep(state.dice) : null;
        // 何も残さないとき（全部振り直す）も振ってよい
        if (keep && !keep.every(Boolean)) return { type: 'roll', keep };
        return { type: 'score', category: greedyCategory(state.scores, state.dice, random, profile.noise) };
    }
    const plan = planTurn(state, profile, random);
    return plan.type === 'roll' ? { type: 'roll', keep: plan.keep } : plan;
}
