/**
 * ビュー：そのプレイヤーから見てよい情報だけの JSON
 * 隠すもの：ほかの人の手札（枚数だけ）、山札の並び、全員がそろう前の行動、全員がそろう前の開発・入植の中身、
 * ほかの人の判断の中身（誰が何を決めているかだけ）
 */

import { cardOf, keyOf } from './cards.js';

export function createGameView(game, seat, { since = null } = {}) {
    const me = seat === null ? null : game.players[seat];
    const d = seat === null ? null : game.pending[seat];
    return {
        seat,
        phase: game.phase,
        round: game.round,
        advanced: game.options.advanced,
        deckCount: game.deck.length,
        discardCount: game.discardPile.length,
        pool: game.pool,
        revealed: game.revealed,
        players: game.players.map((p, i) => ({
            id: p.id, name: p.name, isCPU: p.isCPU,
            tableau: [...p.tableau], goods: [...p.goods], chips: p.chips,
            handCount: p.hand.length,
            military: game.baseMilitary(i),
            // 行動は全員がそろってから公開する（自分の分は見える）
            actions: game.revealed || i === seat ? (game.chosen[i] ? [...game.chosen[i]] : null) : null,
            chosen: game.chosen[i] !== null,
            waiting: game.pending[i] ? game.pending[i].kind : null,
            score: game.scores ? { ...game.scores[i] } : null
        })),
        hand: me ? [...me.hand] : null,
        decision: d ? structuredClone(d) : null,
        // 自分が決める番なら、開発・入植の費用など（行動を選ぶときも、ボーナスなしの値を入れる）
        options: d ? optionsFor(game, seat, d) : null,
        // 自分が開発・入植で選んだもの（段階の終わりまで）
        myChoice: seat !== null && game.choices[seat] ? structuredClone(game.choices[seat]) : null,
        winner: game.winner,
        winners: game.winners ? [...game.winners] : null,
        eventSeq: game.eventSeq,
        events: game.events.filter(e => since === null || e.seq > since).map(e => structuredClone(e))
    };
}

function optionsFor(game, seat, d) {
    if (!['action', 'develop', 'settle'].includes(d.kind)) return null;
    const p = game.players[seat];
    const phase = d.kind === 'action' ? null : game.phase;
    const develop = {};
    const settle = {};
    const tactics = p.tableau.filter(id => (cardOf(id).powers ?? []).some(pw => pw.phase === 3 && pw.code.includes('DISCARD') && pw.code.includes('EXTRA_MILITARY')));
    const colonyShip = p.tableau.find(id => (cardOf(id).powers ?? []).some(pw => pw.code.includes('REDUCE_ZERO'))) ?? null;
    for (const id of p.hand) {
        const c = cardOf(id);
        if (c.type === 'dev') {
            develop[id] = { cost: game.developCost(seat, id, phase ?? 'none'), duplicate: p.tableau.some(t => keyOf(t) === keyOf(id)) };
        } else {
            const military = !!c.flags?.includes('military');
            const info = { military, cost: military ? null : game.settleCost(seat, id) };
            if (military) {
                info.need = c.cost;
                info.strength = game.military(seat, id);
                if (game.canPayMilitary(seat, id)) info.payCost = game.settleCost(seat, id, { payMilitary: true });
            }
            if (colonyShip && c.good !== 'alien' && (!military || info.payCost !== undefined)) info.colonyShip = true;
            settle[id] = info;
        }
    }
    return { develop, settle, tactics, colonyShip };
}
