/**
 * ビュー：そのプレイヤーから見てよい情報だけの JSON
 * キング・オブ・トーキョーは、ほとんどの情報が公開されている。隠すのは山札の並びだけ（研究所生まれの持ち主が買う番のときは、一番上だけを見せる）
 * 判断（decision）の中身は、決める人にだけ渡す。ほかの人には、誰が何を決めているかだけを渡す
 */

import { cardOf } from './cards.js';

export function createGameView(game, seat, { since = null } = {}) {
    const d = game.decision;
    const mine = d && seat !== null && d.seat === seat;
    return {
        seat,
        phase: game.phase,
        current: game.current,
        turnNo: game.turnNo,
        dice: [...(game.dice ?? [])],
        rerollsLeft: game.turn?.rerollsLeft ?? 0,
        tokyo: { ...game.tokyo },
        bayInUse: game.bayInUse(),
        market: [...game.market],
        deckCount: game.deck.length,
        topCard: mine && d.kind === 'buy' && game.has(seat, 'madeInALab') ? game.deck.at(-1) ?? null : null,
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU, monster: p.monster,
            health: p.health, maxHealth: game.maxHealth(p.id), vp: p.vp, energy: p.energy, alive: p.alive,
            cards: [...p.cards], poison: p.poison, shrink: p.shrink, mimic: p.mimic ? { ...p.mimic } : null,
            battery: p.battery, smoke: p.smoke, inTokyo: game.inTokyo(p.id)
        })),
        decision: d ? (mine ? structuredClone(d) : { seat: d.seat, kind: d.kind }) : null,
        // 自分が決める番なら、使える操作の材料
        options: mine ? optionsFor(game, seat) : null,
        winner: game.winner,
        eventSeq: game.eventSeq,
        events: game.events.filter(e => since === null || e.seq > since).map(e => structuredClone(e))
    };
}

function optionsFor(game, seat) {
    const d = game.decision;
    const p = game.players[seat];
    if (d.kind === 'roll') {
        return {
            canReroll: game.turn.rerollsLeft > 0 || p.smoke > 0 || (game.has(seat, 'energyDrink') && p.energy >= 1),
            dweller: game.has(seat, 'backgroundDweller'),
            herdCuller: game.has(seat, 'herdCuller') && !game.turn.herdCuller,
            plotTwist: game.ownsKey(seat, 'plotTwist'),
            stretchy: game.has(seat, 'stretchy') && p.energy >= 2,
            smoke: p.smoke,
            energyDrink: game.has(seat, 'energyDrink')
        };
    }
    if (d.kind === 'buy') {
        const costs = Object.fromEntries(game.market.map(id => [id, game.cardCost(seat, id)]));
        const fromOthers = game.has(seat, 'parasiticTentacles')
            ? game.players.filter(o => o.alive && o.id !== seat).flatMap(o => o.cards.map(id => ({ seat: o.id, card: id, cost: game.cardCost(seat, id) })))
            : [];
        const top = game.has(seat, 'madeInALab') && game.deck.length ? { card: game.deck.at(-1), cost: game.cardCost(seat, game.deck.at(-1)) } : null;
        return { costs, fromOthers, top, canSweep: p.energy >= 2 && game.deck.length > 0 };
    }
    return {};
}

export const cardName = id => cardOf(id).name;
