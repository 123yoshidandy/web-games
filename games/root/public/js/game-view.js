/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 手札は本人だけ（ほかの人は枚数）。森林連合の支持者も、中身は連合だけ
 * - 遺跡の下のアイテムと山札の並びは見せない
 * - 自分が操作する番なら、取れる操作の一覧（legal）を入れる。画面はこれを見てボタンや光る場所を決める
 */

import { CLEARINGS } from './data.js';

export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const me = seat === null || seat === undefined ? null : seat;
    const actors = game.actors();
    const prompt = game.prompts[0] ?? null;
    const fs = game.fs;
    return {
        you: me,
        phase: game.phase,
        step: game.step,
        turn: game.turn,
        round: game.round,
        actors,
        over: game.isOver(),
        winners: [...game.winners],
        endReason: game.endReason,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            faction: p.faction,
            score: p.score,
            handCount: p.hand.length,
            hand: p.id === me || game.isOver() ? [...p.hand] : null,
            effects: [...p.effects],
            crafted: [...p.crafted],
            dominance: p.dominance,
            coalition: p.coalition,
            supply: game.supply(p.faction)
        })),
        map: game.map.map((m, c) => ({
            id: c,
            warriors: { ...m.warriors },
            buildings: m.buildings.map(b => ({ ...b })),
            tokens: m.tokens.map(t => ({ ...t })),
            ruin: !!m.ruin,
            ruler: game.ruler(c),
            free: game.freeSlots(c),
            slots: CLEARINGS[c].slots
        })),
        marquise: fs.marquise ? {
            wood: game.tokenCount('marquise', 'wood'),
            built: { sawmill: game.buildingCount('marquise', 'sawmill'), workshop: game.buildingCount('marquise', 'workshop'), recruiter: game.buildingCount('marquise', 'recruiter') }
        } : null,
        eyrie: fs.eyrie ? {
            leader: fs.eyrie.leader,
            deposed: [...fs.eyrie.deposed],
            decree: structuredClone(fs.eyrie.decree),
            roosts: game.buildingCount('eyrie', 'roost')
        } : null,
        alliance: fs.alliance ? {
            supporterCount: fs.alliance.supporters.length,
            supporters: game.seatOf.alliance === me || game.isOver() ? [...fs.alliance.supporters] : null,
            officers: fs.alliance.officers,
            sympathy: game.tokenCount('alliance', 'sympathy'),
            bases: game.map.flatMap(m => m.buildings.filter(b => b.kind === 'base').map(b => b.suit))
        } : null,
        vagabond: fs.vagabond ? {
            character: fs.vagabond.character,
            items: fs.vagabond.items.map(i => ({ ...i })),
            clearing: fs.vagabond.clearing,
            forest: fs.vagabond.forest,
            relations: { ...fs.vagabond.relations },
            quests: [...fs.vagabond.quests],
            completed: [...fs.vagabond.completed],
            questDeckCount: fs.vagabond.questDeck.length
        } : null,
        items: { ...game.items },
        deckCount: game.deck.length,
        discard: [...game.discardPile],
        dominancePool: [...game.dominancePool],
        turnState: {
            actions: game.tt.actions, marchLeft: game.tt.marchLeft, recruited: game.tt.recruited, opsUsed: game.tt.opsUsed,
            decreeCol: game.tt.decreeCol, resolved: [...game.tt.resolved], added: game.tt.added, setupBuild: game.tt.setupBuild
        },
        setupFaction: game.phase === 'setup' ? game.setupQueue[0] ?? null : null,
        prompt: prompt && prompt.seat === me ? { ...prompt } : null,
        waitingFor: prompt ? prompt.seat : null,
        legal: me !== null && actors.includes(me) ? game.legalActions(me) : [],
        peek: game.peek && game.peek.seat === me ? { ...game.peek, cards: [...game.peek.cards] } : null,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => structuredClone(event)) : []
    };
}
