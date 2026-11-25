/**
 * 駒の名前と棋譜の表記（日本将棋連盟の棋譜の書き方に合わせる）
 * - 「▲7六歩」「△同　歩」「▲2二角成」「▲3三桂不成」「▲5五角打」
 * - 同じ駒が2枚以上その升へ行けるときは、動きの「上・引・寄」、位置の「右・左」、まっすぐ上がる「直」で区別する
 */

import {
    SENTE, FU, KY, KE, GI, KI, KA, HI, OU, TO, NY, NK, NG, UM, RY,
    typeOf, rowOf, colOf, fileOf, rankOf, moveFrom, moveTo, isDrop, dropType, isPromote, canPromoteType, inZone
} from './rules.js';

// 盤に描く1文字（後手の玉は「王」）
export const PIECE_CHAR = {
    [FU]: '歩', [KY]: '香', [KE]: '桂', [GI]: '銀', [KI]: '金', [KA]: '角', [HI]: '飛', [OU]: '玉',
    [TO]: 'と', [NY]: '杏', [NK]: '圭', [NG]: '全', [UM]: '馬', [RY]: '龍'
};
export const pieceChar = (side, type) => (type === OU && side !== SENTE ? '王' : PIECE_CHAR[type]);

// 棋譜での名前
export const PIECE_NAME = {
    [FU]: '歩', [KY]: '香', [KE]: '桂', [GI]: '銀', [KI]: '金', [KA]: '角', [HI]: '飛', [OU]: '玉',
    [TO]: 'と', [NY]: '成香', [NK]: '成桂', [NG]: '成銀', [UM]: '馬', [RY]: '龍'
};

export const ZEN = ['', '１', '２', '３', '４', '５', '６', '７', '８', '９'];
export const KAN = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
export const SIDE_MARK = ['▲', '△'];
export const SIDE_NAME = ['先手', '後手'];

export const squareName = (sq) => `${ZEN[fileOf(sq)]}${KAN[rankOf(sq)]}`;

// 局面 pos（指す前）で手 m を棋譜の文字にする。prevTo は直前の手の行き先（「同」に使う）
export function moveText(pos, m, prevTo = null) {
    const us = pos.side;
    const to = moveTo(m);
    const place = to === prevTo ? '同' : squareName(to);
    const legal = pos.legalMoves();
    if (isDrop(m)) {
        const type = dropType(m);
        // 盤の同じ駒もその升へ行けるときだけ「打」を付ける
        const alsoMove = legal.some(x => !isDrop(x) && moveTo(x) === to && pos.board[moveFrom(x)] === us * 16 + type);
        return `${SIDE_MARK[us]}${join(place, PIECE_NAME[type])}${alsoMove ? '打' : ''}`;
    }
    const from = moveFrom(m);
    const p = pos.board[from];
    const type = typeOf(p);
    const others = [...new Set(legal.filter(x => !isDrop(x) && moveTo(x) === to && moveFrom(x) !== from && pos.board[moveFrom(x)] === p).map(moveFrom))];
    const rel = others.length ? relative(us, type, from, to, others) : '';
    const promo = isPromote(m) ? '成' : canPromoteType(type) && (inZone(us, from) || inZone(us, to)) ? '不成' : '';
    return `${SIDE_MARK[us]}${join(place, PIECE_NAME[type])}${rel}${promo}`;
}

const join = (place, name) => (place === '同' && name.length === 1 ? `同　${name}` : `${place}${name}`);

// 指す側から見た向き：上がる（前）が負、右が大きい
function relative(us, type, from, to, others) {
    const sign = us === SENTE ? 1 : -1;
    const dy = (f) => Math.sign((rowOf(to) - rowOf(f)) * sign);
    const x = (f) => colOf(f) * sign;
    const vertical = (f) => (dy(f) < 0 ? '上' : dy(f) > 0 ? '引' : '寄');
    // まっすぐ上がる手は「直」（龍・馬には使わない）
    if (type !== RY && type !== UM && dy(from) < 0 && colOf(from) === colOf(to)) return '直';
    if (others.every(f => vertical(f) !== vertical(from))) return vertical(from);
    const side = (group) => {
        if (group.every(f => x(f) < x(from))) return '右';
        if (group.every(f => x(f) > x(from))) return '左';
        return '';
    };
    const alone = side(others);
    if (alone) return alone;
    // 左右だけでは分からないときは、同じ動きの駒の中の左右と、動きを合わせる
    const same = others.filter(f => vertical(f) === vertical(from));
    return `${side(same)}${vertical(from)}`;
}
