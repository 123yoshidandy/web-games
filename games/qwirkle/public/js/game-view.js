/**
 * プレイヤーに送るビュー（JSON にできる形）
 * 自分の手札だけを見せ、ほかの人は枚数だけ。袋は枚数だけ（並びも中身も見せない）
 * 画面と CPU はビューだけを見て判断する。オンライン対戦では、このビューをそのまま各端末に送る
 */

export function createGameView(game, seat, { since = 0, events = true } = {}) {
    return {
        you: seat,
        turnNo: game.turnNo,
        current: game.current,
        phase: game.phase,
        actors: game.actors(),
        firstSize: game.board.size === 0 ? game.firstSize : null,
        bagCount: game.bag.length,
        board: game.placed.map(p => ({ ...p })),
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            level: p.level,
            score: p.score,
            handCount: p.hand.length,
            hand: p.id === seat ? [...p.hand] : null
        })),
        lastMove: game.lastMove ? structuredClone(game.lastMove) : null,
        winners: [...game.winners],
        endReason: game.endReason,
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: events ? game.events.map(e => structuredClone(e)) : []
    };
}
