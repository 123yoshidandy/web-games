/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 相手の手札は枚数だけ。山札とボーナスの山は枚数だけ
 * - ボーナストークンは伏せてもらうので、相手の分は枚数（3・4・5枚売りのどれか）だけ。自分の分は値も見せる
 *   ラウンドの終わりのイベント（roundEnd）では、両者の値を公開する
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { GOODS } from './game.js';

const sum = (list) => list.reduce((s, v) => s + v, 0);

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
                herd: p.herd,
                tokens: p.tokens.map(t => ({ ...t })),
                tokenPoints: sum(p.tokens.map(t => t.value)),
                bonus: p.bonus.map(b => (mine ? { ...b } : { size: b.size, value: null })),
                bonusPoints: mine ? sum(p.bonus.map(b => b.value)) : null,
                seals: p.seals
            };
        }),
        market: [...game.market],
        deckCount: game.deck.length,
        goodsTokens: Object.fromEntries(GOODS.map(g => [g, [...game.goodsTokens[g]]])),
        bonusCounts: Object.fromEntries(Object.entries(game.bonusTokens).map(([size, list]) => [size, list.length])),
        round: game.round,
        current: game.current,
        phase: game.phase,
        winner: game.winner,
        history: structuredClone(game.history),
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => hideEvent(event, seat)) : []
    };
}

// 配った手札は本人の分だけ。相手が売ってもらったボーナスの値は見せない
function hideEvent(event, seat) {
    if (event.type === 'deal') {
        const { hands, ...rest } = event;
        return { ...structuredClone(rest), hand: seat === null ? null : [...hands[seat]] };
    }
    if (event.type === 'sell' && event.bonus && event.seat !== seat) {
        return { ...structuredClone(event), bonus: { size: event.bonus.size, value: null } };
    }
    return structuredClone(event);
}
