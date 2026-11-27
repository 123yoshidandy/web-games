/**
 * 問題の組：何問を、どの難しさで出すか（シードから決める）
 * 1人用は端末で、オンラインはサーバーで同じ関数を使う。オンラインでは問題そのものだけを配り、シードは配らない
 */

import { PUZZLE_TYPE, getType, DIFFICULTY_IDS } from './puzzles/registry.js';
import { createRandom, hashSeed } from './random.js';

export const SET_SIZES = [3, 5];

// [{ type, difficulty, seed }]
export function planSet({ seed, difficulty = 'normal', count = 1 }) {
    const random = createRandom(seed);
    return Array.from({ length: count }, () => ({ type: PUZZLE_TYPE.id, difficulty, seed: Math.floor(random() * 2 ** 31) }));
}

// 問題を作る（{ type, difficulty, puzzle }。シードは残さない）
export function buildPuzzle({ type, difficulty, seed }) {
    const puzzleType = getType(type);
    if (!puzzleType) throw new Error(`知らないパズルの種類です: ${type}`);
    return { type, difficulty, puzzle: puzzleType.generate(seed, difficulty) };
}

// 今日のパズル：日付（端末の地域の日付 YYYY-MM-DD）で決まる、やさしい・ふつう・むずかしいの3問。誰が開いても同じ問題になる
export function dailyKey(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function dailyPlan(key) {
    const random = createRandom(hashSeed(`daily:${PUZZLE_TYPE.id}:${key}`));
    return DIFFICULTY_IDS.map(difficulty => ({ type: PUZZLE_TYPE.id, difficulty, seed: Math.floor(random() * 2 ** 31) }));
}

export const isDifficulty = (value) => DIFFICULTY_IDS.includes(value);
