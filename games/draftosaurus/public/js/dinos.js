/**
 * ルールのデータ：恐竜の種類、公園の場所（夏の面）、配置ダイスの面
 */

// 恐竜 6 種×10 個。色は自作の絵の色
export const SPECIES = {
    trex: { name: 'ティラノサウルス', short: 'ティラノ', color: '#e0533f', dark: '#86251a' },
    tri: { name: 'トリケラトプス', short: 'トリケラ', color: '#5fb04a', dark: '#2a5f1f' },
    stego: { name: 'ステゴサウルス', short: 'ステゴ', color: '#f08c2e', dark: '#8a4a0e' },
    brachio: { name: 'ブラキオサウルス', short: 'ブラキオ', color: '#3f8fd6', dark: '#1b4a78' },
    para: { name: 'パラサウロロフス', short: 'パラサウロ', color: '#f2c230', dark: '#7d5d05' },
    spino: { name: 'スピノサウルス', short: 'スピノ', color: '#a565d2', dark: '#55297a' }
};
export const SPECIES_KEYS = Object.keys(SPECIES);
export const PER_SPECIES = 10;

export const HAND_SIZE = 6;

/**
 * 人数ごとの決まり
 *   boxed：袋に入れずに箱に残す、1 種類あたりの数（5 人 60 匹・4 人 48 匹・3 人 36 匹・2 人 48 匹）
 *   rounds・turns：ラウンドの数と、1 ラウンドの手番の数
 *   discard：2 人のときは、手番ごとに 1 匹を置いたあと、もう 1 匹を箱に戻し、残りの手を交換する（4 ラウンド×3 手番）
 */
export function rulesFor(n) {
    if (n === 2) return { boxed: 2, rounds: 4, turns: 3, discard: true };
    return { boxed: { 3: 4, 4: 2, 5: 0 }[n], rounds: 2, turns: 6, discard: false };
}

/**
 * 公園の場所（夏の面）
 *   area：'woods' 森の側 / 'grass' 草原の側（ダイスの森・草原の面で使う）
 *   side：'left' 川の左（カフェの側）/ 'right' 川の右（トイレの側）
 *   capacity：置ける数（恋人の草原と川は上限なし）
 */
export const ZONES = {
    forest: { name: '同じ種類の森', short: '同じ森', area: 'woods', side: 'left', capacity: 6 },
    meadow: { name: '違う種類の草原', short: '違う草原', area: 'grass', side: 'right', capacity: 6 },
    love: { name: '恋人の草原', short: '恋人', area: 'grass', side: 'left', capacity: Infinity },
    trio: { name: '3匹の木', short: '3匹の木', area: 'woods', side: 'left', capacity: 3 },
    king: { name: '王の座', short: '王の座', area: 'woods', side: 'right', capacity: 1 },
    island: { name: 'ひとりぼっちの島', short: 'ひとり島', area: 'grass', side: 'right', capacity: 1 },
    river: { name: '川', short: '川', area: null, side: null, capacity: Infinity }
};
export const ZONE_KEYS = Object.keys(ZONES);
export const ENCLOSURES = ZONE_KEYS.filter(k => k !== 'river');

// 同じ種類の森・違う種類の草原の、匹数ごとの点（0〜6 匹）
export const FOREST_POINTS = [0, 2, 4, 8, 12, 18, 24];
export const MEADOW_POINTS = [0, 1, 3, 6, 10, 15, 21];
export const LOVE_PAIR_POINTS = 5;
export const TRIO_POINTS = 7;
export const KING_POINTS = 7;
export const ISLAND_POINTS = 7;
export const RIVER_POINTS = 1;
export const TREX_BONUS = 1;

// 配置ダイスの 6 面（text は画面の上の短い表示、long は遊び方の説明）
export const DIE_FACES = {
    woods: { name: '森', text: '森の側へ', long: '森の側（木の生えた側）の囲いに置く' },
    grass: { name: '草原', text: '草原の側へ', long: '草原の側の囲いに置く' },
    toilet: { name: 'トイレ', text: 'トイレの側へ', long: 'トイレの側（川の右）の囲いに置く' },
    cafe: { name: 'カフェ', text: 'カフェの側へ', long: 'カフェの側（川の左）の囲いに置く' },
    empty: { name: '空き', text: '空いた囲いへ', long: 'まだ 1 匹もいない囲いに置く' },
    notrex: { name: 'ティラノなし', text: 'ティラノのいない囲いへ', long: 'ティラノサウルスのいない囲いに置く' }
};
export const DIE_KEYS = Object.keys(DIE_FACES);
