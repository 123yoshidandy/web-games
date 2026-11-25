/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 手札の中身と並びは本人だけ。ほかの人には枚数だけ
 * - 山は枚数だけ。捨て札は枚数と一番上
 * - 畑・金の枚数・もらって植える前の豆・表のカードは全員に見せる
 * - 提案は、動くカードの種類を全員に見せる（実物を見せて出すため）。手札の位置は提案した本人にだけ入れる
 * - シードは入れない
 * CPU もこのビューだけを見て決める（cpu-player.js）
 */

import { MAX_OFFERS } from './cards.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか（CPU には要らない）
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const offer = game.offer;
    return {
        you: seat,
        phase: game.phase,
        turn: game.turn,
        active: game.active,
        actors: game.actors(),
        deckCount: game.deck.length,
        discardCount: game.discard.length,
        discardTop: game.discard.at(-1) ?? null,
        exhausted: game.exhausted,
        exhaustLimit: game.setup.exhaustLimit,
        canBuyField: game.setup.canBuyField,
        types: [...game.setup.types],
        faceUp: [...game.faceUp],
        offer: offer ? {
            from: offer.from,
            to: offer.to,
            ...game.offerCards(offer),
            wantFaceUp: [...offer.want.faceUp],
            wantTypes: { ...offer.want.types },
            giveHand: offer.from === seat ? [...offer.give.hand] : null
        } : null,
        passed: [...game.passed],
        offersLeft: game.players.map(p => MAX_OFFERS - (game.offers[p.id] ?? 0)),
        turnOffers: structuredClone(game.turnOffers),
        endAfterTurn: game.endAfterTurn,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            handCount: p.hand.length,
            hand: p.id === seat ? [...p.hand] : null,
            fields: p.fields.map(f => (f ? { ...f } : null)),
            coins: p.coins.length,
            toPlant: [...p.toPlant]
        })),
        planted: game.planted,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        commandCount: game.commands.length,
        events: events ? game.events.map(event => structuredClone(event)) : []
    };
}
