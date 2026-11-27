/**
 * プレイヤーから見たビュー（JSON にできる形）
 * 五目並べに隠す情報はない。オンライン対戦では、このビューをそのまま各端末に送る
 * シード（黒の席を決めるだけのもの）はビューに入れない
 */

export function clockView(game) {
    if (!game.clock) return null;
    return {
        config: { ...game.clockConfig },
        sides: game.clock.map(side => ({ ...side })),
        running: game.clockSeat(),
        startedAt: game.turnStartedAt ?? null
    };
}

export function createGameView(game, seat, { since = 0 } = {}) {
    const over = game.isOver();
    const hasSeat = seat !== null && seat !== undefined;
    const { seed, ...options } = game.options;
    return {
        you: seat ?? null,
        players: game.players.map(p => ({ id: p.id, name: p.name, isCPU: p.isCPU })),
        size: game.size,
        options,
        board: [...game.board],
        current: game.current,
        toPlay: game.colorOf(game.current),
        colors: [game.colorOf(0), game.colorOf(1)],
        phase: game.phase,
        moveNumber: game.moveNumber,
        myTurn: !over && hasSeat && game.actors().includes(seat),
        lastMove: game.lastMove ? { ...game.lastMove } : null,
        // 置いた順の点（手順の表示と目隠しに使う）
        history: game.commands.filter(c => c.command.type === 'move').map(c => c.command.sq),
        // 持ち時間（時計なしは null）。startedAt は手番が始まった時刻（ローカルは端末の時刻、オンラインはサーバーの時刻）
        clock: clockView(game),
        result: game.result ? structuredClone(game.result) : null,
        winner: game.winner,
        over,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
