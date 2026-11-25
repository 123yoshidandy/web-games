/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（隠す役目もここで持つ）
 * - ほかの人の手札は枚数だけ。都市（建てた地区）は全員に見せる
 * - 役割は、自分の分と、手番で明かされた分（と、巡の終わりに明かされた殺された役割）だけ
 * - 選んでいる役割の候補は、選んでいる本人にだけ。伏せて捨てた役割は枚数だけ（表で捨てた役割は全員に見せる）
 * - 自分が選んだときに見た候補（offers）と、2人のときに自分で伏せた役割は、本人にだけ（CPU の推測に使う）
 * - 山は枚数だけ。行動で引いた札は本人にだけ
 * - CPU の迷いに使う値（cpuSalt）とシードは入れない（シードから山の並びが分かるため）
 */

import { COMPLETE_CITY } from './game.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const d = game.draft;
    const t = game.turn;
    const over = game.isOver();
    const step = game.phase === 'draft' ? d.steps[d.step] : null;
    const revealedBy = (id) => Object.keys(game.revealed).filter(c => game.revealed[c] === id);
    return {
        you: seat,
        completeCity: COMPLETE_CITY,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            gold: p.gold,
            handCount: p.hand.length,
            hand: p.id === seat ? [...p.hand] : null,
            city: [...p.city],
            hauntedRound: p.hauntedRound,
            completedAt: p.completedAt,
            characters: p.id === seat || over ? [...p.characters] : revealedBy(p.id),
            characterCount: p.characters.length
        })),
        deckCount: game.deck.length,
        round: game.round,
        crown: game.crown,
        phase: game.phase,
        charsPerPlayer: game.charsPerPlayer,
        draft: d ? {
            picker: step?.seat ?? null,
            kind: step?.kind ?? null,
            stepIndex: d.step,
            steps: d.steps.map(s => ({ ...s })),
            faceUp: [...d.faceUp],
            faceDownCount: d.faceDown.length,
            availableCount: d.available.length,
            options: step && step.seat === seat ? game.draftOptions() : null,
            offers: seat !== null ? d.offers[seat].map(o => ({ step: o.step, options: [...o.options] })) : [],
            discarded: seat !== null ? [...d.discarded[seat]] : []
        } : null,
        calling: game.calling,
        revealed: { ...game.revealed },
        killed: game.killed,
        robbed: game.robbed,
        turn: t ? { seat: t.seat, character: t.character, acted: t.acted, built: t.built, buildLimit: t.buildLimit, income: t.income, ability: t.ability, lab: t.lab, smithy: t.smithy } : null,
        // その人ができること
        choices: t && t.seat === seat && game.phase === 'turn' ? game.choices() : null,
        drawn: game.phase === 'keep' && t?.seat === seat ? [...game.drawn] : null,
        drawnCount: game.phase === 'keep' ? game.drawn.length : 0,
        keepCount: game.phase === 'keep' ? game.keepCount : 0,
        grave: game.pendingGrave ? { seat: game.pendingGrave.seat, card: game.pendingGrave.card, warlord: game.pendingGrave.warlord } : null,
        answering: game.actors(),
        firstComplete: game.firstComplete,
        finalRound: game.finalRound,
        scores: game.scores ? game.scores.map(s => ({ ...s })) : null,
        ranking: game.ranking ? [...game.ranking] : null,
        winner: game.winner,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => sanitizeEvent(event, seat))
    };
}

function sanitizeEvent(event, seat) {
    const { visibleTo, ...rest } = event;
    if (visibleTo && !visibleTo.includes(seat)) delete rest.cards;
    return structuredClone(rest);
}
