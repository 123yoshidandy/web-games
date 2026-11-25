/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 種族と特殊能力の山は、枚数だけ（並びは入れない）。シードも入れない
 * - 盤面・種族・コインは全員に見せる
 * 項目はゲームと同じ形なので、rules.js の関数にそのまま渡せる
 */

import { turnIncome } from './rules.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    return {
        you: seat,
        phase: game.phase,
        stage: game.stage,
        round: game.round,
        rounds: game.rounds,
        start: game.start,
        current: game.current,
        actors: game.actors(),
        acting: game.acting,
        step: game.step ? structuredClone(game.step) : null,
        turnInfo: game.turnInfo ? structuredClone(game.turnInfo) : null,
        row: game.row.map(c => ({ ...c })),
        raceDeckCount: game.raceDeck.length,
        powerDeckCount: game.powerDeck.length,
        bands: structuredClone(game.bands),
        regions: game.regions.map(r => ({ ...r })),
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU, coins: p.coins, active: p.active, declined: [...p.declined],
            peace: p.peace, lastConquered: [...p.lastConquered], lastIncome: p.lastIncome ? structuredClone(p.lastIncome) : null,
            tokens: game.tokensOf(p.id)
        })),
        income: game.phase === 'play' ? turnIncome(game, game.current) : null,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        commandCount: game.commands.length,
        events: events ? game.events.map(event => ({ ...event })) : []
    };
}
