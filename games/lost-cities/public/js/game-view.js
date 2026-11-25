/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 相手の手札は枚数だけ。山札は枚数だけ。相手が山札から引いたカードの中身は見せない
 * - 探検と捨て場は、表向きに置かれたカードなので全部見せる
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { COLORS, expeditionScore } from './game.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            handCount: p.hand.length,
            hand: p.id === seat ? [...p.hand] : null,
            expeditions: Object.fromEntries(COLORS.map(c => [c, [...p.expeditions[c]]])),
            scores: Object.fromEntries(COLORS.map(c => [c, expeditionScore(p.expeditions[c])])),
            total: p.total
        })),
        discards: Object.fromEntries(COLORS.map(c => [c, [...game.discards[c]]])),
        deckCount: game.deck.length,
        justDiscarded: game.justDiscarded,
        round: game.round,
        rounds: game.options.rounds,
        current: game.current,
        phase: game.phase,
        winners: [...game.winners],
        history: structuredClone(game.history),
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => hideEvent(event, seat)) : []
    };
}

// 配った手札と、相手が山札から引いたカードは見せない
function hideEvent(event, seat) {
    if (event.type === 'deal') {
        const { hands, ...rest } = event;
        return { ...structuredClone(rest), hand: seat === null ? null : [...hands[seat]] };
    }
    if (event.type === 'draw' && event.from === 'deck' && event.seat !== seat) return { ...structuredClone(event), card: null };
    return structuredClone(event);
}
