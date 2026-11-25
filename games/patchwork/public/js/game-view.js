/**
 * ビュー：画面に渡す JSON
 * パッチワークには隠れた情報がない（並んだパッチもすべて表向き）ので、全員に同じ内容を渡す。
 * 置ける場所の一覧は、動く本人にだけ入れる（画面が候補を出すため）
 */

import { legalPlacements, countEmpty } from './game.js';
import { PATCHES } from './patches.js';

export function createGameView(game, viewer = null) {
    const current = game.current;
    const mine = viewer !== null && current === viewer && !game.pendingLeather;
    return {
        viewer,
        phase: game.phase,
        current,
        turn: game.turn,
        ring: [...game.ring],
        offer: [...game.offer],
        leatherLeft: [...game.leatherLeft],
        pendingLeather: game.pendingLeather ? { ...game.pendingLeather } : null,
        bonusOwner: game.bonusOwner,
        top: game.top,
        players: game.players.map(p => ({
            seat: p.seat,
            name: p.name,
            isCPU: p.isCPU,
            buttons: p.buttons,
            income: p.income,
            position: p.position,
            quilt: p.quilt.map(row => [...row]),
            placed: p.placed.map(item => ({ id: item.id, cells: item.cells.map(c => [...c]) })),
            bonus: p.bonus,
            empty: countEmpty(p.quilt),
            score: game.score(p.seat)
        })),
        advanceTarget: current !== null ? game.advanceTarget(current) : null,
        // 動く本人が買えるパッチと、置ける場所
        buyable: mine ? game.offer.map(id => ({
            id,
            affordable: game.players[viewer].buttons >= PATCHES[id].cost,
            placements: legalPlacements(game.players[viewer].quilt, id)
        })) : [],
        commandCount: game.commands.length,
        lastMove: game.lastMove ? structuredClone(game.lastMove) : null,
        result: game.result ? structuredClone(game.result) : null,
        logs: game.logs.slice(-40)
    };
}
