/**
 * タケノコの部品のデータ（区画タイルと目標カード）
 *
 * 出典：公開されている2つの実装（zdimension/takenoko の GameData.java と marcpinet/takenoko の ObjectiveDeck.java）を
 * 突き合わせ、45枚の目標カードの内容と点数、27枚の区画タイルの色と改良の印がすべて一致したもの。
 * 決まりは公式のルールブック（2020年の版）に合わせる
 */

export const COLORS = ['green', 'yellow', 'pink'];
export const COLOR_NAMES = { green: '緑', yellow: '黄', pink: '桃' };
export const IMPROVEMENTS = ['watershed', 'enclosure', 'fertilizer'];
export const IMPROVEMENT_NAMES = { watershed: '池', enclosure: '囲い', fertilizer: '肥料' };

// 区画タイル27枚（池を除く）。[色, 改良の印, 枚数]
const PLOT_COUNTS = [
    ['green', null, 6], ['green', 'watershed', 2], ['green', 'enclosure', 2], ['green', 'fertilizer', 1],
    ['yellow', null, 6], ['yellow', 'watershed', 1], ['yellow', 'enclosure', 1], ['yellow', 'fertilizer', 1],
    ['pink', null, 4], ['pink', 'watershed', 1], ['pink', 'enclosure', 1], ['pink', 'fertilizer', 1]
];
export const PLOTS = PLOT_COUNTS.flatMap(([color, improvement, n]) => Array.from({ length: n }, () => ({ color, improvement })))
    .map((plot, id) => ({ id, ...plot }));

// 改良の印のチップ（各3つ）
export const IMPROVEMENT_TOKENS = 3;
export const IRRIGATION_CHANNELS = 20;
export const MAX_BAMBOO = 4;

// 区画の目標の形（六角形の座標 q, r）。どの向きに回しても良い
// ひし形は、端 (0,0)・真ん中 (1,0)・真ん中 (1,-1)・端 (2,-1)。2色のものは「端と、隣の真ん中」が同じ色
export const SHAPES = {
    line: [[0, 0], [1, 0], [2, 0]],
    curve: [[0, 0], [1, 0], [2, -1]],
    triangle: [[0, 0], [1, 0], [1, -1]],
    diamond: [[0, 0], [1, 0], [1, -1], [2, -1]]
};
export const SHAPE_NAMES = { line: 'まっすぐ', curve: '曲がり', triangle: '三角', diamond: 'ひし形' };

const plot = (shape, colors, points) => ({ type: 'plot', shape, colors, points });
const gardener = (color, height, count, improvement, points) => ({ type: 'gardener', color, height, count, improvement, points });
const panda = (need, points) => ({ type: 'panda', need, points });
const same = (color, n) => Array(n).fill(color);

const PLOT_CARDS = [
    plot('line', same('green', 3), 2), plot('curve', same('green', 3), 2), plot('triangle', same('green', 3), 2), plot('diamond', same('green', 4), 3),
    plot('line', same('yellow', 3), 3), plot('curve', same('yellow', 3), 3), plot('triangle', same('yellow', 3), 3), plot('diamond', same('yellow', 4), 4),
    plot('line', same('pink', 3), 4), plot('curve', same('pink', 3), 4), plot('triangle', same('pink', 3), 4), plot('diamond', same('pink', 4), 5),
    plot('diamond', ['green', 'green', 'yellow', 'yellow'], 3),
    plot('diamond', ['green', 'green', 'pink', 'pink'], 4),
    plot('diamond', ['pink', 'pink', 'yellow', 'yellow'], 5)
];

// improvement：'none' は改良のない区画、'any' は問わない
const GARDENER_CARDS = [
    gardener('green', 4, 1, 'fertilizer', 3), gardener('green', 4, 1, 'watershed', 4), gardener('green', 4, 1, 'enclosure', 4),
    gardener('green', 4, 1, 'none', 5), gardener('green', 3, 4, 'any', 8),
    gardener('yellow', 4, 1, 'fertilizer', 4), gardener('yellow', 4, 1, 'watershed', 5), gardener('yellow', 4, 1, 'enclosure', 5),
    gardener('yellow', 4, 1, 'none', 6), gardener('yellow', 3, 3, 'any', 7),
    gardener('pink', 4, 1, 'fertilizer', 5), gardener('pink', 4, 1, 'watershed', 6), gardener('pink', 4, 1, 'enclosure', 6),
    gardener('pink', 4, 1, 'none', 7), gardener('pink', 3, 2, 'any', 6)
];

const PANDA_CARDS = [
    ...Array.from({ length: 5 }, () => panda({ green: 2, yellow: 0, pink: 0 }, 3)),
    ...Array.from({ length: 4 }, () => panda({ green: 0, yellow: 2, pink: 0 }, 4)),
    ...Array.from({ length: 3 }, () => panda({ green: 0, yellow: 0, pink: 2 }, 5)),
    ...Array.from({ length: 3 }, () => panda({ green: 1, yellow: 1, pink: 1 }, 6))
];

// カードの id は 'P0'〜'P14'（区画）、'G0'〜（庭師）、'D0'〜（パンダ）
export const CARDS = Object.fromEntries([
    ...PLOT_CARDS.map((card, i) => [`P${i}`, { id: `P${i}`, ...card }]),
    ...GARDENER_CARDS.map((card, i) => [`G${i}`, { id: `G${i}`, ...card }]),
    ...PANDA_CARDS.map((card, i) => [`D${i}`, { id: `D${i}`, ...card }])
]);
export const CARD_TYPES = ['plot', 'gardener', 'panda'];
export const CARD_TYPE_NAMES = { plot: '区画', gardener: '庭師', panda: 'パンダ' };
export const cardIdsOf = type => Object.values(CARDS).filter(card => card.type === type).map(card => card.id);

export const EMPEROR_POINTS = 2;
export const OBJECTIVES_TO_END = { 2: 9, 3: 8, 4: 7 };
export const HAND_LIMIT = 5;

// 天気のダイス
export const WEATHERS = ['sun', 'rain', 'wind', 'storm', 'clouds', 'choice'];
export const WEATHER_NAMES = { sun: '晴れ', rain: '雨', wind: '風', storm: '嵐', clouds: '雲', choice: '？' };
export const ACTIONS = ['plot', 'irrigation', 'gardener', 'panda', 'objective'];
export const ACTION_NAMES = { plot: '区画', irrigation: '灌漑', gardener: '庭師', panda: 'パンダ', objective: '目標' };
