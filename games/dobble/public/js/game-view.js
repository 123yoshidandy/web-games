/**
 * ビュー：ある席から見てよい情報だけを JSON にしたもの（ローカルでもオンラインでも同じ形）
 * 真ん中の山の並びとシードは入れない（入れると、これから出るカードを計算できてしまう）。山は一番上と枚数だけ
 * 各自の山の一番上は表向きなので、全員分を入れる。ヒントのマークは、ヒントを使った本人にだけ入れる
 */

const LOG_LIMIT = 40;

export function createGameView(game, viewer = null) {
    return {
        viewer,
        mode: game.mode,
        level: game.level,
        phase: game.phase,
        center: game.center,
        pileCount: game.pile.length,
        version: game.version,
        changedAt: game.changedAt,
        lastT: game.lastT,
        endT: game.endT,
        startedAt: game.startedAt ?? null, // オンラインだけ：サーバーの時刻での始まり
        players: game.players.map(player => ({
            seat: player.seat,
            name: player.name,
            isCPU: player.isCPU,
            top: player.top,
            taken: player.taken,
            score: player.score,
            wrong: player.wrong,
            hints: player.hints,
            lockUntil: player.lockUntil
        })),
        hintSymbol: viewer === null ? null : game.hintFor(viewer),
        events: game.events.map(event => ({ ...event })),
        commandCount: game.commands.length,
        result: game.result ? structuredClone(game.result) : null,
        logs: game.logs.slice(-LOG_LIMIT)
    };
}
