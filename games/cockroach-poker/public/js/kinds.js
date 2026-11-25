/**
 * 虫（カードの種類）のデータ
 * 名前は日本語版の呼び方に合わせる。色はカードの地の色（絵は art.js）
 */

export const KINDS = {
    cockroach: { name: 'ゴキブリ', color: '#b0703f' },
    rat: { name: 'ネズミ', color: '#7c8796' },
    bat: { name: 'コウモリ', color: '#7a5aa8' },
    fly: { name: 'ハエ', color: '#3f86b8' },
    frog: { name: 'カエル', color: '#4f9a4a' },
    scorpion: { name: 'サソリ', color: '#d9822b' },
    stinkbug: { name: 'カメムシ', color: '#a7a230' },
    spider: { name: 'クモ', color: '#c64a5c' }
};

export const KIND_ORDER = Object.keys(KINDS);
export const COPIES = 8;           // 1種類の枚数（8種×8枚＝64枚）
export const REMOVED_FOR_TWO = 10; // 2人のときに、伏せたまま除く枚数
export const LIMIT = 4;            // 同じ虫がこの枚数たまったら負け
export const LIMIT_FOR_TWO = 5;    // 2人のとき
