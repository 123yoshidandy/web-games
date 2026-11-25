/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 山札の並びは入れず、枚数だけ（最後のラウンドのカードがどこにあるかも見せない）
 * - 集めたカード・列・引いたカードは表向きなので全部見せる。各自の得点の見込みも入れる
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    return {
        you: seat,
        colors: [...game.colors],
        table: game.options.table,
        players: game.players.map(p => {
            const best = game.scoreOf(p);
            return {
                id: p.id,
                name: p.name,
                isCPU: p.isCPU,
                counts: { ...p.counts },
                jokers: p.jokers,
                plus2: p.plus2,
                took: p.took,
                score: best.score,
                positive: best.positive,
                jokerAssignment: best.jokerAssignment
            };
        }),
        rows: game.rows.map(row => ({ cards: [...row.cards], taken: row.taken })),
        deckCount: game.deck.length,
        pending: game.pending,
        round: game.round,
        lastRound: game.lastRound,
        current: game.current,
        phase: game.phase,
        winners: [...game.winners],
        results: game.results ? structuredClone(game.results) : null,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? structuredClone(game.events) : []
    };
}
