/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 手札は本人だけ（ほかの人は枚数）
 * - 渡す札は、選んだかどうかだけ（本人には自分の札）。渡したあとは、自分が渡した札ともらった札だけ
 * - 取った札の失点と合計は全員に見せる
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const mine = seat !== null;
    return {
        you: seat,
        ...game.publicState(),
        hand: mine ? [...game.players[seat].hand] : [],
        myPass: mine ? game.passes[seat] : null,
        legal: mine ? game.legalFor(seat) : [],
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => hideEvent(event, seat)) : []
    };
}

// 配った手札と渡した札は、本人の分だけを見せる
function hideEvent(event, seat) {
    if (event.type === 'deal') {
        const { hands, ...rest } = event;
        return { ...structuredClone(rest), hand: seat === null ? [] : [...hands[seat]] };
    }
    if (event.type === 'exchange') {
        const { hands, sent, received, ...rest } = event;
        return {
            ...structuredClone(rest),
            hand: seat === null ? [] : [...hands[seat]],
            sent: seat === null ? [] : [...sent[seat]],
            received: seat === null ? [] : [...received[seat]]
        };
    }
    return structuredClone(event);
}
