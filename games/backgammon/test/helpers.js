// 盤を短い記法から作る：side({ 13: 1, 1: 14 }) は、自分から見て 13 に1個・1 に14個（25 はバー、0 はベアオフ済み）
export function side(map) {
    const a = new Array(26).fill(0);
    for (const [k, v] of Object.entries(map)) a[Number(k)] = v;
    return a;
}

export const board = (me, opp) => [side(me), side(opp)];

// ゲームの盤とダイスを差し替えて、p が動かす番にする
export function setMove(game, b, dice, p = 0) {
    const s = game.state;
    s.board = b;
    s.dice = dice;
    s.turn = p;
    s.phase = 'move';
    s.legalCache = null;
}
