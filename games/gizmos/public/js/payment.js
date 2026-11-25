/**
 * ギズモを建てるときの支払い（DOM に依存しない）
 *
 * 払うエネルギーは「色ごとの数」で考える。変換のギズモは、その数を書き換える手順として使う
 * - { from: 色, to: 'any' }：その色の1個を、好きな色の1個として扱う（from が null なら何色でも）
 * - { from: 色, to: 'double' }：その色の1個を、同じ色の2個として扱う
 * 変換は重ねて使える（黄→赤にしてから、赤を2個にする、など）。各ギズモは1巡に1回だけ使える
 * 払うのは、建てるギズモの色で「費用 − 割引」の数。何色でも払えるギズモ（'any'）は、色を問わず合計で数える
 */

import { CARDS, COLORS } from './cards.js';

export const emptyEnergy = () => ({ red: 0, yellow: 0, blue: 0, black: 0 });
export const countEnergy = (energy) => COLORS.reduce((sum, c) => sum + (energy[c] ?? 0), 0);

// 変換のギズモの一覧から、手順の一覧を作る（各手順に、どのギズモのものかを付ける）
export function converterSteps(gizmoIds) {
    return gizmoIds.flatMap(id => (CARDS[id].convert ?? []).map(step => ({ gizmo: id, ...step })));
}

const key = (counts) => COLORS.map(c => counts[c]).join(',');
const valueOf = (counts, color) => (color === 'any' ? countEnergy(counts) : counts[color]);

// spend（払うエネルギー）に steps を使って、color のエネルギーを need 個以上にできるか
export function canReach(spend, steps, color, need) {
    if (need <= 0) return true;
    if (valueOf(spend, color) >= need) return true;
    if (steps.length === 0) return false;
    const memo = new Set();
    const search = (counts, usedMask) => {
        if (valueOf(counts, color) >= need) return true;
        const memoKey = `${key(counts)}|${usedMask}`;
        if (memo.has(memoKey)) return false;
        memo.add(memoKey);
        for (let i = 0; i < steps.length; i++) {
            if (usedMask & (1 << i)) continue;
            const step = steps[i];
            const mask = usedMask | (1 << i);
            for (const from of step.from === null ? COLORS : [step.from]) {
                if (counts[from] <= 0) continue;
                if (step.to === 'double') {
                    if (search({ ...counts, [from]: counts[from] + 1 }, mask)) return true;
                    continue;
                }
                for (const to of COLORS) {
                    if (to === from) continue;
                    if (search({ ...counts, [from]: counts[from] - 1, [to]: counts[to] + 1 }, mask)) return true;
                }
            }
        }
        return false;
    };
    return search({ ...spend }, 0);
}

// 払えるときに使う変換のギズモ（できるだけ少なく）。使わずに払えるなら []。払えなければ null
export function convertersFor(spend, gizmoIds, color, need) {
    if (canReach(spend, [], color, need)) return [];
    const ids = [...new Set(gizmoIds)].filter(id => CARDS[id].convert);
    // 少ない組み合わせから順に試す（ギズモの数は多くても十数個）
    const subsets = [];
    for (let mask = 1; mask < (1 << ids.length); mask++) subsets.push(mask);
    subsets.sort((a, b) => bitCount(a) - bitCount(b) || a - b);
    for (const mask of subsets) {
        const chosen = ids.filter((_, i) => mask & (1 << i));
        if (canReach(spend, converterSteps(chosen), color, need)) return chosen;
    }
    return null;
}

const bitCount = (n) => {
    let count = 0;
    for (let v = n; v; v &= v - 1) count++;
    return count;
};

// 払うエネルギーとして正しいか：持っている数の範囲で、払える。1個でも減らすと払えない（余計に払わない）
// 正しければ使う変換のギズモの一覧、だめなら null
export function checkSpend(energy, spend, gizmoIds, color, need) {
    if (COLORS.some(c => spend[c] > energy[c])) return null;
    if (need <= 0) return countEnergy(spend) === 0 ? [] : null;
    const steps = converterSteps(gizmoIds);
    if (!canReach(spend, steps, color, need)) return null;
    for (const c of COLORS) {
        if (spend[c] > 0 && canReach({ ...spend, [c]: spend[c] - 1 }, steps, color, need)) return null;
    }
    return convertersFor(spend, gizmoIds, color, need);
}

// おまかせの支払い：払う個数が一番少ないもの。同じなら、建てる色をそのまま使うもの、多く持っている色を使うもの
// 払えなければ null。{ spend, converters }
export function autoSpend(energy, gizmoIds, color, need) {
    if (need <= 0) return { spend: emptyEnergy(), converters: [] };
    const steps = converterSteps(gizmoIds);
    const total = countEnergy(energy);
    for (let n = 1; n <= Math.min(need, total); n++) {
        let best = null;
        let bestScore = -Infinity;
        forEachSpend(energy, n, (spend) => {
            if (!canReach(spend, steps, color, need)) return;
            const direct = color === 'any' ? 0 : spend[color];
            // 多く持っている色から払う（残りの色を偏らせない）
            const spread = COLORS.reduce((sum, c) => sum + spend[c] * energy[c], 0);
            const score = direct * 100 + spread;
            if (score > bestScore) {
                bestScore = score;
                best = { ...spend };
            }
        });
        if (best) return { spend: best, converters: convertersFor(best, gizmoIds, color, need) };
    }
    return null;
}

// 払い方の候補（余計に払わないもの）を、払う数が少ない順・おまかせと同じ好みの順に、limit 個まで
// 画面で「払い方を変える」に使う。先頭は autoSpend と同じ
export function spendOptions(energy, gizmoIds, color, need, limit = 8) {
    if (need <= 0) return [{ spend: emptyEnergy(), converters: [] }];
    const total = countEnergy(energy);
    const found = [];
    let first = null;
    for (let n = 1; n <= Math.min(need, total); n++) {
        if (first !== null && n > first + 1) break;
        const level = [];
        forEachSpend(energy, n, (spend) => {
            const used = checkSpend(energy, spend, gizmoIds, color, need);
            if (!used) return;
            const direct = color === 'any' ? 0 : spend[color];
            const spread = COLORS.reduce((sum, c) => sum + spend[c] * energy[c], 0);
            level.push({ spend: { ...spend }, converters: used, score: direct * 100 + spread });
        });
        if (level.length > 0 && first === null) first = n;
        level.sort((a, b) => b.score - a.score);
        found.push(...level.map(({ spend, converters }) => ({ spend, converters })));
        if (found.length >= limit) break;
    }
    return found.slice(0, limit);
}

// 合計が n 個になる払い方を、持っている数の範囲ですべて試す
function forEachSpend(energy, n, visit) {
    const spend = emptyEnergy();
    const walk = (index, left) => {
        const c = COLORS[index];
        if (index === COLORS.length - 1) {
            if (left <= energy[c]) {
                spend[c] = left;
                visit(spend);
            }
            return;
        }
        for (let k = Math.min(left, energy[c]); k >= 0; k--) {
            spend[c] = k;
            walk(index + 1, left - k);
        }
        spend[c] = 0;
    };
    walk(0, n);
}
