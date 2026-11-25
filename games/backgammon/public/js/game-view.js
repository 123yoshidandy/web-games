/**
 * 見る人ごとの見え方
 * バックギャモンには隠す情報がない。通る手は、画面が rules.js で同じ盤から計算する（ダイスと盤はビューにある）
 * seat が null なら観戦者
 */

import { pipCount, BAR, OFF } from './rules.js';

export function createGameView(game, seat, { since = 0 } = {}) {
    const s = game.state;
    return {
        seat,
        current: game.current,
        phase: s.phase,
        turn: s.turn,
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU,
            score: game.score[p.id],
            pips: pipCount(s.board[p.id]),
            bar: s.board[p.id][BAR],
            off: s.board[p.id][OFF]
        })),
        board: [s.board[0].slice(), s.board[1].slice()],
        dice: s.dice ? s.dice.slice() : null,
        cube: { ...s.cube },
        crawford: s.crawford,
        canDouble: seat !== null && game.canDouble(seat),
        result: s.result ? { ...s.result } : null,
        gameNo: game.gameNo,
        options: { ...game.options },
        over: game.isOver(),
        winner: game.winner,
        events: game.events.filter(e => e.seq > since).map(e => structuredClone(e)),
        eventSeq: game.eventSeq,
        lastError: game.lastError
    };
}
