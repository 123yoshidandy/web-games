/**
 * プレイヤーから見てよい情報を集めたビュー（JSON にできる形）
 * このゲームに伏せた情報はない（氷・ペンギン・取った氷は全員に見えている）ので、全員に同じ中身を送る
 * シードと CPU の迷いに使う値（cpuSalt）は入れない（CPU の手が読めてしまうため）
 */

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const turnSeat = game.isOver() ? null : game.current;
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            catch: [...p.catch],
            ...game.score(p.id),
            out: p.out
        })),
        fish: [...game.fish],
        penguins: game.penguins.map(p => ({ owner: p.owner, cell: p.cell })),
        perPlayer: game.perPlayer,
        current: game.current,
        turnNumber: game.turnNumber,
        phase: game.phase,
        answering: game.actors(),
        // 今の番の人ができること
        placeable: game.phase === 'place' ? game.placeable() : [],
        moves: game.phase === 'move' && turnSeat !== null
            ? Object.fromEntries(game.movablePenguins(turnSeat).map(i => [i, game.movesOf(i)]))
            : {},
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
