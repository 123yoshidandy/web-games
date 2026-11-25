/**
 * プレイヤーに送るビュー（JSON にできる形）
 * 協力ゲームなので、手札は全員に見せる。隠すのは、プレイヤーカードの山と感染カードの山の並びだけ（枚数は見せる）
 * 「予測」で並べ替えている間だけ、感染カードの山の上の6枚を見せる
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { LEVELS } from './cities.js';

export function createGameView(game, seat, { since = 0, events = true } = {}) {
    return {
        you: seat,
        level: game.options.level,
        epidemicsTotal: game.epidemicsTotal,
        epidemicsDrawn: game.epidemicsDrawn,
        levelName: LEVELS[game.options.level].name,
        turnNo: game.turnNo,
        current: game.current,
        stage: game.stage,
        phase: game.phase,
        actors: game.actors(),
        actionsLeft: game.actionsLeft,
        opsMoveUsed: game.opsMoveUsed,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            role: p.role,
            city: p.city,
            hand: [...p.hand],
            stored: p.stored
        })),
        cubes: game.cubes.map(row => [...row]),
        supply: [...game.supply],
        stations: [...game.stations],
        cures: [...game.cures],
        outbreaks: game.outbreaks,
        rateIndex: game.rateIndex,
        rate: game.infectionRate(),
        quiet: game.quiet,
        playerDeckCount: game.playerDeck.length,
        pileSizes: [...game.pileSizes],
        playerDiscard: [...game.playerDiscard],
        infectionDeckCount: game.infectionDeck.length,
        infectionDiscard: [...game.infectionDiscard],
        infectionRemoved: [...game.infectionRemoved],
        known: game.known.map(seg => [...seg]),
        forecast: game.phase === 'forecast' ? game.infectionDeck.slice(0, 6) : null,
        forecastBy: game.forecastBy,
        drawn: [...game.drawn],
        infected: [...game.infected],
        result: game.result ? { ...game.result } : null,
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: events ? game.events.map(e => ({ ...e })) : []
    };
}
