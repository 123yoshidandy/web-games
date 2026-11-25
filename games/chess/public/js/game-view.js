/**
 * プレイヤーから見たビュー（JSON にできる形）
 * チェスに隠す情報はない。オンライン対戦では、このビューをそのまま各端末に送る
 */

export function createGameView(game, seat, { since = 0 } = {}) {
    const over = game.isOver();
    const hasSeat = seat !== null && seat !== undefined;
    const actor = game.actors()[0] ?? null;
    const myTurn = !over && hasSeat && actor === seat;
    const moving = myTurn && game.drawOffer === null;
    return {
        you: hasSeat ? seat : null,
        players: game.players.map(p => ({ id: p.id, name: p.name, isCPU: p.isCPU, cpuLevel: p.cpuLevel })),
        board: game.pos.toArray(),
        current: game.current,
        actor,
        phase: game.phase,
        ply: game.ply,
        fen: game.pos.fen(),
        startFen: game.startFen,
        // 指した手（UCI）。CPU が同じ局面の繰り返しを読むのに使う
        uci: game.history.map(h => h.uci),
        sans: game.history.map(h => h.san),
        // 手番の人の合法手。2人で1台を使うときは、どちらの席のビューでも手番の人の分を入れる
        moves: over || game.drawOffer !== null ? [] : game.moves(),
        myTurn,
        moving,
        check: game.kingSquareInCheck(),
        lastMove: game.history.length ? { ...game.history.at(-1) } : null,
        captured: game.capturedPieces(),
        drawOffer: game.drawOffer,
        canOfferDraw: hasSeat && game.canOfferDraw(seat),
        halfmove: game.pos.halfmove,
        result: game.result ? { ...game.result } : null,
        winner: game.winner,
        over,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
