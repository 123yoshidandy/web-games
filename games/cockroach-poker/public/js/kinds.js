/**
 * カードの種類のデータ
 * 原作の虫は、見て不快にならないよう、おばけと夜の生き物に置き換えた（ルールは同じ。キーは保存したデータとオンラインのため、原作の虫の英名のまま）
 * 色はカードの地の色（絵は art.js）
 */

export const KINDS = {
    cockroach: { name: 'おばけ', color: '#5fa8d3' },
    rat: { name: 'ネズミ', color: '#7c8796' },
    bat: { name: 'コウモリ', color: '#7a5aa8' },
    fly: { name: 'カボチャ', color: '#34508f' },
    frog: { name: 'カエル', color: '#4f9a4a' },
    scorpion: { name: 'クロネコ', color: '#d9822b' },
    stinkbug: { name: 'フクロウ', color: '#a7a230' },
    spider: { name: 'ハリネズミ', color: '#d27a9a' }
};

export const KIND_ORDER = Object.keys(KINDS);
export const COPIES = 8;           // 1種類の枚数（8種×8枚＝64枚）
export const REMOVED_FOR_TWO = 10; // 2人のときに、伏せたまま除く枚数
export const LIMIT = 4;            // 同じ種類がこの枚数たまったら負け
export const LIMIT_FOR_TWO = 5;    // 2人のとき
