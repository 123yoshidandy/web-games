/**
 * 得点の計算（手札と、前に出した2枚組をまとめて数える）。DOM に依存しない
 *
 * - 2枚組：同じ種類の2枚（カニ・ボート・魚）か、泳ぐ人とサメで1点。出していなくても、手札でそろっていれば数える
 * - 収集：枚数で点が決まる（COLLECT_POINTS）
 * - 倍率：数える種類1枚ごとの点。倍率のカード自身は数えない
 * - 人魚：1枚目は一番多い色の枚数、2枚目は2番目に多い色の枚数…（白＝人魚の色は数えない）
 * - 色のボーナス：一番多い色の枚数（ラストチャンスの決着で使う）
 */

import { CARDS, TYPES, TYPE_ORDER, SCORING_COLORS, COLLECT_POINTS, MULTIPLIERS } from './cards.js';

export function countTypes(ids) {
    const counts = Object.fromEntries(TYPE_ORDER.map(t => [t, 0]));
    ids.forEach(id => { counts[CARDS[id].type]++; });
    return counts;
}

export function countColors(ids) {
    const counts = Object.fromEntries(SCORING_COLORS.map(c => [c, 0]));
    ids.forEach(id => {
        const c = CARDS[id].color;
        if (c in counts) counts[c]++;
    });
    return counts;
}

// 色ごとの枚数を多い順に
export const rankedColorCounts = (ids) => Object.values(countColors(ids)).sort((a, b) => b - a);

export const colorBonus = (ids) => rankedColorCounts(ids)[0] ?? 0;

// 種類ごとの点の内訳 { duo, collect, multi, mermaid, total }
export function scoreBreakdown(ids) {
    const n = countTypes(ids);
    const duo = Math.floor(n.crab / 2) + Math.floor(n.boat / 2) + Math.floor(n.fish / 2) + Math.min(n.swimmer, n.shark);
    const collect = Object.entries(COLLECT_POINTS).reduce((sum, [type, table]) => sum + table[Math.min(n[type], table.length - 1)], 0);
    const multi = Object.entries(MULTIPLIERS).reduce((sum, [type, m]) => sum + (n[type] > 0 ? n[type] * n[m.of] * m.each : 0), 0);
    const ranked = rankedColorCounts(ids);
    const mermaid = ranked.slice(0, n.mermaid).reduce((a, b) => a + b, 0);
    return { duo, collect, multi, mermaid, total: duo + collect + multi + mermaid };
}

export const cardPoints = (ids) => scoreBreakdown(ids).total;

export const mermaidCount = (ids) => ids.filter(id => CARDS[id].type === 'mermaid').length;

export { TYPES };
