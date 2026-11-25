/**
 * プレイヤーに送るビュー（JSON にできる形）
 * 隠すもの：ほかの人の手札と目的地（枚数だけ見せる。終わったら目的地は見せる）、山の並び、ほかの人が選んでいる目的地
 * 画面と CPU はビューだけを見て判断する。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { LOCO, COLORS } from './map.js';

export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const over = game.isOver();
    const scores = over ? game.results : game.scores();
    return {
        you: seat,
        phase: game.phase,
        level: game.options.level,
        current: game.current,
        actors: game.actors(),
        drewOne: game.drewOne,
        lastPlayer: game.lastPlayer,
        faceUp: [...game.faceUp],
        deckCount: game.deck.length,
        discardCount: game.discard.length,
        ticketDeckCount: game.ticketDeck.length,
        claimed: [...game.claimed],
        players: game.players.map(p => {
            const mine = p.id === seat;
            const handCount = [...COLORS, LOCO].reduce((sum, c) => sum + p.hand[c], 0);
            const s = scores[p.id];
            return {
                id: p.id,
                name: p.name,
                isCPU: p.isCPU,
                trains: p.trains,
                points: p.points,
                routes: [...p.routes],
                handCount,
                ticketCount: p.tickets.length,
                choosing: !!p.offered,
                hand: mine ? { ...p.hand } : null,
                tickets: mine || over ? [...p.tickets] : null,
                offered: mine && p.offered ? [...p.offered] : null,
                // 目的地の点は、本人と、終わったあとだけ
                score: mine || over ? { ...s } : { routes: s.routes, longest: s.longest, bonus: s.bonus }
            };
        }),
        winners: [...game.winners],
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: events ? game.events.map(e => structuredClone(e)) : []
    };
}
