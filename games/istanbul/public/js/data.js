/**
 * イスタンブール（基本セット）の部品のデータ
 * 品物の色：red＝布、green＝香辛料、yellow＝果物、blue＝宝石。ルビーは品物とは別に数える
 */

export const GOODS = ['red', 'green', 'yellow', 'blue'];
export const GOOD_NAMES = { red: '布', green: '香辛料', yellow: '果物', blue: '宝石' };

// 場所（番号はルールブックの大きな数字。サイコロの出目で総督・密輸人の行き先にもなる）
export const PLACES = {
    1: { name: '手押し車工房', short: '工房' },
    2: { name: '布の倉庫', short: '布の倉庫', good: 'red' },
    3: { name: '香辛料の倉庫', short: '香辛料の倉庫', good: 'green' },
    4: { name: '果物の倉庫', short: '果物の倉庫', good: 'yellow' },
    5: { name: '郵便局', short: '郵便局' },
    6: { name: '隊商宿', short: '隊商宿' },
    7: { name: '噴水', short: '噴水' },
    8: { name: '闇市', short: '闇市' },
    9: { name: '茶屋', short: '茶屋' },
    10: { name: '大市場', short: '大市場' },
    11: { name: '小市場', short: '小市場' },
    12: { name: '警察署', short: '警察署' },
    13: { name: 'スルタンの宮殿', short: '宮殿' },
    14: { name: '小モスク', short: '小モスク' },
    15: { name: '大モスク', short: '大モスク' },
    16: { name: '宝石商', short: '宝石商' }
};
export const FOUNTAIN = 7;
export const POLICE = 12;

// 場所の並べ方（4×4。左上から右へ、行ごと）
export const LAYOUTS = {
    // 短い道（ルールブックが最初の1回に勧める並び。よく組み合わせる場所が近い）
    short: [15, 5, 2, 14, 4, 12, 7, 3, 8, 6, 11, 9, 13, 10, 1, 16],
    // 番号順（似た場所がまとまる）
    order: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16]
};
export const LAYOUT_NAMES = { short: '基本', order: '番号順', random: 'ランダム' };
// ランダムな並びの条件：噴水は真ん中の4マスのどれか。闇市と茶屋は3マス以上離す
export const CENTER_CELLS = [5, 6, 9, 10];

// 郵便局：4列 × 上下2段。はじめは郵便の印が上の段を隠していて、下の段が見えている
export const POST_OFFICE = [
    { top: { good: 'red' }, bottom: { good: 'green' } },
    { top: { lira: 2 }, bottom: { lira: 1 } },
    { top: { good: 'blue' }, bottom: { good: 'yellow' } },
    { top: { lira: 2 }, bottom: { lira: 1 } }
];

// 市場の需要タイル（売れる品物の数）
export const SMALL_DEMANDS = [
    { blue: 1, red: 1, green: 1, yellow: 2 },
    { blue: 1, red: 1, green: 2, yellow: 1 },
    { blue: 0, red: 1, green: 3, yellow: 1 },
    { blue: 0, red: 1, green: 2, yellow: 2 },
    { blue: 1, red: 0, green: 2, yellow: 2 }
];
export const LARGE_DEMANDS = [
    { blue: 2, red: 2, green: 1, yellow: 0 },
    { blue: 3, red: 1, green: 1, yellow: 0 },
    { blue: 2, red: 2, green: 0, yellow: 1 },
    { blue: 3, red: 1, green: 0, yellow: 1 },
    { blue: 2, red: 1, green: 1, yellow: 1 }
];
// 売った数（1〜5）ごとの売り上げ
export const SMALL_PAY = [0, 2, 5, 9, 14, 20];
export const LARGE_PAY = [0, 3, 7, 12, 18, 25];

// スルタンの宮殿：ルビーで覆われていないマスの品物を全部渡す。'any' は好きな品物
export const SULTAN_TRACK = ['blue', 'red', 'green', 'yellow', 'any', 'blue', 'red', 'green', 'yellow', 'any'];
// 1つ目のルビーに要るマスの数（2〜3人は5、4〜5人は4）。10マスまで買える
export const sultanStart = (count) => (count <= 3 ? 5 : 4);
export const SULTAN_MAX = 10;

// 宝石商：覆われていない一番大きい数のリラを払う。1つ目の値段（2人は15、3人は14、4〜5人は12）。23 まで買える
export const gemStart = (count) => (count === 2 ? 15 : count === 3 ? 14 : 12);
export const GEM_MAX = 23;

// 手押し車：はじめは品物ごとに2つまで。拡張1つで +1（3つまで）。3つ目でルビー
export const BASE_CAPACITY = 2;
export const MAX_EXTENSIONS = 3;
export const EXTENSION_COST = 7;

// モスクのタイル（色ごとの山。上から2・3・4・5個の品物が要る）
export const MOSQUE_OF = { red: 14, green: 14, blue: 15, yellow: 15 };
export const MOSQUE_TILES = { 14: ['red', 'green'], 15: ['blue', 'yellow'] };
export const mosqueStack = (count) => (count === 2 ? [2, 4] : count === 3 ? [2, 3, 4] : [2, 3, 4, 5]);
export const TILE_NAMES = {
    red: 'サイコロの直し',
    green: '倉庫で+1',
    blue: '5人目の助手',
    yellow: '助手の呼び戻し'
};
export const TILE_TEXTS = {
    red: '茶屋・闇市で、振ったあと1つのサイコロを4にするか、2つとも振り直せる',
    green: '倉庫で、2リラ払って好きな品物を1つ足せる',
    blue: 'すぐに5人目の助手が加わる',
    yellow: '自分の番に1回、2リラ払って助手を1人、商人のもとへ戻せる'
};

// ボーナスカード（26枚）
export const BONUS_CARDS = {
    good: { count: 4, name: '品物1つ', text: '好きな品物を1つ得る' },
    lira5: { count: 4, name: '5リラ', text: '5リラを得る' },
    move34: { count: 4, name: '遠くへ', text: '1〜2マスの代わりに3〜4マス動く' },
    stay: { count: 2, name: '居残り', text: '動かずに、今の場所でもう一度行動する（助手をもう1人置く）' },
    return: { count: 2, name: '助手を戻す', text: '置いてある助手を1人、商人のもとへ戻す' },
    family: { count: 2, name: '家族の帰還', text: '家族を警察署へ戻し、3リラかカード1枚を得る' },
    sultan2: { count: 2, name: '宮殿で2回', text: 'スルタンの宮殿で、行動をもう1回する' },
    post2: { count: 2, name: '郵便局で2回', text: '郵便局で、行動をもう1回する' },
    gem2: { count: 2, name: '宝石商で2回', text: '宝石商で、行動をもう1回する' },
    market: { count: 2, name: '何でも売る', text: '小市場で、需要と違う種類の品物も売れる' }
};

export const RUBY_TARGET = (count) => (count === 2 ? 6 : 5);
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
