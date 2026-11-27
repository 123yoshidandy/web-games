// packages/puzzle-kit 0.1.0 からコピーしたファイル。ここでは直さず、packages/puzzle-kit で直してから同期する
/**
 * CPU：早解きの相手（タイムアタックのライバルと、オンラインの CPU）と、ヒント（suggest）
 *
 * CPU は実際にヒントを当て続けて問題を解き、その手数から解き終わるまでの時間を決める
 *   時間 = (考え始めの秒数 + 手数 × 種類ごとの1手の秒数) × 強さの倍率 × ばらつき（シード付きの乱数で 0.8〜1.2 倍）
 * 時間はゲームの乱数を使わず、渡された乱数（オンラインはサーバーの乱数、タイムアタックは問題のシードから作った乱数）で決める
 */

import { getType } from './puzzles/registry.js';

export const CPU_LEVELS = [
    { id: 'easy', label: 'やさしい', factor: 1.8 },
    { id: 'normal', label: 'ふつう', factor: 1 },
    { id: 'hard', label: 'つよい', factor: 0.55 }
];
export const CPU_LEVEL_IDS = CPU_LEVELS.map(level => level.id);
const THINK_SECONDS = 4;
const MAX_STEPS = 3000;

// ヒント：今の状態からの次の一手（種類の hint と同じ。{ input, cells, message } か null）
export function suggest(typeId, puzzle, state) {
    return getType(typeId).hint(puzzle, state);
}

// 何も書いていない状態から、ヒントを当て続けて解けるまでの手数
export function hintSteps(typeId, puzzle) {
    const type = getType(typeId);
    let state = type.initialState(puzzle);
    for (let step = 0; step < MAX_STEPS; step++) {
        if (type.check(puzzle, state).solved) return step;
        const hint = type.hint(puzzle, state);
        if (!hint) return step;
        state = type.applyInput(puzzle, state, hint.input);
    }
    return MAX_STEPS;
}

// 問題ごとに、CPU が解くのにかかる時間（ミリ秒）。entries は [{ type, puzzle }]
export function cpuDurations(entries, levelId, random) {
    const level = CPU_LEVELS.find(l => l.id === levelId) ?? CPU_LEVELS[1];
    return entries.map(({ type, puzzle }) => {
        const seconds = THINK_SECONDS + hintSteps(type, puzzle) * getType(type).cpuSecondsPerStep;
        return Math.round(seconds * 1000 * level.factor * (0.8 + random() * 0.4));
    });
}

// 解き終わる時刻（始めてからのミリ秒の累計）
export function cumulative(durations, start = 0) {
    let at = start;
    return durations.map(ms => (at += ms));
}
