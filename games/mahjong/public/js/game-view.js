/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 手牌は本人だけ。ほかの人は枚数だけ（和了やテンパイで見せる手は、局の結果に入る）
 * - 牌山の並びと王牌は見せない。見えているドラ表示牌だけ（裏ドラは、立直で和了した局の結果に入る）
 * 画面と CPU は、このビューだけを見て決める
 */

import { toCounts } from './tiles.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const h = game.h;
    const me = seat ?? null;
    const view = {
        you: me,
        phase: game.phase,
        length: game.options.length,
        round: { ...game.round },
        dealer: game.dealer,
        roundWind: game.roundWind,
        handNo: game.handNo,
        wallCount: h.wall.length,
        doraIndicators: game.doraIndicators(),
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            score: p.score,
            seatWind: game.seatWind(p.id),
            riichi: h.riichi[p.id],
            riichiPending: h.riichiPending?.seat === p.id,
            handCount: h.hands[p.id].length,
            hand: p.id === me ? [...h.hands[p.id]].sort((a, b) => a - b) : null,
            drawn: p.id === me ? h.drawn : null,
            melds: structuredClone(h.melds[p.id]),
            discards: structuredClone(h.discards[p.id])
        })),
        turn: game.phase === 'turn' || game.phase === 'call' ? h.turn : null,
        // 自分の番で、ツモった牌があるか（鳴いたあとは false）
        drew: h.drawn !== null,
        call: game.phase === 'call' ? { tile: h.call.tile, from: h.call.from, kind: h.call.kind } : null,
        pendingKakan: h.pendingKakan ? { ...h.pendingKakan } : null,
        lastDiscard: h.lastDiscard ? { ...h.lastDiscard } : null,
        options: me !== null ? game.optionsFor(me) : null,
        waiting: game.actors().filter(s => s !== me),
        me: me !== null ? {
            waits: h.hands[me].length % 3 === 1 ? game.waits(me) : [],
            furiten: h.hands[me].length % 3 === 1 ? game.isFuriten(me) : false
        } : null,
        result: game.result ? structuredClone(game.result) : null,
        final: game.final ? structuredClone(game.final) : null,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => ({ ...event })) : []
    };
    view.seen = seenCounts(view);
    return view;
}

// 見えている牌の枚数（自分の手・全員の捨て牌と鳴き・ドラ表示牌）。CPU の安全度と受け入れの数に使う
function seenCounts(view) {
    const ids = [...view.doraIndicators];
    view.players.forEach(p => {
        if (p.hand) ids.push(...p.hand);
        p.discards.forEach(d => { if (!d.called) ids.push(d.tile); });
        p.melds.forEach(m => ids.push(...m.tiles));
    });
    return toCounts(ids);
}
