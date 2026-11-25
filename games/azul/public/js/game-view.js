/**
 * ビュー：あるプレイヤーから見てよい情報だけを JSON にしたもの
 * アズールは袋の中の並び以外すべて公開なので、袋と箱のふたは枚数だけを入れる
 * 画面はビューだけを見て描く（オンライン対戦でも同じ形を送る）
 */

const LOG_LIMIT = 30;

// viewer：見る人の席（観戦なら null）
export function createGameView(game, viewer = null) {
    return {
        viewer,
        phase: game.phase,
        round: game.round,
        current: game.current,
        startSeat: game.startSeat,
        factories: game.factories.map(tiles => [...tiles]),
        center: [...game.center],
        firstInCenter: game.firstInCenter,
        bagCount: game.bag.length,
        lidCount: game.lid.length,
        players: game.players.map(player => ({
            seat: player.seat,
            name: player.name,
            isCPU: player.isCPU,
            score: player.score,
            lines: player.lines.map(line => ({ ...line })),
            wall: player.wall.map(row => [...row]),
            floor: [...player.floor]
        })),
        commandCount: game.commands.length,
        lastMove: game.lastMove ? { ...game.lastMove } : null,
        lastReport: game.roundReports.length ? structuredClone(game.roundReports[game.roundReports.length - 1]) : null,
        result: game.result ? structuredClone(game.result) : null,
        logs: game.logs.slice(-LOG_LIMIT)
    };
}
