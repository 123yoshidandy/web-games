/**
 * プレイヤーに送るビュー（JSON にできる形）
 * 隠すのは山札の並びだけ（めくったカードと、全員の紙は見せ合ってよい）
 * 画面と CPU はビューだけを見て判断する。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { CARDS, PLANS, SOLO_CARD } from './cards.js';

export function createGameView(game, seat, { since = 0, events = true, scores = true } = {}) {
    const results = scores ? (game.results ?? game.scores()) : null;
    return {
        you: seat,
        solo: game.solo,
        turnNo: game.turnNo,
        phase: game.phase,
        level: game.options.level,
        actors: game.actors(),
        // 1人のときは3枚のカード（番号と効果）、2人以上のときは3つの組み合わせ（効果は前に番号だったカードの裏）
        cards: game.solo ? game.drawn.map(id => ({ n: CARDS[id].n, e: CARDS[id].e })) : null,
        combos: game.combos(),
        // 山札の残り（1人のときは、終わりまでの目安になる）
        deckLeft: game.solo ? game.deck.filter(id => id !== SOLO_CARD).length : game.stacks.reduce((sum, s) => sum + s.length, 0),
        plans: game.plans.map((id, k) => ({
            ...structuredClone(PLANS[id]),
            claimed: game.planClaimed[k] || game.approved
        })),
        canAskReshuffle: game.canAskReshuffle(),
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            sheet: structuredClone(p.sheet),
            plans: structuredClone(p.plans),
            turn: structuredClone(p.turn),
            canUndo: p.log.length > 0,
            mustRefuse: game.phase === 'end' ? false : game.mustRefuse(p),
            done: p.done,
            score: results ? results[p.id] : null
        })),
        winners: [...game.winners],
        endReason: game.endReason,
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: events ? game.events.map(e => structuredClone(e)) : []
    };
}
