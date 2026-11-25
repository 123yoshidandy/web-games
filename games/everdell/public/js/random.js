/**
 * シード付きの乱数（mulberry32）
 * 状態を数値1つで持つので、ゲームの状態ごと structuredClone で写せる（CPU の先読みで使う）
 */

// 0以上2^32未満のランダムなシード
export const createSeed = () => Math.floor(Math.random() * 2 ** 32);

// 状態 holder.rng（数値）を進めて、[0, 1) の乱数を返す
export function nextRandom(holder) {
    holder.rng = (holder.rng + 0x6D2B79F5) >>> 0;
    let t = holder.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// [0, 1) の乱数を返す関数を作る
export function createRandom(seed) {
    const holder = { rng: seed >>> 0 };
    return () => nextRandom(holder);
}

// 配列をその場でシャッフルする（Fisher-Yates）
export function shuffle(array, random) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}
