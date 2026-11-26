/**
 * テラミスティカのデータ（地形・地図・勢力・タイル）
 * 数値は基本セットのルールブックと、オープンソースの実装（terra.snellman.net）に合わせた
 */

// 地形。並びは変換の輪の順（隣どうしは鋤1つで変わる。輪なので荒地の次は砂漠）
export const TERRAINS = ['desert', 'plains', 'swamp', 'lakes', 'forest', 'mountains', 'wasteland'];
export const TERRAIN_INFO = {
    desert: { name: '砂漠', color: '#e3c35a', ink: '#3a2e08' },
    plains: { name: '平原', color: '#a8773f', ink: '#ffffff' },
    swamp: { name: '沼地', color: '#4a4540', ink: '#ffffff' },
    lakes: { name: '湖', color: '#3f86cf', ink: '#ffffff' },
    forest: { name: '森', color: '#3d8a48', ink: '#ffffff' },
    mountains: { name: '山', color: '#9c9c98', ink: '#1d1d1d' },
    wasteland: { name: '荒地', color: '#c4453a', ink: '#ffffff' },
    river: { name: '川', color: '#bfe0ef', ink: '#1d3c4f' }
};

// 基本の地図（9行。偶数の行は13マス、奇数の行は12マスで、半マス右にずれる）。x は川
const COLOR_TO_TERRAIN = { yellow: 'desert', brown: 'plains', black: 'swamp', blue: 'lakes', green: 'forest', gray: 'mountains', red: 'wasteland', x: 'river' };
const BASE_MAP = [
    'brown gray green blue yellow red brown black red green blue red black',
    'yellow x x brown black x x yellow black x x yellow',
    'x x black x gray x green x green x gray x x',
    'green blue yellow x x red blue x red x red brown',
    'black brown red blue black brown gray yellow x x green black blue',
    'gray green x x yellow green x x x brown gray brown',
    'x x x gray x red x green x yellow black blue yellow',
    'yellow blue brown x x x blue black x gray brown gray',
    'red black gray blue red green yellow brown gray x blue green red'
];
export const MAP_ROWS = BASE_MAP.map(row => row.split(' ').map(c => COLOR_TO_TERRAIN[c]));

// 宗教の段（4つ）
export const CULTS = ['fire', 'water', 'earth', 'air'];
export const CULT_INFO = {
    fire: { name: '火', color: '#d9503f' },
    water: { name: '水', color: '#3f86cf' },
    earth: { name: '土', color: '#8a5a2b' },
    air: { name: '風', color: '#b9b9c9' }
};
// 段を越えたときにもらえる魔力（3・5・7・10 に着いたとき）
export const CULT_POWER = { 3: 1, 5: 2, 7: 2, 10: 3 };
// 司祭を置く場所（各段に4つ。最初の1つは3つ進み、ほかは2つ）
export const PRIEST_SPOTS = [3, 2, 2, 2];

// 建物
export const BUILDINGS = ['D', 'TP', 'TE', 'SH', 'SA'];
export const BUILDING_INFO = {
    D: { name: '住居', short: '住', power: 1, max: 8 },
    TP: { name: '交易所', short: '交', power: 2, max: 4 },
    TE: { name: '寺院', short: '寺', power: 2, max: 3 },
    SH: { name: '要塞', short: '要', power: 3, max: 1 },
    SA: { name: '聖域', short: '聖', power: 3, max: 1 }
};
// 改良の元の建物
export const UPGRADE_FROM = { TP: 'D', TE: 'TP', SH: 'TP', SA: 'TE' };

export const RESOURCE_NAMES = { C: 'コイン', W: '職人', P: '司祭', PW: '魔力', VP: '勝利点' };

// ---- 勢力 ----
// short は、4人以上のときの上の札に収まらない名前の略
// income の配列は、その建物を建てた数ごとの収入（0軒のときの値は、勢力盤の最初から見えている収入）

const STD_INCOME = {
    D: { W: [1, 2, 3, 4, 5, 6, 7, 8, 8] },
    TP: { C: [0, 2, 4, 6, 8], PW: [0, 1, 2, 4, 6] },
    TE: { P: [0, 1, 2, 3] },
    SH: { PW: [0, 2] },
    SA: { P: [0, 1] }
};
const STD_COST = {
    D: { W: 1, C: 2 }, TP: { W: 2, C: 3 }, TE: { W: 2, C: 5 }, SH: { W: 4, C: 6 }, SA: { W: 4, C: 6 }
};

function faction(def) {
    return {
        res: { C: 15, W: 3, P: 0 },
        power: [5, 7, 0],
        cult: { fire: 0, water: 0, earth: 0, air: 0 },
        ship: { start: 0, max: 3, vp: [2, 3, 4] },
        dig: { max: 2, cost: { W: 2, C: 5, P: 1 } },
        teleport: null,
        ...def,
        cost: { ...STD_COST, ...def.cost },
        income: { ...STD_INCOME, ...def.income }
    };
}

export const FACTIONS = {
    witches: faction({
        name: '魔女', terrain: 'forest', cult: { fire: 0, water: 0, earth: 0, air: 2 },
        ability: '町を作るたびに 5 勝利点',
        sh: '要塞：ラウンドに1回、どこの森にでも住居を無料で建てられる（魔女の飛行）'
    }),
    auren: faction({
        name: '森の賢者', terrain: 'forest', cult: { fire: 0, water: 1, earth: 0, air: 1 },
        cost: { SA: { W: 4, C: 8 } },
        ability: '特別な力はないが、要塞がとても強い',
        sh: '要塞：すぐに恩恵タイルを1枚。ラウンドに1回、宗教の段の1つを2つ進める'
    }),
    alchemists: faction({
        name: '錬金術師', terrain: 'swamp', cult: { fire: 1, water: 1, earth: 0, air: 0 },
        income: { TP: { C: [0, 2, 4, 7, 11], PW: [0, 1, 2, 3, 4] }, SH: { C: [0, 6] } },
        ability: 'いつでも 1 勝利点 → 1 コイン、2 コイン → 1 勝利点に交換できる',
        sh: '要塞：すぐに魔力 12。以後、鋤を1つ使うたびに魔力 2'
    }),
    darklings: faction({
        name: '闇の民', terrain: 'swamp', res: { C: 15, W: 1, P: 1 }, cult: { fire: 0, water: 1, earth: 1, air: 0 },
        dig: { max: 0, cost: null },
        cost: { SA: { W: 4, C: 10 } },
        income: { SA: { P: [0, 2] } },
        ability: '鋤は職人でなく司祭1人で払い、払った鋤1つごとに 2 勝利点。鋤の改良はできない',
        sh: '要塞：すぐに職人を3人まで司祭に替えられる'
    }),
    halflings: faction({
        name: '小人族', terrain: 'plains', power: [3, 9, 0], cult: { fire: 0, water: 0, earth: 1, air: 1 },
        dig: { max: 2, cost: { W: 2, C: 1, P: 1 } },
        cost: { SH: { W: 4, C: 8 } },
        ability: '鋤を1つ使うたびに 1 勝利点。鋤の改良が安い',
        sh: '要塞：すぐに鋤3つ（変換した土地の1つに住居を建ててよい）'
    }),
    cultists: faction({
        name: '教団', terrain: 'plains', cult: { fire: 1, water: 0, earth: 1, air: 0 },
        cost: { SH: { W: 4, C: 8 }, SA: { W: 4, C: 8 } },
        ability: '建てたときに、だれかが魔力を受け取れば宗教の段を1つ進める。全員が断れば魔力 1',
        sh: '要塞：すぐに 7 勝利点'
    }),
    mermaids: faction({
        name: '人魚', terrain: 'lakes', power: [3, 9, 0], cult: { fire: 0, water: 2, earth: 0, air: 0 },
        ship: { start: 1, max: 5, vp: [0, 2, 3, 4, 5] },
        cost: { SA: { W: 4, C: 8 } },
        income: { SH: { PW: [0, 4] } },
        ability: '航海1から始まり、5まで伸ばせる。町は川1マスをはさんでもつながる',
        sh: '要塞：すぐに航海が1つ伸びる'
    }),
    swarmlings: faction({
        name: '群れの民', terrain: 'lakes', res: { C: 20, W: 8, P: 0 }, power: [3, 9, 0],
        cult: { fire: 1, water: 1, earth: 1, air: 1 },
        cost: { D: { W: 2, C: 3 }, TP: { W: 3, C: 4 }, TE: { W: 3, C: 6 }, SH: { W: 5, C: 8 }, SA: { W: 5, C: 8 } },
        income: { D: { W: [2, 3, 4, 5, 6, 7, 8, 9, 9] }, TP: { C: [0, 2, 4, 6, 9], PW: [0, 2, 4, 6, 8] }, SH: { PW: [0, 4] }, SA: { P: [0, 2] } },
        ability: '町を作るたびに職人 3。建物は高いが収入が多い',
        sh: '要塞：ラウンドに1回、住居1つを無料で交易所に改良できる'
    }),
    fakirs: faction({
        name: '苦行僧', terrain: 'desert', power: [7, 5, 0], cult: { fire: 1, water: 0, earth: 0, air: 1 },
        ship: { start: 0, max: 0, vp: [] },
        dig: { max: 1, cost: { W: 2, C: 5, P: 1 } },
        teleport: { type: 'carpet', range: 1, cost: { P: 1 }, vp: 4 },
        cost: { SH: { W: 4, C: 10 } },
        income: { SH: { P: [0, 1] } },
        ability: '航海の代わりに空飛ぶじゅうたん：司祭1人で1マス先まで飛び越えて建てられ、4 勝利点',
        sh: '要塞：じゅうたんで飛べる距離が1つ伸びる'
    }),
    nomads: faction({
        name: '遊牧民', terrain: 'desert', res: { C: 15, W: 2, P: 0 }, cult: { fire: 1, water: 0, earth: 1, air: 0 },
        cost: { SH: { W: 4, C: 8 } },
        income: { TP: { C: [0, 2, 4, 7, 11], PW: [0, 1, 2, 3, 4] } },
        ability: '最初に住居を3つ置く',
        sh: '要塞：ラウンドに1回、自分の建物の隣の土地を無料で砂漠に変え、住居を建ててよい（砂嵐）'
    }),
    giants: faction({
        name: '巨人', terrain: 'wasteland', cult: { fire: 1, water: 0, earth: 0, air: 1 },
        income: { SH: { PW: [0, 4] } },
        ability: 'どの地形も、いつも鋤2つで荒地に変える',
        sh: '要塞：ラウンドに1回、無料の鋤2つ'
    }),
    chaosmagicians: faction({
        name: '混沌の魔術師', short: '魔術師', terrain: 'wasteland', res: { C: 15, W: 4, P: 0 }, cult: { fire: 2, water: 0, earth: 0, air: 0 },
        cost: { SH: { W: 4, C: 4 }, SA: { W: 4, C: 8 } },
        income: { SH: { W: [0, 2] } },
        ability: '最初の住居は1つだけ（最後に置く）。寺院と聖域で恩恵タイルを2枚もらう',
        sh: '要塞：ラウンドに1回、続けて2回の行動をする'
    }),
    dwarves: faction({
        name: 'ドワーフ', terrain: 'mountains', cult: { fire: 0, water: 0, earth: 2, air: 0 },
        ship: { start: 0, max: 0, vp: [] },
        teleport: { type: 'tunnel', range: 1, cost: { W: 2 }, vp: 4 },
        income: { TP: { C: [0, 3, 5, 7, 10], PW: [0, 1, 2, 4, 6] } },
        ability: '航海の代わりにトンネル：職人2人を足して1マス先まで掘り進んで建てられ、4 勝利点',
        sh: '要塞：トンネルの職人が1人になる'
    }),
    engineers: faction({
        name: '技師', terrain: 'mountains', res: { C: 10, W: 2, P: 0 }, power: [3, 9, 0],
        cost: { D: { W: 1, C: 1 }, TP: { W: 1, C: 2 }, TE: { W: 1, C: 4 }, SH: { W: 3, C: 6 }, SA: { W: 3, C: 6 } },
        income: { D: { W: [0, 1, 2, 2, 3, 4, 4, 5, 6] }, TE: { P: [0, 1, 1, 2], PW: [0, 0, 5, 5] } },
        ability: '建物が安い。職人2人で橋を架けられる（何回でも）',
        sh: '要塞：パスのとき、自分の建物どうしをつなぐ橋1本ごとに 3 勝利点'
    })
};
// 画面での並び（地形の色ごと）
export const FACTION_ORDER = ['witches', 'auren', 'alchemists', 'darklings', 'halflings', 'cultists', 'mermaids', 'swarmlings',
    'fakirs', 'nomads', 'giants', 'chaosmagicians', 'dwarves', 'engineers'];

// ---- タイル ----

// 魔力アクション（ラウンドに1回ずつ、早い者勝ち）
export const POWER_ACTIONS = {
    ACT1: { cost: 3, name: '橋を架ける', short: '橋' },
    ACT2: { cost: 3, name: '司祭 1', short: '司祭' },
    ACT3: { cost: 4, name: '職人 2', short: '職人2' },
    ACT4: { cost: 4, name: 'コイン 7', short: 'コイン7' },
    ACT5: { cost: 4, name: '鋤 1', short: '鋤1' },
    ACT6: { cost: 6, name: '鋤 2', short: '鋤2' }
};

// ボーナスカード（人数＋3枚を使う。パスのときに取り替える）
export const BONUS_CARDS = {
    BON1: { income: { C: 2 }, action: 'spade', text: '行動：鋤1。収入 コイン2' },
    BON2: { income: { C: 4 }, action: 'cult', text: '行動：宗教の段を1つ進める。収入 コイン4' },
    BON3: { income: { C: 6 }, text: '収入 コイン6' },
    BON4: { income: { PW: 3 }, ship: 1, text: '航海＋1（このラウンドだけ）。収入 魔力3' },
    BON5: { income: { W: 1, PW: 3 }, text: '収入 職人1・魔力3' },
    BON6: { income: { W: 2 }, passVp: { SH: 4, SA: 4 }, text: 'パスで要塞・聖域が各4点。収入 職人2' },
    BON7: { income: { W: 1 }, passVp: { TP: 2 }, text: 'パスで交易所1つ2点。収入 職人1' },
    BON8: { income: { P: 1 }, text: '収入 司祭1' },
    BON9: { income: { C: 2 }, passVp: { D: 1 }, text: 'パスで住居1つ1点。収入 コイン2' }
};

// 恩恵タイル（寺院・聖域を建てるともらう。同じものは1人1枚まで）
export const FAVOR_TILES = {
    FAV1: { cult: { fire: 3 }, count: 1, text: '火＋3' },
    FAV2: { cult: { water: 3 }, count: 1, text: '水＋3' },
    FAV3: { cult: { earth: 3 }, count: 1, text: '土＋3' },
    FAV4: { cult: { air: 3 }, count: 1, text: '風＋3' },
    FAV5: { cult: { fire: 2 }, count: 3, townSize: 6, text: '火＋2。町は魔力6でよい' },
    FAV6: { cult: { water: 2 }, count: 3, action: 'cult', text: '水＋2。行動：宗教の段を1つ進める' },
    FAV7: { cult: { earth: 2 }, count: 3, income: { W: 1, PW: 1 }, text: '土＋2。収入 職人1・魔力1' },
    FAV8: { cult: { air: 2 }, count: 3, income: { PW: 4 }, text: '風＋2。収入 魔力4' },
    FAV9: { cult: { fire: 1 }, count: 3, income: { C: 3 }, text: '火＋1。収入 コイン3' },
    FAV10: { cult: { water: 1 }, count: 3, buildVp: { TP: 3 }, text: '水＋1。交易所を建てると3点' },
    FAV11: { cult: { earth: 1 }, count: 3, buildVp: { D: 2 }, text: '土＋1。住居を建てると2点' },
    FAV12: { cult: { air: 1 }, count: 3, passTp: [0, 2, 3, 3, 4], text: '風＋1。パスで交易所の数に応じ 2〜4点' }
};

// 町タイル（各2枚）
export const TOWN_TILES = {
    TW1: { vp: 5, gain: { C: 6 }, text: '5点・コイン6' },
    TW2: { vp: 7, gain: { W: 2 }, text: '7点・職人2' },
    TW3: { vp: 9, gain: { P: 1 }, text: '9点・司祭1' },
    TW4: { vp: 6, gain: { PW: 8 }, text: '6点・魔力8' },
    TW5: { vp: 8, cult: 1, text: '8点・宗教の段すべて＋1' }
};
export const TOWN_COUNT = 2;

// ラウンドの得点タイル（8枚から6枚。鋤のタイルは5・6ラウンドに来ない）
// vp：そのラウンドに起きたら勝利点。bonus：ラウンドの終わりに、宗教の段 req ごとにもらうもの
export const SCORE_TILES = {
    SCORE1: { vp: { spade: 2 }, cult: 'earth', req: 1, bonus: { C: 1 }, text: '鋤1つ 2点', bonusText: '土1ごとにコイン1' },
    SCORE2: { vp: { town: 5 }, cult: 'earth', req: 4, bonus: { spade: 1 }, text: '町 5点', bonusText: '土4ごとに鋤1' },
    SCORE3: { vp: { D: 2 }, cult: 'water', req: 4, bonus: { P: 1 }, text: '住居 2点', bonusText: '水4ごとに司祭1' },
    SCORE4: { vp: { SH: 5, SA: 5 }, cult: 'fire', req: 2, bonus: { W: 1 }, text: '要塞・聖域 5点', bonusText: '火2ごとに職人1' },
    SCORE5: { vp: { D: 2 }, cult: 'fire', req: 4, bonus: { PW: 4 }, text: '住居 2点', bonusText: '火4ごとに魔力4' },
    SCORE6: { vp: { TP: 3 }, cult: 'water', req: 4, bonus: { spade: 1 }, text: '交易所 3点', bonusText: '水4ごとに鋤1' },
    SCORE7: { vp: { SH: 5, SA: 5 }, cult: 'air', req: 2, bonus: { W: 1 }, text: '要塞・聖域 5点', bonusText: '風2ごとに職人1' },
    SCORE8: { vp: { TP: 3 }, cult: 'air', req: 4, bonus: { spade: 1 }, text: '交易所 3点', bonusText: '風4ごとに鋤1' }
};

export const ROUNDS = 6;
export const START_VP = 20;
export const MAX_PRIESTS = 7;
export const MAX_BRIDGES = 3;
export const TOWN_POWER = 7;
export const NETWORK_VP = [18, 12, 6];
export const CULT_VP = [8, 4, 2];
// 航海・鋤の改良の費用と勝利点
export const SHIP_COST = { C: 4, P: 1 };
export const DIG_VP = 6;
