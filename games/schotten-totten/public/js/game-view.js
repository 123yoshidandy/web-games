/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 相手の手札は枚数だけ。戦術カードは裏の絵柄が違うので、そのうち何枚が戦術カードかは見せる
 * - 山札は枚数だけ。新兵募集で引いたカードと、引いたカードは本人にだけ見せる
 * - claimable：見る人が今主張できる石（場に出ているカードだけで判定するので、隠れた情報は漏れない）
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { isTactic, stoneSize } from './game.js';
import { bestFormation } from './formation.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    return {
        you: seat,
        tactics: game.options.tactics,
        handSize: game.handSize,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            handCount: p.hand.length,
            tacticsInHand: p.hand.filter(isTactic).length,
            hand: p.id === seat ? [...p.hand] : null,
            tacticsPlayed: p.tacticsPlayed,
            jokerPlayed: p.jokerPlayed,
            stones: game.stones.filter(s => s.owner === p.id).length
        })),
        stones: game.stones.map(stone => ({
            sides: stone.sides.map(side => side.map(x => ({ ...x }))),
            modes: [...stone.modes],
            completed: [...stone.completed],
            owner: stone.owner,
            size: stoneSize(stone),
            strengths: stone.sides.map(side => (side.length >= stoneSize(stone) ? bestFormation(side, stoneSize(stone), undefined, stone.modes.includes('blind')) : -1))
        })),
        claimable: seat === null ? [] : game.stones.map((_, i) => i).filter(i => game.claimCheck(seat, i) === true),
        canPlaceClan: seat === null ? false : game.canPlaceClan(seat),
        discards: [...game.discards],
        deckCount: game.deck.length,
        tacticDeckCount: game.tacticDeck.length,
        current: game.current,
        actor: game.actor(),
        phase: game.phase,
        turn: game.turn,
        winner: game.winner,
        winReason: game.winReason,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => hideEvent(event, seat)) : []
    };
}

function hideEvent(event, seat) {
    if (event.seat === seat) return structuredClone(event);
    if (event.type === 'draw') return { ...event, card: event.from === 'tactic' ? 'tactic' : null };
    if (event.type === 'recruit') return { ...event, drawn: event.drawn.map(card => (isTactic(card) ? 'tactic' : null)) };
    if (event.type === 'return') return { ...event, cards: event.cards.map(card => (isTactic(card) ? 'tactic' : null)) };
    return structuredClone(event);
}
