/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * 手札は本人だけ（ほかの人は枚数）。選んだカードは、公開するまで「選んだかどうか」だけ（本人には自分のカード）
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { sumBulls } from './game.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            handCount: p.hand.length,
            taken: p.taken.length,
            bulls: sumBulls(p.taken),
            score: p.score,
            selected: game.selected[p.id] !== null
        })),
        hand: seat === null ? [] : [...game.players[seat].hand],
        mySelection: seat === null ? null : game.selected[seat],
        rows: game.rows.map(row => [...row]),
        round: game.round,
        turn: game.turn,
        phase: game.phase,
        pending: game.pending.map(p => ({ ...p })),   // 公開して、まだ置いていないカード
        chooser: game.phase === 'chooseRow' ? game.pending[0].seat : null,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => hideEvent(event, seat)) : []
    };
}

// 配った手札は、本人の分だけを見せる
function hideEvent(event, seat) {
    if (event.type === 'deal') {
        const { hands, ...rest } = event;
        return { ...structuredClone(rest), hand: seat === null ? [] : [...hands[seat]] };
    }
    return structuredClone(event);
}
