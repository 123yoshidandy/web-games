/**
 * ドブルの山札（DOM に依存しない）
 *
 * 位数 7 の有限射影平面から作る。点がマーク（57 個）、直線がカード（57 枚）で、
 * 1本の直線には 8 個の点があり、どの2本の直線もちょうど1点で交わる（＝どの2枚のカードも、同じマークがちょうど1つ）
 * 原作の山札は 55 枚なので、最後の2枚を使わない（抜いても、残りのどの2枚にも同じマークがちょうど1つのまま）
 *
 * 点の番号：
 *   0〜48  … アフィン平面の点 (x, y)。番号は x * 7 + y
 *   49〜55 … 傾き m の方向の無限遠点（49 + m）
 *   56     … 縦の方向の無限遠点
 */

export const ORDER = 7;
export const SYMBOL_COUNT = ORDER * ORDER + ORDER + 1; // 57
export const SYMBOLS_PER_CARD = ORDER + 1;             // 8
export const DECK_SIZE = 55;

// 射影平面の直線をすべて（57 本。各直線は点の番号の昇順）
export function projectiveLines(n = ORDER) {
    const lines = [];
    // y = m x + b（傾き m の方向の無限遠点を通る）
    for (let m = 0; m < n; m++) {
        for (let b = 0; b < n; b++) {
            const line = [];
            for (let x = 0; x < n; x++) line.push(x * n + ((m * x + b) % n));
            line.push(n * n + m);
            lines.push(line.sort((p, q) => p - q));
        }
    }
    // x = c（縦の方向の無限遠点を通る）
    for (let c = 0; c < n; c++) {
        const line = [];
        for (let y = 0; y < n; y++) line.push(c * n + y);
        line.push(n * n + n);
        lines.push(line);
    }
    // 無限遠直線
    lines.push(Array.from({ length: n + 1 }, (_, i) => n * n + i));
    return lines;
}

// カード（0〜54）ごとのマーク
export const CARDS = projectiveLines().slice(0, DECK_SIZE);

// 2枚のカードに共通のマーク（ちょうど1つ。同じカードや範囲の外なら null）
export function commonSymbol(a, b) {
    if (a === b || !CARDS[a] || !CARDS[b]) return null;
    const other = CARDS[b];
    return CARDS[a].find(symbol => other.includes(symbol)) ?? null;
}

export const cardHas = (card, symbol) => Boolean(CARDS[card]?.includes(symbol));

// マークの名前（ログ・読み上げ用。絵は symbol-art.js）
export const SYMBOL_NAMES = [
    '太陽', '月', '星', 'ハート', '雪の結晶', '雲', 'かみなり', 'しずく', 'ほのお', '葉っぱ',
    '花', '木', 'キノコ', 'りんご', 'さくらんぼ', 'にんじん', '魚', '鳥', 'ねこ', 'かぎ',
    '錠前', '家', 'ベル', 'かさ', '王冠', '宝石', '爆弾', 'いかり', '時計', '電球',
    'めがね', '音符', '旗', 'ロケット', '車', 'はさみ', 'えんぴつ', 'マグカップ', 'ろうそく', '骨',
    '足あと', '目', 'サイコロ', 'スペード', 'クローバー', 'おばけ', '雪だるま', 'かなづち', '虫めがね', 'ボール',
    'アイス', '陰陽', 'サボテン', '風船', '的', '砂時計', 'てんとう虫'
];
