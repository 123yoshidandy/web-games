/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 相手の手札は枚数だけ。山札は枚数だけ。除いた1枚は見せない
 * - 相手の秘密と放棄は、使ったかどうかだけ。自分の分は中身も見せる
 * - ラウンドの終わりのイベント（roundEnd）で、両者の秘密のカードを公開する
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    return {
        you: seat,
        players: game.players.map(p => {
            const mine = p.id === seat;
            return {
                id: p.id,
                name: p.name,
                isCPU: p.isCPU,
                handCount: p.hand.length,
                hand: mine ? [...p.hand] : null,
                secretUsed: p.used.includes('secret'),
                secret: mine ? p.secret : null,
                discardUsed: p.used.includes('discard'),
                discards: mine ? [...p.discards] : null,
                placed: [...p.placed],
                used: [...p.used],
                points: p.points,
                geishas: p.geishas
            };
        }),
        favor: [...game.favor],
        deckCount: game.deck.length,
        pending: game.pending ? structuredClone(game.pending) : null,
        round: game.round,
        current: game.current,
        actor: game.actor(),
        phase: game.phase,
        winner: game.winner,
        history: structuredClone(game.history),
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => hideEvent(event, seat)) : []
    };
}

// 配った手札・引いたカード・秘密・放棄は、本人の分だけ見せる
function hideEvent(event, seat) {
    if (event.type === 'deal') {
        const { hands, ...rest } = event;
        return { ...structuredClone(rest), hand: seat === null ? null : [...hands[seat]] };
    }
    if (event.seat !== seat) {
        if (event.type === 'draw' || event.type === 'secret') return { ...event, card: null };
        if (event.type === 'discard') return { ...event, cards: null };
    }
    return structuredClone(event);
}
