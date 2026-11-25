/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 役割は自分の分だけ（ラウンドの終わりの roundEnd イベントで全員の分を明かす）
 * - 手札は自分の分だけ（ほかの人は枚数）。山札の並び・捨てたカードの中身は見せない
 * - 伏せたゴールの中身は見せない。地図で見た中身は、見た本人にだけ見せる
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { GOAL_CARDS } from './cards.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const me = seat === null ? null : game.players[seat];
    return {
        you: seat,
        role: me ? me.role : null,
        hand: me ? [...me.hand] : [],
        knownGoals: me ? { ...me.knownGoals } : {},
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            handCount: p.hand.length,
            broken: [...p.broken],
            gold: p.gold
        })),
        board: Object.fromEntries(Object.entries(game.board).map(([k, cell]) => [k, { ...cell }])),
        goals: game.goals.map(g => ({ pos: [...g.pos], revealed: g.revealed, rotated: g.rotated, gold: g.revealed ? GOAL_CARDS[g.card].gold : null, card: g.revealed ? g.card : null })),
        deckCount: game.deck.length,
        round: game.round,
        current: game.current,
        phase: game.phase,
        winners: [...game.winners],
        history: structuredClone(game.history),
        logs: game.logs.slice(Math.max(0, since)).map(l => ({ ...l })),
        logCount: game.logs.length,
        events: events ? game.events.map(event => hideEvent(event, seat)) : []
    };
}

// 自分の役割だけ、自分が捨てたカードだけ、自分が地図で見た中身だけを見せる
function hideEvent(event, seat) {
    if (event.type === 'deal') {
        const { roles, ...rest } = event;
        return { ...structuredClone(rest), role: seat === null ? null : roles[seat] };
    }
    if (event.type === 'discard' && event.seat !== seat) return { ...structuredClone(event), card: null };
    if (event.type === 'map' && event.seat !== seat) return { ...structuredClone(event), gold: null };
    return structuredClone(event);
}
