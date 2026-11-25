/**
 * プレイヤーから見たビュー（JSON にできる形）
 * オニタマに隠す情報はない（盤・両者の手札・脇のカードはすべて公開）。シードと、局面を数える記録は入れない
 * オンライン対戦では、このビューをそのまま各端末に送る
 */

import { legalMoves, positionKey } from './rules.js';

export function createGameView(game, seat, { since = 0 } = {}) {
    const over = game.isOver();
    const state = { board: game.board, hands: game.hands, side: game.side };
    const myTurn = !over && seat !== null && seat !== undefined && game.current === seat;
    const moves = myTurn ? legalMoves(state, seat) : [];
    return {
        you: seat ?? null,
        players: game.players.map(p => ({ id: p.id, name: p.name, isCPU: p.isCPU, color: p.color })),
        board: [...game.board],
        hands: game.hands.map(h => [...h]),
        side: game.side,
        first: game.first,
        current: game.current,
        phase: game.phase,
        ply: game.ply,
        // 今の局面が何回目か（千日手は3回目で引き分け）
        repeat: game.seen.get(positionKey(state, game.current)) ?? 1,
        lastMove: game.lastMove ? { ...game.lastMove } : null,
        moves,
        mustPass: myTurn && moves.length === 0,
        winner: game.winner,
        result: game.result,
        over,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
