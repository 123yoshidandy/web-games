/**
 * プレイヤーに送るビュー（JSON にできる形）
 * 協力ゲームなので、手札は全員に見せる。隠すのは、宝のカードと浸水のカードの山の並びだけ（枚数は見せる）
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { LEVELS } from './data.js';

export function createGameView(game, seat, { since = 0, events = true } = {}) {
    return {
        you: seat,
        level: game.options.level,
        levelName: LEVELS[game.options.level].name,
        turnNo: game.turnNo,
        current: game.current,
        phase: game.phase,
        actors: game.actors(),
        actionsLeft: game.actionsLeft,
        pilotUsed: game.pilotUsed,
        floodLeft: game.floodLeft,
        swimQueue: [...game.swimQueue],
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            role: p.role,
            tile: p.tile,
            hand: [...p.hand]
        })),
        cellOf: [...game.cellOf],
        tiles: [...game.tiles],
        captured: [...game.captured],
        water: game.water,
        rate: game.floodRate(),
        treasureDeckCount: game.treasureDeck.length,
        treasureDiscard: [...game.treasureDiscard],
        floodDeckCount: game.floodDeck.length,
        floodDiscard: [...game.floodDiscard],
        floodRemoved: [...game.floodRemoved],
        drawn: [...game.drawn],
        flooded: [...game.flooded],
        result: game.result ? { ...game.result } : null,
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: events ? game.events.map(e => ({ ...e })) : []
    };
}
