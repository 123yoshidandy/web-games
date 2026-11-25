/**
 * 牌の表し方
 * - 牌は 0〜135 の番号（id）で表す。同じ種類の4枚は id >> 2 が同じ
 * - 種類（kind）は 0〜33。0〜8 が萬子の1〜9、9〜17 が筒子、18〜26 が索子、27〜30 が東南西北、31〜33 が白發中
 * - 赤ドラは、5萬・5筒・5索の4枚のうち、id の下2ビットが 0 の1枚ずつ
 */

export const KIND_COUNT = 34;
export const TILE_COUNT = 136;
const RED_KINDS = [4, 13, 22];

export const kindOf = (id) => id >> 2;
export const isRed = (id) => (id & 3) === 0 && RED_KINDS.includes(id >> 2);
export const suitOf = (kind) => (kind < 27 ? Math.floor(kind / 9) : 3); // 0 萬子・1 筒子・2 索子・3 字牌
export const numberOf = (kind) => (kind < 27 ? (kind % 9) + 1 : 0);
export const isHonor = (kind) => kind >= 27;
export const isTerminal = (kind) => kind < 27 && (kind % 9 === 0 || kind % 9 === 8);
export const isYaochu = (kind) => isHonor(kind) || isTerminal(kind);
export const isSimple = (kind) => !isYaochu(kind);
export const isWind = (kind) => kind >= 27 && kind <= 30;
export const isDragon = (kind) => kind >= 31;
export const YAOCHU_KINDS = [0, 8, 9, 17, 18, 26, 27, 28, 29, 30, 31, 32, 33];

// ドラ表示牌の次の牌がドラ（数牌は 9 の次が 1、風牌は 北の次が東、三元牌は 中の次が白）
export function doraFromIndicator(kind) {
    if (kind < 27) return kind % 9 === 8 ? kind - 8 : kind + 1;
    if (kind <= 30) return kind === 30 ? 27 : kind + 1;
    return kind === 33 ? 31 : kind + 1;
}

// 種類ごとの枚数（長さ34の配列）
export function toCounts(ids) {
    const counts = new Array(KIND_COUNT).fill(0);
    ids.forEach(id => { counts[kindOf(id)]++; });
    return counts;
}

const SUIT_CHARS = ['m', 'p', 's', 'z'];

const HONOR_NAMES = ['東', '南', '西', '北', '白', '發', '中'];

// 風の名前（東・南・西・北）
export const windName = (kind) => HONOR_NAMES[kind - 27];

// "123m406p77z" のような表記から牌の id を作る（テストと確認用）。0 は赤の5
// used を渡すと、同じ牌を二度使わない（ほかの手と分けて作るとき）
export function parseTiles(text, used = new Set()) {
    const ids = [];
    let digits = [];
    for (const ch of text.replace(/\s/g, '')) {
        if (/[0-9]/.test(ch)) {
            digits.push(Number(ch));
            continue;
        }
        const suit = SUIT_CHARS.indexOf(ch);
        if (suit < 0) throw new Error(`知らない文字: ${ch}`);
        digits.forEach(n => {
            const red = n === 0;
            const kind = suit === 3 ? 26 + n : suit * 9 + (red ? 5 : n) - 1;
            const copies = red ? [0] : RED_KINDS.includes(kind) ? [1, 2, 3, 0] : [0, 1, 2, 3];
            const copy = copies.find(c => !used.has(kind * 4 + c));
            if (copy === undefined) throw new Error(`${n}${ch} が足りません`);
            used.add(kind * 4 + copy);
            ids.push(kind * 4 + copy);
        });
        digits = [];
    }
    if (digits.length) throw new Error('種類の文字がありません');
    return ids;
}
