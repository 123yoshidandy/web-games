/**
 * ビュー：ある席から見てよい情報だけを JSON にしたもの（ローカルでもオンラインでも同じ形）
 * 山札の並びとシードは入れない（入れると、これから出るカードを計算できてしまう）。山札と表の山は枚数と、表の一番上だけ
 */

const LOG_LIMIT = 40;

export function createGameView(game, viewer = null) {
    const flipDue = game.flipDue();
    return {
        viewer,
        mode: game.mode,
        level: game.level,
        speed: game.speed,
        interval: game.interval,
        timeLimit: game.timeLimit,
        limitMs: game.limitMs,
        phase: game.phase,
        turn: game.turn,
        turnStartedAt: game.turnStartedAt,
        pauseUntil: game.pauseUntil,
        nextFlipAt: Number.isFinite(flipDue) ? flipDue : null,
        tableVersion: game.tableVersion,
        changedAt: game.changedAt,
        lastT: game.lastT,
        endT: game.endT,
        startedAt: game.startedAt ?? null, // オンラインだけ：サーバーの時刻での始まり
        potCount: game.pot.length,
        players: game.players.map(player => ({
            seat: player.seat,
            name: player.name,
            isCPU: player.isCPU,
            auto: player.isCPU || player.auto,
            deckCount: player.deck.length,
            pileCount: player.pile.length,
            top: player.pile.length ? player.pile[player.pile.length - 1] : null,
            out: player.out,
            bells: player.bells,
            misses: player.misses,
            lockUntil: player.lockUntil
        })),
        events: game.events.map(event => (event.fruits ? { ...event, fruits: [...event.fruits] } : { ...event })),
        commandCount: game.commands.length,
        result: game.result ? structuredClone(game.result) : null,
        logs: game.logs.slice(-LOG_LIMIT)
    };
}
