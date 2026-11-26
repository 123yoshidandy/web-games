/**
 * そのプレイヤーから見てよい情報だけのビュー
 * 盤面・市場・商人・お金・得点は公開。手札は自分の分だけ、山札は枚数だけ送る（乱数の状態も送らない）
 * ビューの state は、ルールの関数（rules.js の buildOptions など）にそのまま渡せる形にしてある
 */

import { incomeLevel, currentSeat } from './rules.js';

export function createGameView(game, seat, { since = 0 } = {}) {
    // 乱数の状態（rng）は入れない。そこから山札の並びや手札を計算できてしまうため
    const { rng: _rng, ...s } = game.state;
    const state = {
        ...s,
        deck: [],
        deckCount: s.deck.length,
        players: s.players.map((p, i) => ({
            ...p,
            hand: i === seat ? p.hand : [],
            handCount: p.hand.length,
            income: incomeLevel(p.incomeSpace)
        }))
    };
    return {
        seat,
        state,
        current: currentSeat(s),
        over: s.phase === 'over',
        results: s.phase === 'over' ? game.results() : null,
        logs: game.logs.filter(l => l.seq > since).slice(-120)
    };
}
