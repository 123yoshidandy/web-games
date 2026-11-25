/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 手札の中身は本人だけ。ほかの人には枚数だけ
 * - 所持金は本人だけ（原作では衝立の裏に伏せる）。終わったら全員に見せる
 * - 入札で握った額は本人の分だけ。ほかの人は「握ったかどうか」だけ（開いた額は記録に出る）
 * - 山は枚数だけ。シードは入れない
 * CPU もこのビューだけを見て決める（cpu-player.js）
 */

export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const a = game.auction;
    const over = game.phase === 'end';
    return {
        you: seat,
        phase: game.phase,
        round: game.round,
        auctioneer: game.auctioneer,
        actors: game.actors(),
        tokens: game.tokens.map(row => [...row]),
        counts: [...game.counts],
        history: structuredClone(game.history),
        deckCount: game.deck.length,
        lot: game.lot ? { cards: [...game.lot.cards], seller: game.lot.seller, first: game.lot.first, offer: game.lot.offer ?? null } : null,
        auction: a ? {
            type: a.type,
            high: a.high,
            highBidder: a.highBidder,
            turn: a.turn,
            order: [...a.order],
            passed: [...a.passed],
            price: a.price,
            sealedDone: game.players.map(p => p.id in a.sealed),
            mySealed: seat !== null && seat in a.sealed ? a.sealed[seat] : null
        } : null,
        last: game.last ? structuredClone(game.last) : null,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            handCount: p.hand.length,
            hand: p.id === seat ? [...p.hand] : null,
            money: p.id === seat || over ? p.money : null,
            won: [...p.won]
        })),
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        commandCount: game.commands.length,
        events: events ? game.events.map(event => ({ ...event })) : []
    };
}
