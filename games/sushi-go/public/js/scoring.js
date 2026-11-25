/**
 * 得点の計算（DOM に依存しない）
 * 場（tableau）は [{ type, nigiri? }] の並び。わさびの上に載ったにぎりは、わさびの nigiri に入る
 */

import { CARDS } from './cards.js';

const DUMPLING = [0, 1, 3, 6, 10, 15];

export const countOf = (tableau, type) => tableau.filter(c => c.type === type).length;
export const makiIcons = (tableau) => tableau.reduce((s, c) => s + (CARDS[c.type].maki ?? 0), 0);

// 巻き寿司以外の得点（1人分）
export function cardScores(tableau) {
    const tempura = Math.floor(countOf(tableau, 'tempura') / 2) * 5;
    const sashimi = Math.floor(countOf(tableau, 'sashimi') / 3) * 10;
    const dumpling = DUMPLING[Math.min(5, countOf(tableau, 'dumpling'))];
    const nigiri = tableau.reduce((s, c) => {
        if (CARDS[c.type].nigiri) return s + CARDS[c.type].nigiri;
        if (c.type === 'wasabi' && c.nigiri) return s + CARDS[c.nigiri].nigiri * 3;
        return s;
    }, 0);
    return { tempura, sashimi, dumpling, nigiri };
}

// 1位と2位で点を分ける（巻き寿司）。同点は等分して端数を切り捨て。1位が同点なら2位はない
// 数が0の人は点を取らない
export function makiScores(icons) {
    const scores = icons.map(() => 0);
    const values = [...new Set(icons.filter(v => v > 0))].sort((a, b) => b - a);
    if (!values.length) return scores;
    const first = icons.map((v, i) => (v === values[0] ? i : -1)).filter(i => i >= 0);
    first.forEach(i => { scores[i] = Math.floor(6 / first.length); });
    if (first.length === 1 && values.length > 1) {
        const second = icons.map((v, i) => (v === values[1] ? i : -1)).filter(i => i >= 0);
        second.forEach(i => { scores[i] = Math.floor(3 / second.length); });
    }
    return scores;
}

// ラウンドの得点（全員分）
export function scoreRound(tableaus) {
    const maki = makiScores(tableaus.map(makiIcons));
    return tableaus.map((t, i) => {
        const parts = { ...cardScores(t), maki: maki[i] };
        return { ...parts, total: parts.tempura + parts.sashimi + parts.dumpling + parts.nigiri + parts.maki };
    });
}

// 最後のプリンの得点。最多で6点、最少で−6点（同点は等分して端数を切り捨て。0枚も最少に入る）
// 全員が同じ数なら点なし。2人のときは最少の減点なし
export function puddingScores(counts) {
    const scores = counts.map(() => 0);
    const max = Math.max(...counts);
    const min = Math.min(...counts);
    if (max === min) return scores;
    const most = counts.map((v, i) => (v === max ? i : -1)).filter(i => i >= 0);
    most.forEach(i => { scores[i] += Math.floor(6 / most.length); });
    if (counts.length > 2) {
        const least = counts.map((v, i) => (v === min ? i : -1)).filter(i => i >= 0);
        least.forEach(i => { scores[i] -= Math.floor(6 / least.length); });
    }
    return scores;
}
