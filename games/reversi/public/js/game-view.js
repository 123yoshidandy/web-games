/**
 * プレイヤーから見たビュー（JSON にできる形）
 * リバーシに隠す情報はない。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { legalMoves, colorOf, countStones } from './rules.js';

export function createGameView(game, seat, { since = 0 } = {}) {
    const over = game.isOver();
    const myTurn = !over && seat !== null && seat !== undefined && game.current === seat;
    return {
        you: seat ?? null,
        players: game.players.map(p => ({ id: p.id, name: p.name, isCPU: p.isCPU })),
        board: [...game.board],
        current: game.current,
        phase: game.phase,
        ply: game.ply,
        counts: countStones(game.board),
        // 手番の人の置けるマス（画面で光らせる）。2人で1台を使うときは、どちらの席のビューでも手番の人の分を入れる
        moves: over ? [] : legalMoves(game.board, colorOf(game.current)),
        myTurn,
        lastMove: game.lastMove ? { ...game.lastMove, flips: [...game.lastMove.flips] } : null,
        winner: game.winner,
        over,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
