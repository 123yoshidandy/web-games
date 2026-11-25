/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 戦闘カードの数字と目標カードは本人だけ（ほかの人は枚数だけ）。達成した目標は公開する
 * - 戦闘で選んだ力とカードは、両方がそろって明かされるまで伏せる（選び終えたかどうかだけ）
 * - 山札の並びは見せない（枚数だけ）
 * 盤面の形は rules.js の S と同じなので、画面でも同じルールの関数（移動できる先など）を使える
 */

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const over = game.isOver();
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id, name: p.name, isCPU: p.isCPU, faction: p.faction, mat: p.mat,
            power: p.power, popularity: p.popularity, coins: p.coins,
            cardCount: p.cards.length,
            cards: p.id === seat || over ? [...p.cards] : null,
            objectives: p.id === seat || over ? [...p.objectives] : null,
            objectiveCount: p.objectives.length,
            doneObjectives: [...p.doneObjectives],
            upgrades: structuredClone(p.upgrades),
            mechs: [...p.mechs], recruits: [...p.recruits], oneTime: [...p.oneTime], built: [...p.built],
            stars: { ...p.stars }, combatStars: p.combatStars, starCount: p.starCount,
            lastSection: p.lastSection, factoryCard: p.factoryCard, coercionUsed: p.coercionUsed
        })),
        units: game.units.map(u => ({ ...u })),
        structures: game.structures.map(s => ({ ...s })),
        res: game.res.map(r => ({ ...r })),
        encounters: [...game.encounters],
        structureBonus: game.structureBonus,
        turn: game.turn,
        turnCount: game.turnCount,
        step: game.step,
        section: game.section,
        combat: game.combat ? {
            hex: game.combat.hex, attacker: game.combat.attacker, defender: game.combat.defender,
            chosen: Object.keys(game.combat.choices).map(Number),
            allowance: { [game.combat.attacker]: game.cardAllowance(game.combat.attacker, game.combat.hex), [game.combat.defender]: game.cardAllowance(game.combat.defender, game.combat.hex) }
        } : null,
        encounter: game.encounter ? { ...game.encounter } : null,
        factoryOffer: game.factoryOffer && (seat === game.turn || over) ? [...game.factoryOffer] : null,
        produceCost: game.phase === 'play' ? game.produceCost(game.turn) : null,
        decks: { combat: game.combatDeck.length, encounter: game.encounterDeck.length, factory: game.factoryDeck.length },
        phase: game.phase,
        winners: [...game.winners],
        endReason: game.endReason,
        results: over ? game.results() : null,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => structuredClone(event)) : []
    };
}
