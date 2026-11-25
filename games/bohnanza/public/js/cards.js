/**
 * ボーナンザ（基本ゲーム）のデータ：豆の種類・枚数・売値の表（何枚で何金）と、人数ごとの違い
 * 枚数と表は README の「資料」に書いた資料で照らし合わせた
 */

// steps：1金・2金・3金・4金になる枚数（null はその金額がない）
export const BEANS = {
    coffee: { name: 'コーヒー', count: 24, steps: [4, 7, 10, 12], color: '#6b4428' },
    wax: { name: 'ワックス', count: 22, steps: [4, 7, 9, 11], color: '#e6cf5c' },
    blue: { name: 'ブルー', count: 20, steps: [4, 6, 8, 10], color: '#3f73c4' },
    chili: { name: 'チリ', count: 18, steps: [3, 6, 8, 9], color: '#d8402b' },
    stink: { name: 'くさい', count: 16, steps: [3, 5, 7, 8], color: '#8c8f3b' },
    green: { name: 'グリーン', count: 14, steps: [3, 5, 6, 7], color: '#3f9a45' },
    soy: { name: '大豆', count: 12, steps: [2, 4, 6, 7], color: '#d6bf86' },
    blackEyed: { name: '黒目', count: 10, steps: [2, 4, 5, 6], color: '#efe7d2' },
    red: { name: '赤', count: 8, steps: [2, 3, 4, 5], color: '#9e1f2c' },
    garden: { name: 'ガーデン', count: 6, steps: [null, 2, 3, null], color: '#9fd06a' },
    cocoa: { name: 'カカオ', count: 4, steps: [null, 2, 3, 4], color: '#4a2a1a' }
};
export const BEAN_TYPES = Object.keys(BEANS);

export const MIN_PLAYERS = 3;
export const MAX_PLAYERS = 5;
export const HAND_START = 5;
export const DRAW_FACE_UP = 2;
export const DRAW_END = 3;
export const FIELD_PRICE = 3;
export const MAX_OFFERS = 8;   // 1つの手番に、1人が出せる提案の数（終わらない交渉を防ぐ）

// 人数ごとの違い：3人はカカオを抜き、最初から3つ目の畑。山が2回なくなったら終わり。4〜5人はコーヒーを抜く。山が3回なくなったら終わり
export function setupFor(n) {
    if (n === 3) return { types: BEAN_TYPES.filter(t => t !== 'cocoa'), thirdField: true, canBuyField: false, exhaustLimit: 2 };
    return { types: BEAN_TYPES.filter(t => t !== 'coffee'), thirdField: false, canBuyField: true, exhaustLimit: 3 };
}

// n 枚を売ったときの金
export function coinsFor(type, n) {
    let coins = 0;
    BEANS[type].steps.forEach((need, i) => {
        if (need !== null && n >= need) coins = i + 1;
    });
    return coins;
}

// 次の金額まであと何枚か（もう上がらなければ null）
export function nextStep(type, n) {
    const now = coinsFor(type, n);
    const next = BEANS[type].steps.find((need, i) => need !== null && i + 1 > now);
    return next === undefined ? null : next - n;
}

// この豆を植えられる畑（同じ種類の畑があればそこだけ、なければ空いた畑）。fields：[null | { type, n }]
export function legalFieldsFor(fields, type) {
    const same = fields.map((f, i) => (f && f.type === type ? i : -1)).filter(i => i >= 0);
    if (same.length) return same;
    return fields.map((f, i) => (f ? -1 : i)).filter(i => i >= 0);
}

// 売れる畑か（1枚だけの畑は、ほかに2枚以上の畑があれば売れない。空いた畑は数えない）
export function canHarvestField(fields, i) {
    const f = fields[i];
    if (!f) return false;
    if (f.n >= 2) return true;
    return fields.every(g => !g || g.n <= 1);
}
