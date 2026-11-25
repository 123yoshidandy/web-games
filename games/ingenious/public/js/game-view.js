/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（手札と袋を隠す役目もここで持つ）
 * - ほかの人の手札は枚数だけ。袋は枚数だけ（並びは入れない）
 * - 盤・置いたタイル・得点は全員に見せる
 * - 取り替えられるかは手札で決まるので、本人にだけ入れる
 * - シードと CPU の迷いに使う値（cpuSalt）は入れない（袋の並びが分かってしまうため）
 */

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const mine = seat !== null && game.current === seat && !game.isOver();
    return {
        you: seat,
        mode: game.mode,
        radius: game.radius,
        maxScore: game.maxScore,
        bonusAt: [...game.bonusAt],
        handSize: game.handSize,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            handCount: p.hand.length,
            hand: p.id === seat ? p.hand.map(t => [...t]) : null,
            placed: p.placed,
            side: p.side
        })),
        sides: game.sides.map(s => ({ members: [...s.members], scores: { ...s.scores } })),
        board: [...game.board],
        tiles: game.tiles.map(t => ({ cells: [...t.cells], colors: [...t.colors], seat: t.seat })),
        bagCount: game.bag.length,
        current: game.current,
        turnNumber: game.turnNumber,
        phase: game.phase,
        answering: game.actors(),
        bonus: game.bonus,
        freeSymbols: game.freeSymbols(),
        canSwap: mine && game.phase === 'swap',
        winners: [...game.winners],
        instantWin: game.instantWin,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
