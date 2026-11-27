/**
 * ビュー：ある席から見てよい情報だけを JSON にしたもの（ローカルでもオンラインでも同じ形）
 * 山札の並びとシードは入れない（入れると、これから出るカードを計算できてしまう）。山札は枚数だけ
 * ヒントのカードは、ヒントを使った本人にだけ入れる
 */

const LOG_LIMIT = 40;

export function createGameView(game, viewer = null) {
    return {
        viewer,
        mode: game.mode,
        level: game.level,
        phase: game.phase,
        board: [...game.board],
        deckCount: game.deck.length,
        boardVersion: game.boardVersion,
        changedAt: game.changedAt,
        lastT: game.lastT,
        endT: game.endT,
        startedAt: game.startedAt ?? null, // オンラインだけ：サーバーの時刻での始まり
        players: game.players.map(player => ({
            seat: player.seat,
            name: player.name,
            isCPU: player.isCPU,
            score: player.score,
            sets: player.sets,
            wrong: player.wrong,
            hints: player.hints,
            lockUntil: player.lockUntil
        })),
        hintCard: viewer === null ? null : game.hintFor(viewer),
        events: game.events.map(event => (event.cards ? { ...event, cards: [...event.cards] } : { ...event })),
        commandCount: game.commands.length,
        result: game.result ? structuredClone(game.result) : null,
        logs: game.logs.slice(-LOG_LIMIT)
    };
}
