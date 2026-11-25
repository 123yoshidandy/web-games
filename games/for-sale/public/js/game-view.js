/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 物件・コイン・小切手は全員に見せる（公開の場で動くので、覚えていれば分かる情報）
 * - 後半に出す物件は、そろうまで「出したかどうか」だけ（本人には自分の物件）
 * - 山札の並びと除いたカードは見せない（山札は枚数だけ）。終わったら除いたカードを見せる
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const over = game.isOver();
    const mine = seat !== null && game.actors().includes(seat);
    return {
        you: seat,
        ...game.publicState(),
        mySelection: seat === null ? null : game.selected[seat],
        // 自分の番にできること
        options: mine && game.phase === 'bid' ? { range: game.bidRange(seat), lowest: game.lowestOpen() } : null,
        winners: [...game.winners],
        results: over ? game.results() : null,
        removed: over ? { properties: [...game.removedProps], checks: [...game.removedChecks] } : null,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => structuredClone(event)) : []
    };
}
