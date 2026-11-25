/**
 * 発展カード（90枚）と貴族（10枚）のデータ（基本セット）
 * 色の略号：w 白（ダイヤモンド）・u 青（サファイア）・g 緑（エメラルド）・r 赤（ルビー）・k 黒（オニキス）
 */

export const COLORS = ['white', 'blue', 'green', 'red', 'black'];
export const GOLD = 'gold';
export const TOKEN_COLORS = [...COLORS, GOLD];
export const COLOR_NAMES = { white: '白', blue: '青', green: '緑', red: '赤', black: '黒', gold: '金' };

const LETTERS = { w: 'white', u: 'blue', g: 'green', r: 'red', k: 'black' };

// 'w1u2' → { white: 1, blue: 2, green: 0, red: 0, black: 0 }
function parseCost(text) {
    const cost = Object.fromEntries(COLORS.map(c => [c, 0]));
    for (const [, letter, n] of text.matchAll(/([wugrk])(\d)/g)) cost[LETTERS[letter]] = Number(n);
    return cost;
}

// [ボーナスの色, 点数, コスト]
const LEVEL1 = [
    ['k', 0, 'w1u1g1r1'], ['k', 0, 'w1u2g1r1'], ['k', 0, 'w2u2r1'], ['k', 0, 'g1r3k1'],
    ['k', 0, 'g2r1'], ['k', 0, 'w2g2'], ['k', 0, 'g3'], ['k', 1, 'u4'],
    ['u', 0, 'w1g1r1k1'], ['u', 0, 'w1g1r2k1'], ['u', 0, 'w1g2r2'], ['u', 0, 'u1g3r1'],
    ['u', 0, 'w1k2'], ['u', 0, 'g2k2'], ['u', 0, 'k3'], ['u', 1, 'r4'],
    ['w', 0, 'u1g1r1k1'], ['w', 0, 'u1g2r1k1'], ['w', 0, 'u2g2k1'], ['w', 0, 'w3u1k1'],
    ['w', 0, 'r2k1'], ['w', 0, 'u2k2'], ['w', 0, 'u3'], ['w', 1, 'g4'],
    ['g', 0, 'w1u1r1k1'], ['g', 0, 'w1u1r1k2'], ['g', 0, 'u1r2k2'], ['g', 0, 'w1u3g1'],
    ['g', 0, 'w2u1'], ['g', 0, 'u2r2'], ['g', 0, 'r3'], ['g', 1, 'k4'],
    ['r', 0, 'w1u1g1k1'], ['r', 0, 'w2u1g1k1'], ['r', 0, 'w2g1k2'], ['r', 0, 'w1r1k3'],
    ['r', 0, 'u2g1'], ['r', 0, 'w2r2'], ['r', 0, 'w3'], ['r', 1, 'w4']
];

const LEVEL2 = [
    ['k', 1, 'w3u2g2'], ['k', 1, 'w3g3k2'], ['k', 2, 'u1g4r2'], ['k', 2, 'g5r3'], ['k', 2, 'w5'], ['k', 3, 'k6'],
    ['u', 1, 'u2g2r3'], ['u', 1, 'u2g3k3'], ['u', 2, 'w5u3'], ['u', 2, 'w2r1k4'], ['u', 2, 'u5'], ['u', 3, 'u6'],
    ['w', 1, 'g3r2k2'], ['w', 1, 'w2u3r3'], ['w', 2, 'g1r4k2'], ['w', 2, 'r5k3'], ['w', 2, 'r5'], ['w', 3, 'w6'],
    ['g', 1, 'w3g2r3'], ['g', 1, 'w2u3k2'], ['g', 2, 'w4u2k1'], ['g', 2, 'u5g3'], ['g', 2, 'g5'], ['g', 3, 'g6'],
    ['r', 1, 'w2r2k3'], ['r', 1, 'u3r2k3'], ['r', 2, 'w1u4g2'], ['r', 2, 'w3k5'], ['r', 2, 'k5'], ['r', 3, 'r6']
];

const LEVEL3 = [
    ['k', 3, 'w3u3g5r3'], ['k', 4, 'r7'], ['k', 4, 'g3r6k3'], ['k', 5, 'r7k3'],
    ['u', 3, 'w3g3r3k5'], ['u', 4, 'w7'], ['u', 4, 'w6u3k3'], ['u', 5, 'w7u3'],
    ['w', 3, 'u3g3r5k3'], ['w', 4, 'k7'], ['w', 4, 'w3r3k6'], ['w', 5, 'w3k7'],
    ['g', 3, 'w5u3r3k3'], ['g', 4, 'u7'], ['g', 4, 'w3u6g3'], ['g', 5, 'u7g3'],
    ['r', 3, 'w3u5g3k3'], ['r', 4, 'g7'], ['r', 4, 'u3g6r3'], ['r', 5, 'g7r3']
];

// id は 0〜89（レベル1・2・3の順）
export const CARDS = [[1, LEVEL1], [2, LEVEL2], [3, LEVEL3]]
    .flatMap(([level, rows]) => rows.map(([bonus, points, cost]) => ({ level, bonus: LETTERS[bonus], points, cost: parseCost(cost) })))
    .map((card, id) => Object.freeze({ id, ...card }));

// 貴族はどれも3点。必要なのはボーナス（カード）の数で、宝石は数えない
export const NOBLE_POINTS = 3;
export const NOBLES = ['w4u4', 'u4g4', 'g4r4', 'r4k4', 'k4w4', 'w3u3g3', 'u3g3r3', 'g3r3k3', 'w3r3k3', 'w3u3k3']
    .map((req, id) => Object.freeze({ id, points: NOBLE_POINTS, req: parseCost(req) }));
