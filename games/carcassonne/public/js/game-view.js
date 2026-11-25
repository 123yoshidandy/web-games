/**
 * ビュー：そのプレイヤーから見てよい情報だけの JSON
 * 袋の並び（次に何が出るか）は入れず、残りのタイルの種類ごとの枚数だけを入れる（全員が数えられる公開の情報）
 * 画面はビューだけを見て描く。オンライン対戦でも同じ形のものを送る
 */

import { TILE_DEFS, TILE_TYPES } from './tiles.js';

// since：この番号より後のイベントだけを入れる（null なら残っている全部）
export function createGameView(game, seat, { since = null } = {}) {
    const playing = game.phase === 'play';
    return {
        seat,
        phase: game.phase,
        current: playing ? game.current : null,
        turn: game.turn,
        tile: game.tile,
        bagCount: game.bag.length,
        remaining: remainingCounts(game),
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU, score: p.score, meeples: p.meeples, breakdown: { ...p.breakdown }
        })),
        board: [...game.board.cells.values()].map(c => ({ x: c.x, y: c.y, type: c.type, rot: c.rot, meeple: c.meeple ? { ...c.meeple } : null })),
        lastPlaced: { ...game.lastPlaced },
        eventSeq: game.eventSeq,
        events: game.events.filter(e => since === null || e.seq > since).map(e => structuredClone(e)),
        // 手番の人にだけ、置ける場所・向きと、コマを置ける要素を渡す
        placements: playing && seat === game.current ? game.placementOptions() : null,
        ranking: game.phase === 'end' ? game.ranking() : null
    };
}

// 袋に残っているタイルの、種類ごとの枚数（引いたばかりのタイルは含めない）
export function remainingCounts(game) {
    const counts = Object.fromEntries(TILE_TYPES.map(t => [t, TILE_DEFS[t].count]));
    for (const cell of game.board.cells.values()) counts[cell.type]--;
    game.discarded.forEach(t => { counts[t]--; });
    if (game.tile) counts[game.tile]--;
    return counts;
}
