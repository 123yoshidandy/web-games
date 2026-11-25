/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 山は枚数だけ（並びと、段階3のカードの位置は見せない）。準備で伏せて抜いた発電所も見せない
 * - お金・発電所・資源・都市は、全員に見せる（電力会社では公開の情報）
 * - シードは入れない
 * 盤面の項目（mapId・regions・houses・step・market・resources・players）はゲームと同じ形なので、rules.js の関数にそのまま渡せる
 * CPU もこのビューだけを見て決める（cpu-player.js）
 */

export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const a = game.auction;
    return {
        you: seat,
        phase: game.phase,
        round: game.round,
        step: game.step,
        step3Pending: game.step3Pending,
        mapId: game.mapId,
        regions: [...game.regions],
        houses: structuredClone(game.houses),
        market: [...game.market],
        resources: { ...game.resources },
        deckCount: game.deck.length,
        order: [...game.order],
        turn: game.turn,
        actors: game.actors(),
        setup: { ...game.setup },
        auction: a ? {
            bought: [...a.bought],
            skipped: [...a.skipped],
            chooser: a.chooser,
            discard: a.discard,
            justBought: a.justBought,
            current: a.current ? structuredClone(a.current) : null
        } : null,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            money: p.money,
            plants: [...p.plants],
            res: { ...p.res },
            cities: game.cities(p.id),
            lastPowered: p.lastPowered,
            lastIncome: p.lastIncome
        })),
        final: game.final ? structuredClone(game.final) : null,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        commandCount: game.commands.length,
        events: events ? game.events.map(event => ({ ...event })) : []
    };
}
