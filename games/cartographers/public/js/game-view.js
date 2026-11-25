/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * 地図・得点・コインは公開の情報なので全員分を入れる。山札の並びは入れず、残りの枚数だけ
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { SEASONS, exploreCard, mustFallback } from './game.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const mine = seat !== null && game.pending.includes(seat);
    const card = game.card ? { ...game.card } : null;
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            board: [...p.board],
            coins: game.coinsOf(p),
            seasons: p.seasons.map(s => ({ ...s, edicts: [...s.edicts] })),
            total: game.totalOf(p),
            done: !game.pending.includes(p.id)
        })),
        edicts: [...game.edicts],
        season: game.season,
        time: game.time,
        seasonTime: SEASONS[Math.min(game.season, SEASONS.length - 1)].time,
        deckCount: game.deck.length,
        card,
        ruins: game.ruins,
        phase: game.phase,
        winners: [...game.winners],
        // 自分が描く番のとき：1×1 しか描けないか、襲撃でだれの地図に描くか
        mustPlace: mine && game.phase === 'explore',
        fallback: mine && game.phase === 'explore' && mustFallback(game.players[seat].board, exploreCard(card.id), game.ruins),
        monsterTarget: mine && game.phase === 'ambush' ? game.targets[seat] : null,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => structuredClone(event))
    };
}
