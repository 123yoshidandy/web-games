/**
 * ビュー：そのプレイヤーから見てよい情報だけの JSON
 * 隠すもの：ほかの人の手札（枚数だけ）、山札の並び、ほかの人に配られた企業・カード、ほかの人の判断の中身
 */

import { STANDARD_PROJECTS, MILESTONES, AWARDS } from './data.js';

export function createGameView(game, seat, { since = null } = {}) {
    const d = game.decision;
    const mine = d && seat !== null && d.seat === seat;
    return {
        seat,
        phase: game.phase,
        generation: game.generation,
        firstPlayer: game.firstPlayer,
        temperature: game.temperature,
        oxygen: game.oxygen,
        oceans: game.oceans,
        tiles: structuredClone(game.tiles),
        deckCount: game.deck.length,
        milestones: game.milestones.map(m => ({ ...m })),
        awards: game.awards.map(a => ({ ...a })),
        players: game.players.map((p, i) => ({
            id: p.id, name: p.name, isCPU: p.isCPU, corp: p.corp, tr: p.tr, res: { ...p.res }, prod: { ...p.prod },
            handCount: p.hand.length, played: [...p.played], passed: p.passed, tags: game.tags(i), cardRes: { ...p.cardRes }, used: [...p.used], specialDesign: !!p.specialDesign,
            score: game.scores ? { ...game.scores[i] } : null
        })),
        hand: seat === null ? null : [...game.players[seat].hand],
        decision: d ? (mine ? structuredClone(d) : { seat: d.seat, kind: d.kind }) : null,
        options: mine && d.kind === 'action' ? actionOptions(game, seat) : null,
        winners: game.winners ? [...game.winners] : null,
        eventSeq: game.eventSeq,
        events: game.events.filter(e => since === null || e.seq > since).map(e => structuredClone(e))
    };
}

function actionOptions(game, seat) {
    const p = game.players[seat];
    const check = c => game.check(seat, c) === null;
    return {
        playable: p.hand.filter(k => game.canPlay(seat, k)),
        costs: Object.fromEntries(p.hand.map(k => [k, game.cardCost(seat, k)])),
        autoPay: Object.fromEntries(p.hand.filter(k => game.canPlay(seat, k)).map(k => [k, game.autoPay(seat, k)])),
        standard: Object.keys(STANDARD_PROJECTS).filter(k => (k === 'sellPatents' ? p.hand.length > 0 : check({ type: 'standard', project: k }))),
        standardCosts: Object.fromEntries(Object.keys(STANDARD_PROJECTS).map(k => [k, game.standardCost(seat, k)])),
        convertPlants: check({ type: 'convertPlants' }),
        convertHeat: check({ type: 'convertHeat' }),
        milestones: Object.keys(MILESTONES).filter(k => game.canClaim(seat, k)),
        awards: Object.keys(AWARDS).filter(k => game.canFund(seat, k)),
        unmi: game.canUnmi(seat),
        // 使えるカードの行動（カードごとに、使える選び方の番号）
        cardActions: p.played.map(k => ({ card: k, variants: game.actionVariants(k).map((_, i) => i).filter(i => game.canCardAction(seat, k, i)) })).filter(a => a.variants.length),
        greeneryCost: game.greeneryCost(seat),
        // 温度・酸素・海洋の条件をゆるめる段階
        reqSlack: game.reqSlack(seat)
    };
}
