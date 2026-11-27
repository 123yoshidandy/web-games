/**
 * プレイヤーから見たビュー（JSON にできる形）
 * 将棋に隠す情報はない。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { moveFrom, moveTo, isDrop, dropType, isPromote } from './rules.js';

// 手を画面で使う形にする。drop は打つ駒の種類（動かす手は null）
export const moveInfo = (m) => (isDrop(m)
    ? { from: null, to: moveTo(m), drop: dropType(m), promote: false }
    : { from: moveFrom(m), to: moveTo(m), drop: null, promote: isPromote(m) });

// 持ち時間（時計なしは null）。startedAt は手番が始まった時刻（ローカルは端末の時刻、オンラインはサーバーの時刻）
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
    const myTurn = !over && seat !== null && seat !== undefined && game.current === seat;
    return {
        you: seat ?? null,
        players: game.players.map(p => ({ id: p.id, name: p.name, isCPU: p.isCPU })),
        board: [...game.pos.board],
        hands: game.pos.hands.map(h => [...h]),
        current: game.current,
        phase: game.phase,
        ply: game.ply,
        // 手番の人の指せる手（画面で光らせる）。2人で1台を使うときは、どちらの席のビューでも手番の人の分を入れる
        moves: over ? [] : game.legalMoves().map(moveInfo),
        check: !over && game.inCheck(),
        kings: [...game.pos.kings],
        myTurn,
        lastMove: game.lastMove ? { ...game.lastMove } : null,
        winner: game.winner,
        reason: game.reason,
        over,
        clock: clockView(game),
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
