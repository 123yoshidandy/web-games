/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る
 * - ほかの人の手札は、山ごとの枚数だけ（カードの裏で山の種類は分かる）
 * - 山の並びとシードは入れない
 * - ほかの人の選択は、題だけ（選択肢には手札のカードが出るため）
 * - 畑・ブドウ・ワイン・建物・リラ・点・人は全員に見せる
 */

import { CARDS, DECKS } from './cards.js';
import { slotCount } from './game.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const actors = game.actors();
    const myTurn = seat !== null && game.turnOpen && game.current === seat && !game.pending;
    const pending = game.pending
        ? (game.pending.seat === seat
            ? { id: game.pending.id, seat: game.pending.seat, handler: game.pending.handler, title: game.pending.title, options: structuredClone(game.pending.options) }
            : { id: game.pending.id, seat: game.pending.seat, title: game.pending.title })
        : null;
    return {
        you: seat,
        year: game.year,
        season: game.season,
        first: game.first,
        current: game.current,
        turnOpen: game.turnOpen,
        actors,
        order: [...game.order],
        pickers: [...game.pickers],
        wakeTaken: [...game.wakeTaken],
        slotCount: slotCount(game.players.length),
        spaces: structuredClone(game.spaces),
        players: game.players.map(p => {
            const mine = p.id === seat || game.isOver();
            return {
                id: p.id,
                name: p.name,
                isCPU: p.isCPU,
                lira: p.lira,
                vp: p.vp,
                residual: p.residual,
                workers: p.workers,
                temp: p.temp,
                fresh: p.fresh,
                used: p.used,
                available: game.availableWorkers(p),
                grandeFree: p.grandeFree,
                fields: p.fields.map(f => ({ max: f.max, vines: [...f.vines], sold: f.sold, harvested: f.harvested })),
                crush: { red: [...p.crush.red], white: [...p.crush.white] },
                cellar: structuredClone(p.cellar),
                structures: [...p.structures],
                wake: p.wake,
                passed: p.passed,
                yokeUsed: p.yokeUsed,
                mama: p.mama,
                papa: p.papa,
                handCount: p.hand.length,
                handCounts: Object.fromEntries(DECKS.map(deck => [deck, p.hand.filter(id => CARDS[id].deck === deck).length])),
                hand: mine ? [...p.hand] : []
            };
        }),
        decks: Object.fromEntries(DECKS.map(deck => [deck, game.decks[deck].length])),
        discards: Object.fromEntries(DECKS.map(deck => [deck, game.discards[deck].length])),
        pending,
        // 自分の番のときだけ、置ける場所を入れる
        placements: myTurn && (game.season === 'summer' || game.season === 'winter') ? game.legalPlacements(seat) : [],
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        commandCount: game.commands.length
    };
}
