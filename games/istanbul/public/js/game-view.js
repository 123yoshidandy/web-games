/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - ボーナスカードの手札は本人だけ。ほかの人は枚数だけ
 * - 山札は枚数だけ。捨て札は一番上だけ（隊商宿で取れるため）
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { capacityOf, sultanNeed } from './game.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const step = game.step ?? {};
    return {
        you: seat,
        layout: [...game.layout],
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            lira: p.lira,
            goods: { ...p.goods },
            ext: p.ext,
            capacity: capacityOf(p),
            rubies: p.rubies,
            tiles: [...p.tiles],
            cardCount: p.cards.length,
            cards: p.id === seat ? [...p.cards] : null,
            merchant: p.merchant,
            stack: p.stack,
            assistants: [...p.assistants],
            family: p.family
        })),
        turn: game.phase === 'play' ? game.turn : null,
        startSeat: game.startSeat,
        round: game.round,
        phase: game.phase,
        step: {
            stage: step.stage ?? null,
            place: step.place ?? null,
            actPlace: step.actPlace ?? null,
            via: step.via ?? null,
            payCost: step.payCost ?? 0,
            dice: step.dice ? [...step.dice] : null,
            diceFor: step.diceFor ?? null,
            bet: step.bet ?? null,
            draws: step.draws ?? 0,
            encounters: step.encounters ? structuredClone(step.encounters) : [],
            yellowUsed: !!step.yellowUsed,
            acted: !!step.acted
        },
        governor: game.governor,
        smuggler: game.smuggler,
        neutrals: [...game.neutrals],
        deckCount: game.deck.length,
        discardTop: game.discard.at(-1) ?? null,
        discardCount: game.discard.length,
        demand: { small: game.demand.small[0], large: game.demand.large[0] },
        post: game.post,
        gemPrice: game.gemPrice,
        sultanCount: game.sultanCount,
        sultanNeed: sultanNeed(game.sultanCount),
        mosqueTiles: structuredClone(game.mosqueTiles),
        mosqueRubies: { ...game.mosqueRubies },
        rubyTarget: game.rubyTarget(),
        endTriggered: game.endTriggered,
        winners: [...game.winners],
        results: game.finalResults ? structuredClone(game.finalResults) : null,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => structuredClone(event)) : []
    };
}
