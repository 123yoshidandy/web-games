/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * アグリコラは、農場・資源・動物がすべて公開されている。隠すのは、これから出るラウンドカードの順とシードだけ
 * CPU もこのビューだけを見て決める（cpu-player.js）
 */

import { SPACES, HARVEST_ROUNDS, ROUNDS } from './cards.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか（CPU には要らない）
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const actors = game.actors();
    const myWork = seat !== null && game.phase === 'work' && !game.pending && game.current === seat;
    return {
        you: seat,
        solo: game.solo,
        round: game.round,
        rounds: ROUNDS,
        harvestRounds: [...HARVEST_ROUNDS],
        phase: game.phase,
        startPlayer: game.startPlayer,
        current: game.current,
        actors,
        spaces: game.spaces.map(id => ({ id, goods: { ...game.goods[id] }, by: game.occupied[id] ?? null, isRound: !!SPACES[id] && game.roundCards.includes(id) })),
        roundCardsLeft: ROUNDS - game.round,
        majorsLeft: [...game.majorsLeft],
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            members: p.members,
            newborns: p.newborns,
            available: p.available,
            food: p.food,
            foodNeed: game.foodNeed(p),
            res: { ...p.res },
            animals: { ...p.animals },
            farm: structuredClone(p.farm),
            majors: [...p.majors],
            begging: p.begging,
            wellRounds: [...p.wellRounds],
            final: p.final ? { ...p.final } : null
        })),
        pending: game.pending ? structuredClone(game.pending) : null,
        feeding: [...game.feeding],
        legalSpaces: myWork ? game.legalSpaces(seat) : [],
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        commandCount: game.commands.length,
        events: events ? game.events.map(event => structuredClone(event)) : []
    };
}
