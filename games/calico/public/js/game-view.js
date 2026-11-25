/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（袋の順と手札を隠す役目もここで持つ）
 * - ほかの人の手札は枚数だけ。袋は枚数だけ（並びは入れない）
 * - 目標タイルを選ぶ間、ほかの人に配られた4枚と選んだものは入れない（全員が選び終わったら、置いた3枚を見せる）
 * - キルト・ボタン・猫・市場・猫の模様は全員に見せる
 * - シードと CPU の迷いに使う値（cpuSalt）は入れない
 */

import { OPEN_CELLS } from './board.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const choosing = game.phase === 'goals';
    return {
        you: seat,
        solo: game.solo,
        setup: game.options.setup,
        turns: OPEN_CELLS.length,
        cats: game.cats.map(c => ({ id: c.id, patterns: [...c.patterns] })),
        players: game.players.map(p => {
            const mine = p.id === seat;
            return {
                id: p.id,
                name: p.name,
                isCPU: p.isCPU,
                board: p.board,
                quilt: [...p.quilt],
                hand: mine ? [...p.hand] : null,
                handCount: p.hand.length,
                offered: mine && p.offered ? [...p.offered] : null,
                goals: p.goals && (!choosing || mine) ? [...p.goals] : null,
                chosen: !!p.goals,
                buttons: p.buttons.map(b => ({ ...b })),
                rainbow: p.rainbow,
                cats: p.cats.map(c => ({ ...c })),
                placed: p.placed
            };
        }),
        market: [...game.market],
        bagCount: game.bag.length,
        current: game.current,
        turnNumber: game.turnNumber,
        phase: game.phase,
        answering: game.actors(),
        result: game.result ? structuredClone(game.result) : null,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
