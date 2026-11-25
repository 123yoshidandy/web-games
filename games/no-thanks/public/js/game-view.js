/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - チップの数は本人だけ（公式ルールで伏せる）。終わったら全員分を見せる
 * - 除いた9枚と山札の並びは見せない（山札は枚数だけ）。終わったら除いた9枚を見せる
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { cardPoints, chipsFor } from './game.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const over = game.isOver();
    return {
        you: seat,
        startChips: chipsFor(game.players.length),
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            cards: [...p.cards],
            cardPoints: cardPoints(p.cards),
            chips: over || p.id === seat ? p.chips : null
        })),
        current: game.current,
        pot: game.pot,
        deckCount: game.deck.length,
        turn: game.phase === 'play' ? game.turn : null,
        phase: game.phase,
        winners: [...game.winners],
        results: over ? game.results() : null,
        removed: over ? [...game.removed] : null,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => structuredClone(event)) : []
    };
}
