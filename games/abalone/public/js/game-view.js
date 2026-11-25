/**
 * 見る人ごとの見え方
 * アバロンには隠す情報がない。見る人の手番なら、通る手の一覧も付ける（画面で、動かせる向きの矢印を出すため）
 * seat が null なら観戦者
 */

export function createGameView(game, seat, { since = 0 } = {}) {
    const s = game.state;
    const mine = seat !== null && game.current === seat;
    return {
        seat,
        current: game.current,
        first: game.first,
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU, color: p.color,
            captured: s.captured[p.color]
        })),
        board: s.board.slice(),
        moves: mine ? game.legalMoves().map(m => ({ ...m, cells: m.cells.slice() })) : [],
        options: { ...game.options },
        over: game.isOver(),
        winner: game.winner,
        events: game.events.filter(e => e.seq > since).map(e => structuredClone(e)),
        eventSeq: game.eventSeq,
        lastError: game.lastError
    };
}
