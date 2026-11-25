/**
 * プレイヤーに送るビュー（JSON にできる形）
 * このゲームに隠す情報はない（全員が同じダイスの目で、ボードは見せ合ってよい）。全員のボードと、いまの得点の見込みを入れる
 * 画面と CPU はビューだけを見て判断する。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { scoreBoard } from './scoring.js';

export function createGameView(game, seat, { since = 0, events = true, scores = true } = {}) {
    return {
        you: seat,
        round: game.round,
        dice: [...game.dice],
        phase: game.phase,
        level: game.options.level,
        actors: game.actors(),
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            cells: p.cells.map(c => (c ? { ...c } : null)),
            specialsUsed: [...p.specialsUsed],
            placed: p.placed.map(x => ({ ...x })),
            done: p.done,
            // いまの得点の見込み（このまま終わったときの点）
            score: scores ? (game.results ? game.results[p.id] : scoreBoard(p.cells)) : null
        })),
        winners: [...game.winners],
        logs: game.logs.filter(l => l.n > since).map(l => ({ ...l })),
        logTotal: game.logTotal,
        events: events ? game.events.map(e => structuredClone(e)) : []
    };
}
