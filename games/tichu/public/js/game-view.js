/**
 * 見る人ごとの見え方（秘密の情報を隠したもの）
 * ほかの人の手札は枚数だけ。渡した札は、渡した本人ともらった本人にだけ見える
 * 見る人が出す番なら出せる組を、番でなくても場に勝てる爆弾を付ける（画面で候補を出すため）
 * seat が null なら観戦者
 */

import { pointsOf, enumerateCombos } from './cards.js';

const comboOut = (c) => ({ type: c.type, rank: c.rank, length: c.length, cards: [...c.cards] });

export function createGameView(game, seat, { since = 0 } = {}) {
    const me = seat !== null;
    const playing = game.phase === 'play';
    let options = null;
    let bombs = [];
    if (me && playing && game.active(seat)) {
        if (game.current === seat) {
            const o = game.playOptions(seat);
            options = { combos: o.combos.map(comboOut), mustPlay: o.mustPlay, wishBound: o.wishBound };
        }
        const top = game.top()?.combo;
        if (top && game.current !== seat) bombs = enumerateCombos(game.hands[seat], top).filter(c => c.type === 'bomb').map(comboOut);
    }
    return {
        seat,
        phase: game.phase,
        round: game.round,
        current: game.current,
        target: game.options.target,
        scores: [...game.scores],
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU,
            count: game.hands[p.id].length,
            call: game.calls[p.id],
            grandDecided: game.grandDecided[p.id],
            exchanged: !!game.exchange[p.id],
            played: game.played[p.id],
            wonPoints: pointsOf(game.won[p.id]),
            wonCount: game.won[p.id].length,
            place: game.finished.indexOf(p.id) + 1 || null
        })),
        hand: me ? [...game.hands[seat]] : null,
        myExchange: me && game.exchange[seat] ? [...game.exchange[seat]] : null,
        received: me && game.received[seat] ? { ...game.received[seat] } : null,
        table: game.table.map(t => ({ seat: t.seat, combo: comboOut(t.combo) })),
        wish: game.wish,
        dragonFrom: game.dragonFrom,
        dragonPoints: game.pendingTrick ? pointsOf(game.pendingTrick) : null,
        canTichu: me ? game.canCallTichu(seat) : false,
        options,
        bombs,
        rounds: game.rounds.map(r => structuredClone(r)),
        winner: game.winner,
        logs: [...game.logs],
        // 出来事には秘密がない（出した札は表向き。渡した札は出来事に入れていない）
        events: game.events.filter(e => e.seq > since).map(e => structuredClone(e)),
        eventSeq: game.eventSeq,
        lastError: game.lastError
    };
}
