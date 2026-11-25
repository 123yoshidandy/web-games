/**
 * 見る人ごとの見え方
 * サントリーニには隠す情報がない。見る人の手番なら、選べる操作の一覧も付ける
 * seat が null なら観戦者
 */

export function createGameView(game, seat, { since = 0 } = {}) {
    const s = game.state;
    const mine = seat !== null && game.current === seat;
    return {
        seat,
        current: game.current,
        first: game.first,
        phase: s.phase,
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU,
            god: s.gods[p.id],
            workers: s.workers[p.id].slice(),
            alive: s.alive[p.id]
        })),
        height: s.height.slice(),
        dome: s.dome.slice(),
        supply: s.supply.slice(),
        turn: { ...s.turn },
        athena: s.athena.slice(),
        steps: mine ? game.legalSteps().map(a => ({ ...a })) : [],
        options: structuredClone(game.options),
        over: game.isOver(),
        winner: game.winner,
        result: s.result ? { ...s.result } : null,
        events: game.events.filter(e => e.seq > since).map(e => ({ ...e })),
        eventSeq: game.eventSeq,
        lastError: game.lastError
    };
}
