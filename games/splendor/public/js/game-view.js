/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * 山札の並びは入れず、枚数だけ。伏せて予約したカードは、本人にだけ見せる（ほかの人にはレベルだけ）
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { CARDS, LEVELS, TOKEN_LIMIT, pointsOf, bonusesOf, countTokens } from './game.js';

// seat：見る人の席（null なら観戦者。伏せたカードはだれのものも見えない）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const players = game.players.map(p => ({
        id: p.id,
        name: p.name,
        isCPU: p.isCPU,
        tokens: { ...p.tokens },
        cards: [...p.cards],
        reserved: p.reserved.map(r => (r.hidden && p.id !== seat
            ? { id: null, hidden: true, level: CARDS[r.id].level }
            : { id: r.id, hidden: r.hidden, level: CARDS[r.id].level })),
        nobles: [...p.nobles],
        points: pointsOf(p),
        bonuses: bonusesOf(p)
    }));
    const me = seat === null ? null : game.players[seat];
    return {
        you: seat,
        players,
        bank: { ...game.bank },
        board: Object.fromEntries(LEVELS.map(level => [level, [...game.board[level]]])),
        deckCounts: Object.fromEntries(LEVELS.map(level => [level, game.decks[level].length])),
        nobles: [...game.nobles],
        current: game.current,
        startPlayer: game.startPlayer,
        turn: game.turn,
        phase: game.phase,
        finalRound: game.finalRound,
        winners: [...game.winners],
        endReason: game.endReason,
        // 自分の番で、宝石を返す・貴族を選ぶ必要があるとき
        discardCount: game.phase === 'discard' && seat === game.current ? countTokens(me.tokens) - TOKEN_LIMIT : 0,
        nobleChoices: game.phase === 'noble' && seat === game.current ? [...game.nobleChoices] : [],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => hideEvent(event, seat))
    };
}

// 伏せて予約したカードの中身は、本人以外には見せない
function hideEvent(event, seat) {
    if (event.type === 'reserve' && event.hidden && event.seat !== seat) return { ...event, card: null };
    return structuredClone(event);
}
