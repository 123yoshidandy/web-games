/**
 * ビュー：あるプレイヤーから見てよい情報だけを JSON にしたもの
 * 山の並びは入れず、枚数だけにする（並んだドミノは表向きなので入れる）
 * 画面はビューだけを見て描く（オンライン対戦でも同じ形を送る）
 */

import { playerScore, cellKey } from './game.js';

export function createGameView(game, viewer = null) {
    const line = slots => slots && slots.map(slot => ({ domino: slot.domino, king: slot.king, done: slot.done }));
    const seat = game.currentSeat;
    return {
        viewer,
        phase: game.phase,
        round: game.round,
        step: game.phase === 'initial' ? 'pick' : game.phase === 'play' ? game.step : null,
        currentSeat: seat,
        activeKing: game.activeKing ? game.activeKing.id : null,
        activeIndex: game.phase === 'play' ? game.activeIndex : null,
        activeDomino: game.activeDomino ? game.activeDomino.id : null,
        current: line(game.current),
        next: line(game.next),
        // 最初の並びを選ぶ段階では、選ぶのは current
        pickFrom: game.phase === 'initial' ? 'current' : game.phase === 'play' && game.step === 'pick' ? 'next' : null,
        deckCount: game.deck.length,
        kings: game.kings.map(king => ({ ...king })),
        options: { ...game.options },
        players: game.players.map(player => ({
            seat: player.seat,
            name: player.name,
            isCPU: player.isCPU,
            cells: Object.entries(player.grid).map(([key, cell]) => {
                const [x, y] = key.split(',').map(Number);
                return { x, y, terrain: cell.terrain, crowns: cell.crowns };
            }),
            placed: player.placed,
            discarded: player.discarded,
            score: playerScore(player, game.options)
        })),
        // 置く番の人にだけ、置ける場所を渡す（画面が候補を光らせる）
        placements: viewer !== null && seat === viewer ? game.getLegalPlacements() : [],
        commandCount: game.commands.length,
        lastMove: game.lastMove ? { ...game.lastMove } : null,
        result: game.result ? structuredClone(game.result) : null,
        logs: game.logs.slice(-30)
    };
}

// ビューの cells から、座標で引ける形を作る（画面と CPU の確認用）
export const gridFromCells = cells => Object.fromEntries(cells.map(c => [cellKey(c.x, c.y), { terrain: c.terrain, crowns: c.crowns }]));
