/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 手札の地形カードは本人だけ。手番の人のカードは、場に出したものとして全員に見せる
 * - 山は枚数だけ。捨て札と取り除いたカードは、表なので全員に見せる
 * - シードは入れない
 * 盤面の項目（terrain・owner・locations・players・cards など）はゲームと同じ形なので、rules.js の関数にそのまま渡せる
 * CPU もこのビューだけを見て決める（cpu-player.js）
 */

import { scoreAll } from './rules.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか（CPU には要らない）
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const playing = game.phase === 'play';
    return {
        you: seat,
        phase: game.phase,
        turn: game.turn,
        round: game.round,
        start: game.start,
        active: game.active,
        actors: game.actors(),
        boards: game.boards.map(b => ({ ...b })),
        cards: [...game.cards],
        terrain: game.terrain,
        owner: [...game.owner],
        locations: game.locations.map(l => ({ ...l })),
        built: game.built,
        mandatoryDone: game.mandatoryDone,
        finalRound: game.finalRound,
        deckCount: game.deck.length,
        discard: [...game.discard],
        removed: [...game.removed],
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            supply: p.supply,
            card: p.id === seat || (playing && p.id === game.active) ? p.card : null,
            tiles: p.tiles.map(t => ({ ...t })),
            lost: [...p.lost]
        })),
        scores: game.scores ? structuredClone(game.scores) : scoreAll(game),
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        commandCount: game.commands.length,
        events: events ? game.events.map(event => ({ ...event })) : []
    };
}
