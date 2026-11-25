/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（手札を隠す役目もここで持つ）
 * - ほかの人の手札は枚数だけ。捨て札はいちばん上と枚数（外交官でまねられるのは、いちばん上だけ）
 * - 市場の山札は枚数と、次の山の番号（I〜V）だけ。並びは入れない
 * - 品・お金・倉庫の植民者・家・盤上の植民者は、だれのものも見える
 * - ゲームが終わったら、全員の手札と得点の内訳を見せる
 */

import { scorePlayer } from './scoring.js';

const cardOf = (game, id) => ({ id, type: game.cards[id].type });

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const over = game.isOver();
    const players = game.players.map(p => {
        const open = p.id === seat || over;
        return {
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            color: p.color,
            money: p.money,
            goods: { ...p.goods },
            store: { ...p.store },
            handCount: p.hand.length,
            hand: open ? p.hand.map(id => cardOf(game, id)) : null,
            discardCount: p.discard.length,
            discardTop: p.discard.length ? cardOf(game, p.discard.at(-1)) : null,
            discard: open ? p.discard.map(id => cardOf(game, id)) : null,
            housesLeft: game.housesLeft(p.id),
            storeUsed: game.storeUsed(p),
            concordia: p.concordia,
            // 持っているカードの枚数（買ったカードは公開されているので、全員に見せる）
            cardCount: p.hand.length + p.discard.length,
            // 得点の見込み：自分と、終わったあとは全員
            score: open ? scorePlayer(game, p.id) : null
        };
    });
    const nextCard = game.deck.length ? game.cards[game.deck[0]] : null;
    return {
        you: seat,
        players,
        current: game.current,
        phase: game.phase,
        turn: game.turn,
        magnus: game.magnus,
        colonists: game.colonists.map(c => ({ ...c })),
        houses: structuredClone(game.houses),
        cityGoods: { ...game.cityGoods },
        bonus: structuredClone(game.bonus),
        display: game.display.map(id => (id === null ? null : cardOf(game, id))),
        deckCount: game.deck.length,
        deckPhase: nextCard?.phase ?? null,
        architect: game.architect ? { ...game.architect } : null,
        finalTurns: game.finalTurns ? [...game.finalTurns] : null,
        concordiaBy: game.concordiaBy,
        results: game.results ? structuredClone(game.results) : null,
        winners: game.winners ? [...game.winners] : [],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => sanitizeEvent(event, seat))
    };
}

function sanitizeEvent(event, seat) {
    const { visibleTo, ...rest } = event;
    if (visibleTo && !visibleTo.includes(seat)) delete rest.card;
    return structuredClone(rest);
}
