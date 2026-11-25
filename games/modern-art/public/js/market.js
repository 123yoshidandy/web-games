/**
 * 画家の順位と絵の価値（状態を変えない関数だけ。ゲーム・ビュー・CPU で使う）
 * - その回に出た枚数（競らずに終わった5枚目も数える）の多い3人の画家に、30・20・10 を足す。同数なら盤の左の画家が上
 * - 1枚も出ていない画家は、順位に入らない
 * - 絵の価値は、その回に3位までに入った画家だけ、これまでの回の値の合計。入らなかった画家の絵は0
 */

import { ARTISTS, PLACE_VALUES } from './cards.js';

// counts：画家ごとのその回の枚数。戻り値：1位から順に画家の番号（最大3人）
export function ranking(counts) {
    return ARTISTS.map((_, a) => a)
        .filter(a => counts[a] > 0)
        .sort((a, b) => counts[b] - counts[a] || a - b)
        .slice(0, PLACE_VALUES.length);
}

// tokens：[回][画家] の値（0・10・20・30）。rank：その回の順位。戻り値：画家ごとの絵1枚の価値
export function paintingValues(tokens, rank) {
    return ARTISTS.map((_, a) => (rank.includes(a) ? tokens.reduce((sum, row) => sum + row[a], 0) : 0));
}

// その回の値を tokens に足した新しい表
export function addTokens(tokens, round, rank) {
    const next = tokens.map(row => [...row]);
    rank.forEach((a, place) => { next[round - 1][a] = PLACE_VALUES[place]; });
    return next;
}

// 買った絵（画家ごとの枚数）を売った額
export const payout = (wonCounts, values) => wonCounts.reduce((sum, n, a) => sum + n * values[a], 0);
