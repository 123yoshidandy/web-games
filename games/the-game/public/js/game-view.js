/**
 * 見る人ごとの状態。ほかの人の手札と山札の並びは入れず、枚数だけを入れる（シードも入れない）
 * 合図は全員に見える。viewer が null なら観戦者（手札なし）
 */

export function createGameView(game, viewer) {
    const seated = viewer !== null && viewer !== undefined && !!game.players[viewer];
    return {
        commandCount: game.commands.length,
        viewer: seated ? viewer : null,
        players: game.players.map(p => ({
            seat: p.seat,
            name: p.name,
            isCPU: p.isCPU,
            handCount: game.hands[p.seat].length,
            signals: [...game.signals[p.seat]]
        })),
        hand: seated ? [...game.hands[viewer]] : [],
        handSize: game.handSize,
        piles: game.piles.map(p => ({ dir: p.dir, top: p.top, count: p.count })),
        deckCount: game.deck.length,
        remaining: game.remaining,
        current: game.current,
        played: game.played,
        required: game.required,
        canEnd: game.canEnd,
        turn: game.turn,
        backs: game.backs,
        phase: game.phase,
        result: game.result ? { ...game.result } : null,
        logs: game.logs.slice(-80),
        lastMove: game.lastMove ? { ...game.lastMove } : null
    };
}
