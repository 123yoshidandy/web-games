/**
 * 見る人ごとの見え方
 * コリドールには隠す情報がない。見る人の手番なら、駒の動ける先も付ける
 * 壁を置けるか（と理由）は、画面がビューの盤から rules.js の wallReason で調べる（stateFromView）
 * seat が null なら観戦者
 */

import { pawnMoves, xOf, yOf } from './rules.js';

export function createGameView(game, seat, { since = 0 } = {}) {
    const s = game.state;
    const mine = seat !== null && game.current === seat;
    const dist = game.distances();
    return {
        seat,
        current: game.current,
        first: game.first,
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU,
            side: s.sides[p.id],
            pawn: s.pawns[p.id],
            walls: s.walls[p.id],
            dist: dist[p.id]
        })),
        h: s.h.slice(),
        v: s.v.slice(),
        placed: s.placed.map(w => ({ ...w })),
        moves: mine ? pawnMoves(s).map(c => ({ x: xOf(c), y: yOf(c) })) : [],
        options: { ...game.options },
        over: game.isOver(),
        winner: game.winner,
        events: game.events.filter(e => e.seq > since).map(e => ({ ...e })),
        eventSeq: game.eventSeq,
        lastError: game.lastError
    };
}

// ビューから、rules.js の関数に渡せる状態を作る（画面で壁を置けるかを調べるため）
export function stateFromView(view) {
    return {
        players: view.players.length,
        sides: view.players.map(p => p.side),
        pawns: view.players.map(p => p.pawn),
        walls: view.players.map(p => p.walls),
        h: view.h.slice(),
        v: view.v.slice(),
        placed: view.placed.map(w => ({ ...w })),
        current: view.current ?? 0,
        result: view.over ? { winner: view.winner } : null
    };
}
