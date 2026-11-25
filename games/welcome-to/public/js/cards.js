/**
 * カードと得点表のデータ（DOM に依存しない）
 * 数値は、公式のルールブック（英語版）と、Board Game Arena の版で確かめたもの
 */

// 効果。カードの裏の絵
export const EFFECTS = ['surveyor', 'estate', 'park', 'pool', 'temp', 'bis'];
export const EFFECT_NAMES = {
    surveyor: '測量士',
    estate: '不動産屋',
    park: '造園家',
    pool: 'プール業者',
    temp: '派遣',
    bis: 'ビス'
};

// 家番号のカード81枚。番号ごとの、裏の効果の枚数（測量士・不動産屋・造園家・プール業者・派遣・ビス）
const DECK_TABLE = {
    1: [1, 1, 1, 0, 0, 0],
    2: [1, 1, 1, 0, 0, 0],
    3: [1, 0, 0, 1, 1, 1],
    4: [0, 1, 1, 1, 1, 1],
    5: [2, 2, 2, 0, 0, 0],
    6: [2, 1, 1, 1, 1, 1],
    7: [1, 2, 2, 1, 1, 1],
    8: [2, 2, 2, 1, 1, 1],
    9: [1, 2, 2, 1, 1, 1],
    10: [2, 1, 1, 1, 1, 1],
    11: [2, 2, 2, 0, 0, 0],
    12: [0, 1, 1, 1, 1, 1],
    13: [1, 0, 0, 1, 1, 1],
    14: [1, 1, 1, 0, 0, 0],
    15: [1, 1, 1, 0, 0, 0]
};

// カードの一覧：{ id, n（番号）, e（裏の効果）}
export const CARDS = (() => {
    const list = [];
    Object.entries(DECK_TABLE).forEach(([n, counts]) => {
        counts.forEach((count, i) => {
            for (let k = 0; k < count; k++) list.push({ id: list.length, n: Number(n), e: EFFECTS[i] });
        });
    });
    return list;
})();
// 1人用の変種で、山札の後半に混ぜるカード
export const SOLO_CARD = -1;

// 通り（上・中・下）の家の数
export const STREET_SIZES = [10, 11, 12];
export const STREETS = STREET_SIZES.length;
export const HOUSE_COUNT = STREET_SIZES.reduce((a, b) => a + b, 0);
export const MAX_NUMBER = 17;     // 派遣で 0〜17 まで書ける
// プールを作れる家（通りごとの、左から数えた番号。0 始まり）
export const POOL_SPOTS = [[2, 6, 7], [0, 3, 7], [1, 6, 10]];

// 得点表。どれも「消していない一番上の数」が点になる。index = 消した数
export const PARK_SCORES = [[0, 2, 4, 10], [0, 2, 4, 6, 14], [0, 2, 4, 6, 8, 18]];
export const POOL_SCORES = [0, 3, 6, 9, 13, 17, 21, 26, 31, 36];
export const BIS_PENALTY = [0, 1, 3, 6, 9, 12, 16, 20, 24, 28];
export const REFUSAL_PENALTY = [0, 0, 3, 5];
export const MAX_REFUSALS = 3;
// 家並み（1〜6軒）の1つあたりの値。不動産屋で右へ進む
export const ESTATE_VALUES = [[1, 3], [2, 3, 4], [3, 4, 5, 6], [4, 5, 6, 7, 8], [5, 6, 7, 8, 10], [6, 7, 8, 10, 12]];
export const MAX_ESTATE = 6;
// 派遣の数の順位（1位・2位・3位）。1人用の変種は、6人以上で7点
export const TEMP_SCORES = [7, 4, 1];
export const SOLO_TEMP_NEED = 6;

// 都市計画（基本の18枚）。stack は n°1〜3、sizes は必要な家並みの大きさ、points は [最初に達成した人, それ以降]
export const PLANS = [
    { stack: 1, sizes: [1, 1, 1, 1, 1, 1], points: [8, 4] },
    { stack: 1, sizes: [2, 2, 2, 2], points: [8, 4] },
    { stack: 1, sizes: [3, 3, 3], points: [8, 4] },
    { stack: 1, sizes: [4, 4], points: [6, 3] },
    { stack: 1, sizes: [5, 5], points: [8, 4] },
    { stack: 1, sizes: [6, 6], points: [10, 6] },
    { stack: 2, sizes: [1, 1, 1, 6], points: [11, 6] },
    { stack: 2, sizes: [2, 2, 5], points: [10, 6] },
    { stack: 2, sizes: [3, 3, 4], points: [12, 7] },
    { stack: 2, sizes: [3, 6], points: [8, 4] },
    { stack: 2, sizes: [4, 5], points: [9, 5] },
    { stack: 2, sizes: [1, 1, 1, 4], points: [9, 5] },
    { stack: 3, sizes: [1, 2, 6], points: [12, 7] },
    { stack: 3, sizes: [1, 4, 5], points: [13, 7] },
    { stack: 3, sizes: [3, 4], points: [7, 3] },
    { stack: 3, sizes: [2, 5], points: [7, 3] },
    { stack: 3, sizes: [1, 2, 2, 3], points: [11, 6] },
    { stack: 3, sizes: [2, 3, 5], points: [13, 7] }
].map((p, id) => ({ id, ...p }));
