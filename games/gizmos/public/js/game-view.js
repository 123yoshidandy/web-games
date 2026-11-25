/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * 山札の並びは入れず、枚数だけ。研究で引いたカードは、研究している本人にだけ見せる（ほかの人には枚数だけ）
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { CARDS, LEVELS, limitsOf, isBlocked, pointsOf, countEnergy, isAutomatic } from './game.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const players = game.players.map(p => ({
        id: p.id,
        name: p.name,
        isCPU: p.isCPU,
        energy: { ...p.energy },
        archive: [...p.archive],
        built: [...p.built],
        vp: p.vp,
        points: pointsOf(p),
        limits: limitsOf(p),
        blocked: { file: isBlocked(p, 'file'), research: isBlocked(p, 'research') },
        level3: p.built.filter(id => CARDS[id].level === 3).length
    }));
    const mine = seat !== null && seat === game.current;
    const usable = game.phase === 'chain' ? game.usablePending() : [];
    return {
        you: seat,
        players,
        display: Object.fromEntries(LEVELS.map(level => [level, [...game.display[level]]])),
        deckCounts: Object.fromEntries(LEVELS.map(level => [level, game.decks[level].length])),
        row: [...game.row],
        dispenserCount: countEnergy(game.dispenser),
        current: game.current,
        startPlayer: game.startPlayer,
        turn: game.turn,
        phase: game.phase,
        finalRound: game.finalRound,
        used: [...game.used],
        // 働いて待っているギズモ（今使えるものだけ）。auto：選ぶ必要がない効果
        pending: usable.map(entry => ({ gizmo: entry.gizmo, left: entry.left, auto: isAutomatic(CARDS[entry.gizmo].effect) })),
        research: game.research
            ? { level: game.research.level, count: game.research.cards.length, cards: mine ? [...game.research.cards] : null }
            : null,
        winners: [...game.winners],
        endReason: game.endReason,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => structuredClone(event))
    };
}
