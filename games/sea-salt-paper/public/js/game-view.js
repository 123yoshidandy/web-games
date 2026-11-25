/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（手札を隠す役目もここで持つ）
 * - ほかの人の手札は枚数だけ。ラストチャンスで公開した手札と、ラウンドの結果の手札は見せる
 * - 山札は枚数だけ。山札から引いた2枚は、引いた本人にだけ見せる
 * - 捨て札の山は一番上と枚数だけ。カニの効果で中を見ている本人にだけ、山の全部を見せる
 * - 出来事のカードも、見てよい人（visibleTo）でなければ消す
 */

import { allCards, END_THRESHOLD } from './game.js';
import { cardPoints, colorBonus, scoreBreakdown } from './scoring.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const shown = game.protectedSeats();
    const mine = seat !== null && seat === game.current;
    const players = game.players.map(p => {
        const open = p.id === seat || shown.includes(p.id);
        const duoCards = p.duos.flat();
        return {
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            score: p.score,
            handCount: p.hand.length,
            hand: open ? [...p.hand] : null,
            duos: p.duos.map(d => [...d]),
            revealed: shown.includes(p.id),
            // 点：見える人は全部のカードで、ほかの人は出した2枚組の分だけ
            points: open ? cardPoints(allCards(p)) : cardPoints(duoCards),
            breakdown: open ? scoreBreakdown(allCards(p)) : null,
            bonus: open ? colorBonus(allCards(p)) : null
        };
    });
    return {
        you: seat,
        players,
        round: game.round,
        target: game.target,
        current: game.current,
        roundStarter: game.currentRoundStarter,
        phase: game.phase,
        deckCount: game.deck.length,
        discards: game.discards.map(pile => ({ count: pile.length, top: pile.at(-1) ?? null })),
        drawn: game.phase === 'keep' ? (mine ? [...game.drawn] : null) : null,
        drawnCount: game.phase === 'keep' ? game.drawn.length : 0,
        crab: game.crab ? { pile: game.crab.pile, cards: mine && game.crab.pile !== null ? [...game.discards[game.crab.pile]] : null } : null,
        extraTurns: game.extraTurns,
        lastChance: game.lastChance ? { caller: game.lastChance.caller, done: [...game.lastChance.done], queue: [...game.lastChance.queue] } : null,
        // 自分の手番でできること
        canEnd: mine && game.phase === 'play' && game.canEndRound(seat),
        stealTargets: mine ? game.stealTargets(seat) : [],
        threshold: END_THRESHOLD,
        roundResult: game.roundResult ? structuredClone(game.roundResult) : null,
        history: game.history.map(row => [...row]),
        winners: [...game.winners],
        endReason: game.endReason,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => sanitizeEvent(event, seat))
    };
}

function sanitizeEvent(event, seat) {
    const { visibleTo, ...rest } = event;
    if (visibleTo && !visibleTo.includes(seat)) {
        delete rest.card;
        delete rest.cards;
    }
    return structuredClone(rest);
}
