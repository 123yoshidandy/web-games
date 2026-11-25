/**
 * プレイヤーから見るビュー（JSON にできる形）
 * 街コロには隠す情報がない（コイン・施設・ランドマークは全員に見える）ので、全員の分をそのまま入れる
 * そのうえで、見ている人の番でできること（建てられるもの、2個振れるか、など）を足す
 */

import { landmarkCount } from './game.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const mine = seat !== null && seat === game.current && !game.isOver();
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            coins: p.coins,
            cards: { ...p.cards },
            landmarks: { ...p.landmarks },
            built: landmarkCount(p)
        })),
        supply: { ...game.supply },
        current: game.current,
        turn: game.turn,
        phase: game.phase,
        dice: [...game.dice],
        rerolled: game.rerolled,
        // 自分の番でできること
        canRollTwo: mine && game.phase === 'roll' && game.canRollTwo(seat),
        buildable: mine && game.phase === 'build' ? game.buildable(seat) : [],
        tvTargets: mine && game.phase === 'tv' ? game.tvTargets(seat) : [],
        tradeable: mine && game.phase === 'trade' ? game.tradeable(seat) : [],
        winner: game.winner,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(event => structuredClone(event))
    };
}
