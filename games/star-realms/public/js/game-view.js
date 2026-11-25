/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（隠す役目もここで持つ）
 * - 相手の手札は枚数だけ。山札は、自分のも相手のも枚数だけ（並びは入れない）。交易デッキも枚数だけ
 * - 捨て札・場の艦・基地・交易の列・権威・この手番の交易と戦闘は全員に見せる
 * - 選ぶもの（prompt）は、選ぶ人に中身を入れる。相手には種類だけ
 * - シードと CPU の迷いに使う値（cpuSalt）は入れない
 */

const card = (game, id) => ({ id, key: game.keyOf(id) });

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const pr = game.prompts[0] ?? null;
    return {
        you: seat,
        current: game.current,
        turnNumber: game.turnNumber,
        phase: game.phase,
        answering: game.actors(),
        winner: game.winner,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            authority: p.authority,
            handCount: p.hand.length,
            hand: p.id === seat ? p.hand.map(id => card(game, id)) : null,
            deckCount: p.deck.length,
            discard: p.discard.map(id => card(game, id)),
            inPlay: p.inPlay.map(id => card(game, id)),
            bases: p.bases.map(id => card(game, id)),
            pendingDiscard: p.pendingDiscard
        })),
        tradeRow: game.tradeRow.map(id => card(game, id)),
        tradeDeckCount: game.tradeDeck.length,
        explorers: game.explorers,
        scrapCount: game.scrapHeap.length,
        turn: {
            trade: game.turn.trade,
            combat: game.turn.combat,
            fleetHq: game.turn.fleetHq,
            topdeckNext: game.turn.topdeckNext,
            blobPlayed: game.turn.blobPlayed,
            used: structuredClone(game.turn.used)
        },
        prompt: pr ? (pr.seat === seat ? structuredClone(pr) : { kind: pr.kind, seat: pr.seat }) : null,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
