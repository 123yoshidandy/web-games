/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（山と袋の順を隠す役目もここで持つ）
 * - 山は枚数だけ。袋は動物ごとの数だけ（場と地に出ていない数なので、だれでも数えられる。引く順は入れない）
 * - 全員の地・自然トークン・場は全員に見せる
 * - シードと CPU の迷いに使う値（cpuSalt）は入れない（山と袋の順が分かってしまうため）
 */

import { ANIMALS } from './tiles.js';
import { TURNS } from './game.js';

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const mine = seat !== null && game.current === seat && !game.isOver();
    const bag = Object.fromEntries(ANIMALS.map(a => [a, 0]));
    game.bag.forEach(a => { bag[a] += 1; });
    return {
        you: seat,
        solo: game.solo,
        cards: { ...game.cards },
        turns: TURNS,
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            nature: p.nature,
            turns: p.turns,
            env: structuredClone(p.env)
        })),
        display: { tiles: [...game.display.tiles], tokens: [...game.display.tokens] },
        stackCount: game.stack.length,
        bagCount: game.bag.length,
        bag,
        current: game.current,
        turnNumber: game.turnNumber,
        phase: game.phase,
        answering: game.actors(),
        canReplace3: mine && game.canReplace3(),
        replaced3: game.replaced3,
        result: game.result ? structuredClone(game.result) : null,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
