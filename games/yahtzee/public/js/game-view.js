/**
 * プレイヤーから見るビュー（JSON にできる形）
 * ヤッツィーには伏せる情報がないので、だれから見ても同じ中身になる（you だけが違う）
 * 手番の人が振ったあとは、記入できる欄と、そこに書いたときの点数（先読み）を入れる
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { ROLLS, ROUNDS, pointsFor, totalsOf, isJoker } from './game.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const over = game.isOver();
    const current = over ? null : game.players[game.turn];
    const rolled = !over && game.hasRolled();
    const options = rolled
        ? Object.fromEntries(game.legal().map(c => [c, pointsFor(current.scores, game.dice, c)]))
        : {};
    return {
        you: seat,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            scores: { ...p.scores },
            yahtzeeBonus: p.yahtzeeBonus,
            totals: totalsOf(p)
        })),
        turn: over ? null : game.turn,
        round: game.round,
        rounds: ROUNDS,
        dice: [...game.dice],
        kept: [...game.kept],
        rollsLeft: game.rollsLeft,
        rolls: ROLLS,
        rolled,
        options,                     // { 欄: { points, bonus } }。振る前と終わったあとは空
        joker: rolled && isJoker(current.scores, game.dice),
        phase: game.phase,
        winners: [...game.winners],
        results: over ? game.results() : null,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => structuredClone(event)) : []
    };
}
