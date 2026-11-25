/**
 * 画家・競りの種類・カードの内訳・配る枚数
 *
 * 画家は Hans im Glück 版（1992）の5人。盤の左から順に並べ、順位の同数はこの順（左ほど上）で決める
 * 画家ごとの競りの種類の枚数は、有志の実装（brdgme・welol5 ほか）の多数の値を採った（README に書く）
 */

export const ARTISTS = [
    { id: 'lite', name: 'ライト・メタル', short: 'メタル', color: '#e8b830', deep: '#8a6a10' },
    { id: 'yoko', name: 'ヨーコ', short: 'ヨーコ', color: '#5aa057', deep: '#2f6430' },
    { id: 'christin', name: 'クリスティン・P', short: 'クリスP', color: '#d9577a', deep: '#86283f' },
    { id: 'karl', name: 'カール・ギッター', short: 'カール', color: '#3f74c9', deep: '#1f3f7a' },
    { id: 'krypto', name: 'クリプト', short: 'クリプト', color: '#b48a5e', deep: '#654527' }
];

export const TYPES = {
    open: { name: '公開', text: '順に値を上げていき、ほかの全員が降りたら、いちばん高い人が買う' },
    once: { name: '一声', text: '出した人の左から1人1回だけ、前より高い値を言うか降りる。出した人が最後' },
    sealed: { name: '入札', text: '全員が同時に値を握り、いちばん高い人が買う。同額なら出した人から時計回りで近い人' },
    fixed: { name: '指値', text: '出した人が値を決め、左から順に買うか断る。全員断ったら出した人が買う' },
    double: { name: 'ダブル', text: '同じ画家のダブルでないカードを1枚足し、2枚まとめて、足したカードの方法で競る' }
};
export const TYPE_IDS = ['open', 'once', 'sealed', 'fixed', 'double'];

// 画家ごとの [公開, 一声, 入札, 指値, ダブル] の枚数（12・13・14・15・16 枚、計70枚）
export const DISTRIBUTION = [
    [3, 3, 2, 2, 2],
    [3, 2, 3, 3, 2],
    [3, 3, 3, 3, 2],
    [3, 3, 3, 3, 3],
    [4, 3, 3, 3, 3]
];

// カードは 0〜69 の番号で持つ。番号から画家と競りの種類が決まる
export const CARDS = DISTRIBUTION.flatMap((counts, artist) => counts.flatMap((n, t) => {
    const list = Array.from({ length: n }, () => ({ artist, type: TYPE_IDS[t] }));
    return list;
})).map((card, id) => ({ id, ...card }));
// 同じ画家の何枚目か（絵を描き分けるのに使う）
CARDS.forEach(card => { card.index = CARDS.filter(c => c.artist === card.artist && c.id < card.id).length; });

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 5;
export const START_MONEY = 100;
export const ROUNDS = 4;
export const END_COUNT = 5;            // ある画家の5枚目が出たら、その回は終わり
export const PLACE_VALUES = [30, 20, 10];

// 人数ごと・回ごとに配る枚数
export const DEAL = { 3: [10, 6, 6, 0], 4: [9, 4, 4, 0], 5: [8, 3, 3, 0] };
