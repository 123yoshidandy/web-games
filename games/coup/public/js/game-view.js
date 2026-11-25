/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（手札を隠す役目もここで持つ）
 * - ほかの人の手札は枚数だけ。失った札（表）は全員に見せる
 * - 山は枚数だけ。交換で引いた札と、チャレンジのあとに引き直した札は、本人にだけ見せる
 * - 答えを待っている人（waiting）は、ルールだけで決まる（手札で変わらない）ので、そのまま見せる
 * - CPU の迷いに使う値（cpuSalt）とシードは入れない（シードから山の並びが分かるため）
 */

import { ACTIONS } from './game.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const t = game.turn;
    const actorSeat = t?.actor ?? null;
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            coins: p.coins,
            cardCount: p.hand.length,
            hand: p.id === seat ? [...p.hand] : null,
            lost: [...p.lost],
            alive: p.hand.length > 0
        })),
        deckCount: game.deck.length,
        current: game.current,
        turnNumber: game.turnNumber,
        phase: game.phase,
        turn: t ? { actor: t.actor, action: t.action, target: t.target, blocker: t.blocker, blockRole: t.blockRole, claim: ACTIONS[t.action].claim } : null,
        waiting: [...game.waiting],
        answering: game.actors(),   // 操作を待っている人（行動・答え・失う札・交換）
        loser: game.loser,
        drawn: game.phase === 'exchange' && seat === actorSeat ? [...game.drawn] : null,
        drawnCount: game.phase === 'exchange' ? game.drawn.length : 0,
        // その人ができること
        legalActions: seat !== null && game.phase === 'action' && game.current === seat ? game.legalActions(seat) : [],
        claims: game.claims.map(list => list.map(c => ({ ...c }))),
        winner: game.winner,
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
