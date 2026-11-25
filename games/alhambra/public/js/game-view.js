/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * 手持ちのお金は本人にだけ見せる（相手は枚数だけ）。お金の山札と建物の袋の並びは入れず、枚数だけ
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { CURRENCIES } from './game.js';
import { countTypes, longestWall } from './layout.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const actor = game.actors()[0];
    const mine = seat !== null && actor === seat;
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            handCount: p.hand.length,
            hand: p.id === seat ? p.hand.map(id => ({ ...game.card(id) })) : null,
            layout: { ...p.layout },
            reserve: [...p.reserve],
            score: p.score,
            rounds: structuredClone(p.rounds),
            counts: countTypes(p.layout),
            wall: longestWall(p.layout)
        })),
        dirk: game.dirk ? { tiles: [...game.dirk.tiles], counts: game.dirkCounts(), score: game.dirk.score, rounds: structuredClone(game.dirk.rounds) } : null,
        market: game.market.map((tile, slot) => ({ tile, currency: CURRENCIES[slot] })),
        moneyMarket: game.moneyMarket.map(id => (id === null || id === undefined ? null : { ...game.card(id) })),
        bagCount: game.bag.length,
        deckCount: game.deck.length,
        current: game.current,
        actor: actor ?? null,
        phase: game.phase,
        turn: game.turn,
        actionsTaken: game.phase === 'action' ? game.actionsTaken : 0,
        // 自分が置く建物（手番の終わりの、買った建物か、終わりに受け取った建物）
        toPlace: mine && game.phase === 'place' ? [...game.bought] : mine && game.phase === 'final' ? [game.finalQueue[0].tile] : [],
        canEnd: mine && game.phase === 'action' && (game.actionsTaken > 0 || game.moneyMarket.every(id => id === null)),
        roundsScored: game.roundsScored,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => structuredClone(event))
    };
}
