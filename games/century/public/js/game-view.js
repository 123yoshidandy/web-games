/**
 * 見る人ごとの見え方（秘密の情報を隠したもの）
 * 山の並びと、他の人の手札（まだ使っていないカード）は見せない。使用済みのカードは表向きなので見せる
 * seat が null なら観戦者（だれの手札も見えない）
 */

import { scoreOf, endCount } from './game.js';

export function createGameView(game, seat, { since = 0 } = {}) {
    const over = game.isOver();
    return {
        seat,
        phase: game.phase,
        current: game.current,
        first: game.first,
        turn: game.turn,
        lastRound: game.lastRound,
        endCount: endCount(game.players.length),
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU,
            hand: p.id === seat || over ? [...p.hand] : null,
            handCount: p.hand.length,
            played: [...p.played],
            caravan: [...p.caravan],
            points: [...p.points],
            gold: p.gold, silver: p.silver,
            // 得点は公開情報（香辛料・得点カード・硬貨）から求まる
            score: scoreOf(p)
        })),
        market: game.market.map(m => ({ card: m.card, spices: [...m.spices] })),
        deckCount: game.deck.length,
        pointRow: [...game.pointRow],
        pointDeckCount: game.pointDeck.length,
        coins: { ...game.coins },
        coinSlots: [game.coinAt(0), game.coinAt(1)],
        results: game.results ? game.results.map(r => ({ ...r })) : null,
        winner: game.winner,
        logs: [...game.logs],
        // 出来事には秘密がない（出したカード・取ったカードは、だれにでも見える）
        events: game.events.filter(e => e.seq > since).map(e => structuredClone(e)),
        eventSeq: game.eventSeq,
        lastError: game.lastError
    };
}
