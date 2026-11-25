/**
 * ゲームの部品（色・指導者・記念碑・枚数）
 */

// 文明の4色。並びは画面とログで使う順
export const COLORS = ['black', 'red', 'blue', 'green'];

export const COLOR_INFO = {
    black: { name: '黒', tile: '集落', leader: '王' },
    red: { name: '赤', tile: '神殿', leader: '神官' },
    blue: { name: '青', tile: '農地', leader: '農民' },
    green: { name: '緑', tile: '市場', leader: '商人' }
};

// 袋に入れる文明タイル（最初に盤に置く神殿10枚は含まない）
export const BAG_COUNTS = { red: 47, blue: 36, green: 30, black: 30 };

export const HAND_SIZE = 6;
export const ACTIONS_PER_TURN = 2;
export const CATASTROPHES_PER_PLAYER = 2;

// 記念碑6つ（2色の組み合わせ）
export const MONUMENTS = [
    ['red', 'blue'], ['red', 'green'], ['red', 'black'],
    ['blue', 'green'], ['blue', 'black'], ['green', 'black']
];

// 王朝の印（席ごと）
export const DYNASTIES = [
    { key: 'bow', name: '弓' },
    { key: 'bull', name: '牛' },
    { key: 'pot', name: '壺' },
    { key: 'lion', name: '獅子' }
];
