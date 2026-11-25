/**
 * プレイヤーから見たビュー（JSON にできる形）
 * 囲碁に隠す情報はない。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { colorOf } from './rules.js';

export function createGameView(game, seat, { since = 0 } = {}) {
    const over = game.isOver();
    const scoring = game.phase === 'scoring';
    const hasSeat = seat !== null && seat !== undefined;
    const score = scoring || (over && game.result?.reason === 'score') ? game.score() : null;
    return {
        you: seat ?? null,
        players: game.players.map(p => ({ id: p.id, name: p.name, isCPU: p.isCPU })),
        size: game.size,
        options: { ...game.options },
        board: [...game.board],
        current: game.current,
        toPlay: colorOf(game.current),
        phase: game.phase,
        moveNumber: game.moveNumber,
        passes: game.passes,
        ko: game.ko,
        placed: [...game.placed],
        prisoners: { ...game.prisoners },
        myTurn: !over && hasSeat && game.actors().includes(seat),
        lastMove: game.lastMove ? { ...game.lastMove, captured: [...game.lastMove.captured] } : null,
        dead: [...game.dead],
        agreed: [...game.agreed],
        // 死に石を決める段階と、数えて終わったあと：地の持ち主と点
        owner: score ? score.owner : null,
        score: score ? { black: score.black, white: score.white, diff: score.diff } : null,
        result: game.result ? structuredClone(game.result) : null,
        winner: game.winner,
        over,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
