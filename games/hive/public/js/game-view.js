/**
 * 見る人ごとの見え方
 * ハイブには隠す情報がない。見る人の手番なら、通る手の一覧も付ける（画面で、置ける場所・動かせる先を出すため）
 * seat が null なら観戦者
 */

import { queenSurround } from './rules.js';

export function createGameView(game, seat, { since = 0 } = {}) {
    const s = game.state;
    const mine = seat !== null && game.current === seat;
    return {
        seat,
        current: game.current,
        first: game.first,
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU, color: p.color,
            hand: { ...s.hands[p.color] },
            turns: s.turns[p.color],
            surround: queenSurround(s.board, p.color)
        })),
        board: Object.fromEntries(Object.entries(s.board).map(([k, stack]) => [k, stack.map(p => ({ ...p }))])),
        lastMoved: s.lastMoved,
        frozen: s.frozen,
        options: { ...game.options },
        actions: mine ? game.legalActions().map(a => ({ ...a })) : [],
        over: game.isOver(),
        winner: game.winner,
        result: s.result ? { ...s.result } : null,
        logs: [...game.logs],
        events: game.events.filter(e => e.seq > since).map(e => ({ ...e })),
        eventSeq: game.eventSeq,
        lastError: game.lastError
    };
}
