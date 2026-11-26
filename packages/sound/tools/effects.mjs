/**
 * 共通の効果音（src/effects.js）の決まり（measure・lint-songs・テストで使う）
 *
 * - 音量：最大の瞬間ラウドネスが、effects.js の targets から TOLERANCE_DB 以内
 * - 長さ：音符の並びの長さ（Sound.effectLength）が MAX_SECONDS まで（勝ち・負けは LONG_MAX_SECONDS まで）
 *         響きの残り（-60dBFS を下回るまで）は、それに TAIL_SECONDS を足したところまで
 * - 音割れ：ピークが PEAK_LIMIT_DB より下
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const EFFECTS_FILE = path.join(ROOT, 'src/effects.js');
export const COMMON_LIBRARY = 'common';

export const TOLERANCE_DB = 2;
export const MAX_SECONDS = 0.6;
export const LONG_MAX_SECONDS = 2;
export const LONG_EFFECTS = ['win', 'lose'];
export const TAIL_SECONDS = 0.8;
export const PEAK_LIMIT_DB = -1;

export function maxSeconds(id) {
    return LONG_EFFECTS.includes(id) ? LONG_MAX_SECONDS : MAX_SECONDS;
}

// 音符の並びと楽器の書き間違い・長さ（音を鳴らさずに確かめられるもの）
export function definitionProblems(Sound, id) {
    const { effects, targets } = Sound.library(COMMON_LIBRARY);
    const problems = [];
    const length = Sound.effectLength(effects[id]);
    if (length > maxSeconds(id)) problems.push(`長すぎます: ${length.toFixed(2)} 秒（${maxSeconds(id)} 秒まで）`);
    for (const layer of effects[id]) {
        const instrument = typeof layer.instrument === 'string' ? layer.instrument : layer.instrument.instrument;
        if (!Sound.instruments.includes(instrument)) problems.push(`楽器がありません: ${instrument}`);
    }
    if (!Number.isFinite(targets?.[id])) problems.push('音量の目安（targets）がありません');
    return problems;
}

// 書き出して測った値（measure の measureEffect の結果）が、決まりに合うか
export function measuredProblems(id, result, target) {
    const problems = [];
    if (Number.isFinite(target) && !(Math.abs(result.momentary - target) <= TOLERANCE_DB)) {
        problems.push(`音量が目安から外れています: ${result.momentary?.toFixed(1)} LUFS（目安 ${target}±${TOLERANCE_DB}）`);
    }
    if (!(result.peak < PEAK_LIMIT_DB)) problems.push(`ピークが ${PEAK_LIMIT_DB}dBFS 以上です: ${result.peak?.toFixed(1)}`);
    if (result.clipped > 0) problems.push(`音割れ: ${result.clipped} サンプル`);
    const tail = maxSeconds(id) + TAIL_SECONDS;
    if (result.length > tail) problems.push(`響きが長すぎます: ${result.length.toFixed(2)} 秒（${tail} 秒まで）`);
    return problems;
}
