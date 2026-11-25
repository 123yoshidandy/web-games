/**
 * プレイヤーから見るビュー（JSON にできる形）
 * ブロックスには隠す情報がない（盤と、各色の残りのピースは全員に見える）ので、全員に同じ盤を送る
 * シードと CPU の迷いに使う値（cpuSalt）は入れない
 */

import { COLORS, SHARED } from './game.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const scores = game.scores();
    return {
        you: seat,
        players: game.players.map((p, i) => ({ id: p.id, name: p.name, isCPU: p.isCPU, score: scores[i] })),
        board: [...game.board],
        owners: [...game.owners],
        shared: SHARED,
        sharedNext: game.sharedNext,
        colors: game.colors.map((c, i) => ({
            name: COLORS[i],
            pieces: [...c.pieces],
            out: c.out,
            placed: c.placed,
            last: c.last,
            remaining: game.remaining(i),
            score: game.colorScore(i)
        })),
        scoring: game.options.scoring,
        current: game.current,
        actors: game.actors(),
        turn: game.turn,
        phase: game.phase,
        lastMove: game.lastMove ? structuredClone(game.lastMove) : null,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => structuredClone(event))
    };
}
