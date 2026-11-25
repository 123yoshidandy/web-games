/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（手札を隠す役目もここで持つ）
 * - ほかの人の手札は枚数だけ
 * - 選んだ札は、全員がそろって表にするまで本人にだけ見せる。ほかの人には「選んだかどうか」だけ
 * - 前に置いた札（場）とプリンの数、得点は全員に見せる
 * - 山は枚数だけ。シードと CPU の値（cpuSalt）は入れない
 */

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            handCount: p.hand.length,
            hand: p.id === seat ? [...p.hand] : null,
            picked: p.picked !== null,
            pick: p.id === seat && p.picked ? [...p.picked] : null,
            tableau: p.tableau.map(c => ({ ...c })),
            puddings: p.puddings,
            score: p.score,
            rounds: [...p.rounds]
        })),
        deckCount: game.deck.length,
        round: game.round,
        turn: game.turn,
        handSize: game.handSize,
        phase: game.phase,
        canUseChopsticks: seat !== null && game.phase === 'pick' && !game.players[seat].picked && game.canUseChopsticks(seat),
        roundResult: game.roundResult ? structuredClone(game.roundResult) : null,
        puddingResult: game.puddingResult ? [...game.puddingResult] : null,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => structuredClone(event))
    };
}
