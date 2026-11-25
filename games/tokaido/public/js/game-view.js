/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（伏せた札を隠す役目もここで持つ）
 * - 山（土産・食事・出会い・温泉）は枚数だけ。シードと CPU の値（cpuSalt）は入れない
 * - 旅人の札：配られた2枚は本人にだけ。選んだ旅人は、全員が選び終えるまで本人にだけ見せる
 * - 宿場の食事の札は、その宿場に着いた人にだけ見せる（最初に着いた人は、ほかの人に見せずに引く）
 * - 役人が出会いで引いた2枚は、本人にだけ。店で引いた土産3枚は表にして並べるので全員に見せる
 * - 集めた札・お金・点・寄付は全員に見せる
 */

import { BOARD } from './data.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const revealed = game.phase !== 'choose';
    const me = seat === null ? null : game.players[seat];
    const myToken = seat === null ? null : game.tokens[seat];
    const innVisible = !!game.inn && !!myToken && myToken.pos === game.inn.pos;
    const pending = game.pending;
    const mover = game.moverToken();
    const actors = game.actors();
    return {
        you: seat,
        phase: game.phase,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            traveler: revealed || p.id === seat ? p.traveler : null,
            chosen: !!p.traveler,
            offers: p.id === seat ? [...p.offers] : null,
            coins: p.coins,
            score: p.score,
            points: { ...p.points },
            souvenirs: [...p.souvenirs],
            meals: [...p.meals],
            springs: [...p.springs],
            encounters: [...p.encounters],
            panoramas: { ...p.panoramas },
            donations: p.donations,
            achievements: [...p.achievements]
        })),
        tokens: game.tokens.map(t => ({ player: t.player, pos: t.pos, seq: t.seq, donations: t.donations })),
        neutral: game.tokens.length > game.players.length,
        mover,
        moverSeat: game.moverSeat(),
        actors,
        // 自分が動かす番なら、止まれるマス
        moves: seat !== null && !pending && actors.includes(seat) && mover !== null ? game.legalMoves(mover) : [],
        capacity: BOARD.map((_, pos) => (Number.isFinite(game.capacity(pos)) ? game.capacity(pos) : 99)),
        inn: game.inn ? { pos: game.inn.pos, count: game.inn.meals.length, meals: innVisible ? [...game.inn.meals] : null } : null,
        pending: pending ? viewPending(game, pending, seat) : null,
        deckCounts: Object.fromEntries(Object.entries(game.decks).map(([k, d]) => [k, d.length])),
        panoramaFirst: { ...game.panoramaFirst },
        result: game.result ? structuredClone(game.result) : null,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => structuredClone(event))
    };
}

function viewPending(game, pending, seat) {
    const mine = pending.seat === seat;
    const base = { seat: pending.seat, kind: pending.kind };
    switch (pending.kind) {
        case 'buy':
            // 店の土産は表にして並べる
            return { ...base, cards: [...pending.cards] };
        case 'donate':
            return { ...base, max: pending.max };
        case 'encounter':
            return mine ? { ...base, cards: [...pending.cards] } : base;
        case 'panorama':
            return { ...base, options: [...pending.options], reason: pending.reason };
        case 'meal':
            return mine ? { ...base, options: [...pending.options], offer: pending.offer } : base;
        default:
            return base;
    }
}
