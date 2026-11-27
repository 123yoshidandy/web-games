/**
 * ダメージ計算（簡易版）
 * ダメージ = 技の威力 × (攻撃 ÷ 防御) × 0.4 × タイプ相性 × 乱数(0.85〜1.0)
 * 物理技は こうげき÷ぼうぎょ、特殊技は とくこう÷とくぼう を使う。本家に寄せるときは、この関数だけを差し替える
 */

import { MOVES, effectiveness } from './data.js';

export const ROLL_MIN = 0.85;
export const ROLL_MAX = 1;
const AVERAGE_ROLL = (ROLL_MIN + ROLL_MAX) / 2;

// attacker・defender は { stats, types }。roll は 0.85〜1.0。当たれば最低1（相性が0倍なら0）
export function calcDamage(attacker, defender, moveId, roll) {
    const move = MOVES[moveId];
    const eff = effectiveness(move.type, defender.types);
    if (eff === 0) return { damage: 0, eff };
    const [a, d] = move.cat === 'p' ? [attacker.stats.atk, defender.stats.def] : [attacker.stats.spa, defender.stats.spd];
    const damage = Math.max(1, Math.floor(move.power * (a / d) * 0.4 * eff * roll));
    return { damage, eff };
}

// 期待値（乱数の平均と命中率をかけたもの。CPU と戦術ルールの比較に使う）
export function expectedDamage(attacker, defender, moveId) {
    return calcDamage(attacker, defender, moveId, AVERAGE_ROLL).damage * MOVES[moveId].acc / 100;
}
