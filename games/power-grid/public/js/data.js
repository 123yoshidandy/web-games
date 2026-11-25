/**
 * 発電所・資源・収入・人数ごとの決まり（基本ゲーム。Rio Grande の英語のルールブックと有志の実装で照らし合わせた）
 */

// 発電所42枚：番号・種類・使う資源の数・送電できる都市の数
// 種類：coal 石炭 / oil 石油 / hybrid 石炭か石油 / garbage ゴミ / uranium ウラン / eco 風力など（資源なし。50 は核融合）
export const PLANTS = [
    [3, 'oil', 2, 1], [4, 'coal', 2, 1], [5, 'hybrid', 2, 1], [6, 'garbage', 1, 1], [7, 'oil', 3, 2], [8, 'coal', 3, 2],
    [9, 'oil', 1, 1], [10, 'coal', 2, 2], [11, 'uranium', 1, 2], [12, 'hybrid', 2, 2], [13, 'eco', 0, 1], [14, 'garbage', 2, 2],
    [15, 'coal', 2, 3], [16, 'oil', 2, 3], [17, 'uranium', 1, 2], [18, 'eco', 0, 2], [19, 'garbage', 2, 3], [20, 'coal', 3, 5],
    [21, 'hybrid', 2, 4], [22, 'eco', 0, 2], [23, 'uranium', 1, 3], [24, 'garbage', 2, 4], [25, 'coal', 2, 5], [26, 'oil', 2, 5],
    [27, 'eco', 0, 3], [28, 'uranium', 1, 4], [29, 'hybrid', 1, 4], [30, 'garbage', 3, 6], [31, 'coal', 3, 6], [32, 'oil', 3, 6],
    [33, 'eco', 0, 4], [34, 'uranium', 1, 5], [35, 'oil', 1, 5], [36, 'coal', 3, 7], [37, 'eco', 0, 4], [38, 'garbage', 3, 7],
    [39, 'uranium', 1, 6], [40, 'oil', 2, 6], [42, 'coal', 2, 6], [44, 'eco', 0, 5], [46, 'hybrid', 3, 7], [50, 'eco', 0, 6]
].map(([num, type, need, cities]) => ({ num, type, need, cities }));
export const PLANT = Object.fromEntries(PLANTS.map(p => [p.num, p]));
export const STEP3 = 99;               // 段階3のカード（山の中では番号 99 として持つ）

export const RESOURCES = ['coal', 'oil', 'garbage', 'uranium'];
export const RESOURCE_NAMES = { coal: '石炭', oil: '石油', garbage: 'ゴミ', uranium: 'ウラン' };
export const TYPE_NAMES = { coal: '石炭', oil: '石油', hybrid: '石炭・石油', garbage: 'ゴミ', uranium: 'ウラン', eco: '風力' };

// 資源の市場のマスの値段（安い順）。石炭・石油・ゴミは 1〜8 に3つずつ、ウランは 1〜8 と 10・12・14・16 に1つずつ
const triple = Array.from({ length: 24 }, (_, i) => Math.floor(i / 3) + 1);
export const PRICES = { coal: triple, oil: triple, garbage: triple, uranium: [1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 14, 16] };
export const TOKENS = { coal: 24, oil: 24, garbage: 24, uranium: 12 };
// 最初に市場に置く数（高い方から）：石炭 1〜8、石油 3〜8、ゴミ 7〜8、ウラン 14・16
export const START_MARKET = { coal: 24, oil: 18, garbage: 6, uranium: 2 };

// 補充の表 [人数][段階1・2・3]
export const RESUPPLY = {
    coal: { 2: [3, 4, 3], 3: [4, 5, 3], 4: [5, 6, 4], 5: [5, 7, 5], 6: [7, 9, 6] },
    oil: { 2: [2, 2, 4], 3: [2, 3, 4], 4: [3, 4, 5], 5: [4, 5, 6], 6: [5, 6, 7] },
    garbage: { 2: [1, 2, 3], 3: [1, 2, 3], 4: [2, 3, 4], 5: [3, 3, 5], 6: [3, 5, 6] },
    uranium: { 2: [1, 1, 1], 3: [1, 1, 1], 4: [1, 2, 2], 5: [2, 3, 2], 6: [2, 3, 3] }
};

// 送電した都市の数（0〜20。それより多くても 20 と同じ）ごとの収入
export const PAYMENT = [10, 22, 33, 44, 54, 64, 73, 82, 90, 98, 105, 112, 118, 124, 129, 134, 138, 142, 145, 148, 150];
export const payment = (n) => PAYMENT[Math.min(n, PAYMENT.length - 1)];

export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 6;
export const START_MONEY = 50;
export const HOUSES = 22;
// 人数ごと：使う地域の数・山から抜く枚数・持てる発電所の数・段階2になる都市の数・終わりの都市の数
export const SETUP = {
    2: { regions: 3, remove: 8, maxPlants: 4, step2: 10, end: 21 },
    3: { regions: 3, remove: 8, maxPlants: 3, step2: 7, end: 17 },
    4: { regions: 4, remove: 4, maxPlants: 3, step2: 7, end: 17 },
    5: { regions: 5, remove: 0, maxPlants: 3, step2: 7, end: 15 },
    6: { regions: 5, remove: 0, maxPlants: 3, step2: 6, end: 14 }
};
// 都市に建てる費用（1軒目・2軒目・3軒目）
export const BUILD_COST = [10, 15, 20];
