/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（隠す役目もここで持つ）
 * - 山は枚数だけ（並びは入れない）
 * - コインはカードの裏なので、各自の枚数だけ（どのカードかは入れない）
 * - 捨て札は表なので、一番上のカードと枚数
 * - シードと CPU の迷いに使う値（cpuSalt）は入れない
 * 港・遠征・全員の人物と遠征は全員に見える
 */

import { swordsOf, pointsOf, hireCost, expeditionPayment, baseTakes } from './game.js';
import { bustChance } from './cpu-player.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const mine = seat !== null && game.actors().includes(seat);
    const me = seat !== null ? game.players[seat] : null;
    const takable = mine && game.phase === 'trade' ? game.harbor.filter(id => game.canTake(seat, id)) : [];
    const canClaim = mine && seat === game.current && (game.phase === 'discover' || (game.phase === 'trade' && game.taker === seat));
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            coins: p.coins.length,
            points: pointsOf(p),
            swords: swordsOf(p),
            display: [...p.display],
            expeditions: [...p.expeditions]
        })),
        deckCount: game.deck.length,
        discardTop: game.discardPile.at(-1) ?? null,
        discardCount: game.discardPile.length,
        harbor: [...game.harbor],
        pendingShip: game.pendingShip,
        expeditions: [...game.expeditions],
        phase: game.phase,
        current: game.current,
        start: game.start,
        actors: game.actors(),
        turn: game.turn,
        drawn: game.drawnThisTurn,
        baseTakes: game.phase === 'trade' ? game.baseTakes : baseTakes(game.harbor),
        takesLeft: game.phase === 'trade' ? game.takesLeft : 0,
        endTriggered: game.endTriggered,
        // 自分ができること
        takable,
        prices: me ? Object.fromEntries(game.harbor.filter(id => game.constructor.isPerson(id)).map(id => [id, hireCost(me, id)])) : {},
        income: me ? Object.fromEntries(game.harbor.filter(id => !game.constructor.isPerson(id)).map(id => [id, game.shipIncome(me, id)])) : {},
        claimable: canClaim ? game.expeditions.filter(id => expeditionPayment(me, id)) : [],
        risk: mine && game.phase === 'discover' && game.drawnThisTurn > 0 ? bustChance(game, seat) : null,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => structuredClone(event))
    };
}
