/**
 * カードのデータ（ポートロイヤル 基本ゲーム 120枚）
 * 枚数と船の剣の内訳は公式のルールブック、カードごとの数値（船のコイン、人物の費用と点、遠征の点とコイン）は
 * カードの絵にしかないので、ほかの資料と照らし合わせて決めた（README に資料を書く）
 * 名前は自分で訳したもの
 */

export const SHIP_COLORS = ['yellow', 'blue', 'green', 'red', 'black'];
export const SHIP_NAMES = { yellow: 'ピナス', blue: 'フリュート', green: 'スキフ', red: 'フリゲート', black: 'ガレオン' };
export const COLOR_NAMES = { yellow: '黄', blue: '青', green: '緑', red: '赤', black: '黒' };

export const ROLES = {
    trader: { name: '商人' },
    sailor: { name: '船乗り' },
    pirate: { name: '海賊' },
    settler: { name: '定住者', symbol: 'house' },
    captain: { name: '船長', symbol: 'anchor' },
    priest: { name: '司祭', symbol: 'cross' },
    jack: { name: '何でも屋', symbol: 'joker' },
    mademoiselle: { name: 'マドモアゼル' },
    jester: { name: '道化' },
    admiral: { name: '提督' },
    governor: { name: '総督' }
};
export const ROLE_ORDER = Object.keys(ROLES);

export const WIN_POINTS = 12;
export const TAX_LIMIT = 12;
export const STARTING_COINS = 3;

// [枚数, 中身]
const SHIPS = {
    // 剣（null はドクロ）・コイン
    yellow: [[3, 1, 1], [1, 1, 2], [2, 2, 2], [1, 2, 3], [2, 4, 3], [1, 4, 4]],
    blue: [[3, 1, 1], [1, 1, 2], [2, 2, 2], [1, 2, 3], [2, 5, 3], [1, 5, 4]],
    green: [[3, 1, 1], [1, 1, 2], [2, 3, 2], [1, 3, 3], [2, 5, 3], [1, 5, 4]],
    red: [[3, 1, 1], [3, 3, 2], [2, 6, 3], [1, null, 3], [1, null, 4]],
    black: [[3, 2, 1], [3, 4, 2], [2, 7, 3], [1, null, 3], [1, null, 4]]
};

// 役・枚数・費用・点（・剣）
const PERSONS = [
    ...SHIP_COLORS.flatMap(color => (color === 'yellow' || color === 'blue'
        ? [['trader', 1, 3, 1, { color }], ['trader', 1, 5, 2, { color }]]
        : [['trader', 2, 3, 1, { color }]])),
    ['sailor', 7, 3, 1, { swords: 1 }], ['sailor', 2, 5, 2, { swords: 1 }], ['sailor', 1, 7, 3, { swords: 1 }],
    ['pirate', 1, 5, 1, { swords: 2 }], ['pirate', 1, 7, 2, { swords: 2 }], ['pirate', 1, 9, 3, { swords: 2 }],
    ['settler', 5, 4, 1], ['captain', 5, 4, 1], ['priest', 5, 4, 1],
    ['jack', 3, 6, 1],
    ['mademoiselle', 2, 7, 2], ['mademoiselle', 2, 9, 3],
    ['jester', 1, 5, 1], ['jester', 3, 7, 2], ['jester', 1, 9, 3],
    ['admiral', 1, 5, 1], ['admiral', 3, 7, 2], ['admiral', 2, 9, 3],
    ['governor', 4, 8, 0]
];

// 遠征：条件・点・コイン（3種の印の1枚は5人のときだけ）
const EXPEDITIONS = [
    { needs: ['anchor', 'anchor'], vp: 4, coins: 2 },
    { needs: ['cross', 'cross'], vp: 4, coins: 2 },
    { needs: ['house', 'house'], vp: 4, coins: 2 },
    { needs: ['anchor', 'anchor', 'house'], vp: 6, coins: 3 },
    { needs: ['cross', 'cross', 'house'], vp: 6, coins: 3 },
    { needs: ['anchor', 'cross', 'house'], vp: 5, coins: 3, fivePlayer: true }
];
const SYMBOL_NAMES = { anchor: '船長', cross: '司祭', house: '定住者' };

export const CARDS = [];
const add = (card) => CARDS.push({ id: CARDS.length, ...card });

SHIP_COLORS.forEach(color => SHIPS[color].forEach(([count, swords, coins]) => {
    for (let i = 0; i < count; i++) add({ kind: 'ship', color, swords, coins, name: SHIP_NAMES[color] });
}));
PERSONS.forEach(([role, count, cost, vp, extra = {}]) => {
    for (let i = 0; i < count; i++) {
        add({ kind: 'person', role, cost, vp, swords: extra.swords ?? 0, color: extra.color ?? null, symbol: ROLES[role].symbol ?? null, name: ROLES[role].name });
    }
});
EXPEDITIONS.forEach(e => add({ kind: 'expedition', ...e, fivePlayer: !!e.fivePlayer, name: e.needs.map(s => SYMBOL_NAMES[s]).join('・') }));
['swords', 'swords', 'points', 'points'].forEach(bonus => add({ kind: 'tax', bonus, name: '税金' }));

export const CARD_COUNT = CARDS.length;
export const FIVE_PLAYER_EXPEDITION = CARDS.find(c => c.kind === 'expedition' && c.fivePlayer).id;
