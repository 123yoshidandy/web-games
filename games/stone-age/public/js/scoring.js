/**
 * 終了時の得点
 * - 緑の文化：違う種類の組ごとに、種類の数の2乗（同じ種類の2枚目は、次の組に入る）
 * - 砂色の倍率：人の数の合計 × もとになる数（農民＝畑の段、道具職人＝道具の値の合計、小屋の建築家＝建物の数、シャーマン＝人の数）
 * - 残った資源：1つ1点（食料は数えない）
 */

import { CIV_CARDS, CULTURES, MULTIPLIERS, resourceCount } from './cards.js';

// 文化の得点。cards は文明カードの id の配列
export function cultureScore(cards) {
    const counts = Object.fromEntries(CULTURES.map(k => [k, 0]));
    cards.forEach(id => {
        const culture = CIV_CARDS[id].bottom.culture;
        if (culture) counts[culture] += 1;
    });
    let score = 0;
    for (;;) {
        const kinds = CULTURES.filter(k => counts[k] > 0);
        if (!kinds.length) return score;
        score += kinds.length * kinds.length;
        kinds.forEach(k => { counts[k] -= 1; });
    }
}

// 倍率の人数（種類ごと）
export function multiplierCounts(cards) {
    const counts = Object.fromEntries(MULTIPLIERS.map(k => [k, 0]));
    cards.forEach(id => {
        const { mult, n } = CIV_CARDS[id].bottom;
        if (mult) counts[mult] += n;
    });
    return counts;
}

export const toolTotal = (player) => player.tools.reduce((s, v) => s + v, 0);

export function multiplierBase(player) {
    return {
        farmer: player.agri,
        toolmaker: toolTotal(player),
        builder: player.buildings.length,
        shaman: player.people
    };
}

// 終了時に足す点の内訳。player：{ cards, agri, tools, buildings, people, res }
export function finalBonus(player) {
    const culture = cultureScore(player.cards);
    const counts = multiplierCounts(player.cards);
    const base = multiplierBase(player);
    const mults = Object.fromEntries(MULTIPLIERS.map(k => [k, counts[k] * base[k]]));
    const resources = resourceCount(player.res);
    const total = culture + MULTIPLIERS.reduce((s, k) => s + mults[k], 0) + resources;
    return { culture, ...mults, resources, total };
}

// 同点のときに比べる数（畑の段＋道具の値の合計＋人の数）
export const tieBreak = (player) => player.agri + toolTotal(player) + player.people;
