/**
 * 得点の計算（DOM に依存しない）
 */

import { SOUVENIRS, SOUVENIR_KIND_IDS, DISHES, dishOf, TEMPLE_RANK_POINTS } from './data.js';

// 土産の点：種類の違う土産で組を作り、組の1枚目1点・2枚目3点・3枚目5点・4枚目7点（m 種類の組で m² 点）
// 種類ごとの枚数から、j 番目の組には「j 枚以上ある種類」が入る（いちばん点が多い組み方）
export function souvenirPoints(cards) {
    const counts = SOUVENIR_KIND_IDS.map(kind => cards.filter(c => SOUVENIRS[c].kind === kind).length);
    let total = 0;
    for (let j = 1; j <= Math.max(0, ...counts); j++) {
        const m = counts.filter(c => c >= j).length;
        total += m * m;
    }
    return total;
}

// 土産を足したときに増える点
export const souvenirGain = (cards, added) => souvenirPoints([...cards, ...added]) - souvenirPoints(cards);

// 食事の札の値段の合計（食通の称号。払った額ではなく札の値段）
export const mealPriceTotal = (meals) => meals.reduce((s, card) => s + DISHES[dishOf(card)].price, 0);

// 寺の寄付の順位の点。donations は旅人ごとの寄付の額（2人のときの中立の旅人も順位に入る）
// 同じ額は同じ順位で、その順位の点をそれぞれ得る。順位は額の大きい順に数える（同点の次は、次の順位）
// 1文も寄付していない旅人は点なし
export function templeRankPoints(donations) {
    const amounts = [...new Set(donations.filter(d => d > 0))].sort((a, b) => b - a);
    return donations.map(d => {
        if (d <= 0) return 0;
        const rank = amounts.indexOf(d);
        return TEMPLE_RANK_POINTS[Math.min(rank, TEMPLE_RANK_POINTS.length - 1)];
    });
}

// 最も多い人（1以上。同点は全員）
export function mostOf(values) {
    const best = Math.max(0, ...values);
    if (best <= 0) return [];
    return values.map((v, i) => (v === best ? i : -1)).filter(i => i >= 0);
}

// 店で cards を買うときの払う額。足りるかを見る額（need）は、芸者がただにする1枚も含む
export function souvenirCost(traveler, cards) {
    const prices = cards.map(c => SOUVENIRS[c].price);
    const sum = prices.reduce((s, x) => s + x, 0);
    if (!cards.length) return { pay: 0, need: 0 };
    if (traveler === 'sasayakko' && cards.length >= 2) return { pay: sum - Math.min(...prices), need: sum };
    // 商人は、いちばん高い1枚を1文で買う
    if (traveler === 'zenemon') {
        const pay = sum - Math.max(...prices) + 1;
        return { pay, need: pay };
    }
    return { pay: sum, need: sum };
}

// 食事の値段（浪人は1文安い）
export const mealCost = (traveler, card) => Math.max(0, DISHES[dishOf(card)].price - (traveler === 'kinko' ? 1 : 0));
