/**
 * ビュー：そのプレイヤーから見てよい情報だけの JSON
 * プエルトリコはほとんどが公開されている。隠すのは農園の山の並び（枚数だけ）と、ほかの人の判断の中身（誰が何を決めているかだけ）
 */

import { GOODS, BUILDINGS } from './data.js';

export function createGameView(game, seat, { since = null } = {}) {
    const d = game.decision;
    const mine = d && seat !== null && d.seat === seat;
    return {
        seat,
        phase: game.phase,
        round: game.round,
        governor: game.governor,
        roleKey: game.roleKey ?? null,
        roleSeat: game.roleSeat ?? null,
        roles: game.roles.map(r => ({ ...r })),
        colonists: game.colonists,
        shipColonists: game.shipColonists,
        chips: game.chips,
        supply: { ...game.supply },
        quarries: game.quarries,
        deckCount: game.deck.length,
        faceUp: [...game.faceUp],
        buildings: { ...game.buildings },
        ships: game.ships.map(s => ({ ...s })),
        tradingHouse: [...game.tradingHouse],
        endTriggered: game.endTriggered,
        players: game.players.map((p, i) => ({
            id: p.id, name: p.name, isCPU: p.isCPU, money: p.money, chips: p.chips,
            island: p.island.map(t => ({ ...t })), city: p.city.map(c => ({ ...c })), sanJuan: p.sanJuan, goods: { ...p.goods },
            citySpaces: game.citySpaces(i),
            score: game.scores ? { ...game.scores[i] } : null
        })),
        decision: d ? (mine ? structuredClone(d) : { seat: d.seat, kind: d.kind }) : null,
        options: mine ? optionsFor(game, seat, d) : null,
        winners: game.winners ? [...game.winners] : null,
        eventSeq: game.eventSeq,
        events: game.events.filter(e => since === null || e.seq > since).map(e => structuredClone(e))
    };
}

function optionsFor(game, seat, d) {
    switch (d.kind) {
        case 'build': {
            const can = new Set(game.buildable(seat));
            return { costs: Object.fromEntries(BUILDINGS.map(x => [x.key, game.buildCost(seat, x.key)])), buildable: [...can] };
        }
        case 'sell': {
            const list = game.sellable(seat);
            return { sellable: list, prices: Object.fromEntries(GOODS.map(g => [g, game.sellPrice(seat, g)])) };
        }
        case 'mayor':
            return { total: game.totalColonists(seat) };
        default:
            return null;
    }
}
