/**
 * 宣言の順位（盤の30マス）と数え方。ゲーム・CPU・画面で共有する
 *
 * 盤は30マス。数の1〜20の間に、3マスに1つ星のマスがある（星 k は、数 2k−1 と数 2k の間）
 *   1, ★1, 2, 3, ★2, 4, 5, ★3, 6, 7, ★4, 8, …, 19, ★10, 20
 * 宣言を上げるには、盤のより先のマスへ進む（目は自由。低い目でもよい）か、同じ数のマスのまま目を上げる
 * 数の宣言は、その目と星（何の目にもなる）を合わせた数。星の宣言は、星だけの数
 */

export const STAR = 6;              // 星の目（1〜5 の次に並べる）
export const FACES = [1, 2, 3, 4, 5];
export const MAX_QTY = 20;
export const MAX_STARS = 10;
export const DICE_PER_PLAYER = 5;

// 盤の位置（1〜30）
export const position = (bid) => (bid.face === STAR ? 3 * bid.qty - 1 : bid.qty + Math.floor(bid.qty / 2));

// 盤の30マス（位置の順）
export const FIELDS = Array.from({ length: 30 }, (_, k) => {
    const pos = k + 1;
    if (pos % 3 === 2) return { pos, star: true, qty: (pos + 1) / 3 };
    return { pos, star: false, qty: pos - Math.floor(pos / 3) };
});

export function isValidBid(bid) {
    if (!bid || typeof bid !== 'object' || !Number.isInteger(bid.qty) || !Number.isInteger(bid.face)) return false;
    if (bid.face === STAR) return bid.qty >= 1 && bid.qty <= MAX_STARS;
    return FACES.includes(bid.face) && bid.qty >= 1 && bid.qty <= MAX_QTY;
}

// next が prev より上の宣言か（prev が null なら、どの宣言でもよい）
export function isRaise(prev, next) {
    if (!isValidBid(next)) return false;
    if (!prev) return true;
    const a = position(prev);
    const b = position(next);
    if (b > a) return true;
    return b === a && prev.face !== STAR && next.face !== STAR && next.qty === prev.qty && next.face > prev.face;
}

// prev より上の宣言を、盤の順に全部
export function legalBids(prev) {
    const list = [];
    for (const f of FIELDS) {
        if (f.star) {
            const bid = { qty: f.qty, face: STAR };
            if (isRaise(prev, bid)) list.push(bid);
        } else {
            for (const face of FACES) {
                const bid = { qty: f.qty, face };
                if (isRaise(prev, bid)) list.push(bid);
            }
        }
    }
    return list;
}

// そのダイスが宣言に数えられるか
export const matches = (value, face) => (face === STAR ? value === STAR : value === face || value === STAR);

export const bidText = (bid) => (bid.face === STAR ? `★×${bid.qty}` : `${bid.face}×${bid.qty}`);
