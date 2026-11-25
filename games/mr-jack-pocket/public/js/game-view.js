/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * オンライン対戦では、このビューをそのまま各端末に送る（隠す役目もここで持つ）
 * - ジャックの正体と、ジャック側が引いたアリバイカードは、ジャック側にだけ入れる（刑事側には枚数だけ）
 * - アリバイの山は枚数だけ（並びは入れない）
 * - 盤・刑事・行動タイル・刑事側が引いたアリバイ・目撃で得た砂時計は全員に見せる
 * - 終わったら、ジャックの正体と全部のカードを見せる
 * - シードと CPU の迷いに使う値（cpuSalt）は入れない
 */

import { JACK } from './game.js';
import { SUSPECTS } from './data.js';

const HOURS = Object.fromEntries(SUSPECTS.map(s => [s.key, s.hourglasses]));

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る
export function createGameView(game, seat, { since = 0 } = {}) {
    const over = game.isOver();
    const jackSide = over || seat === JACK;
    return {
        you: seat,
        round: game.round,
        pick: game.pick,
        phase: game.phase,
        answering: game.actors(),
        players: game.players.map(p => ({ id: p.id, name: p.name, isCPU: p.isCPU })),
        tiles: game.tiles.map(t => ({ ...t })),
        detectives: { ...game.detectives },
        tokens: game.tokens.map(t => ({ ...t })),
        rotated: [...game.rotated],
        deckCount: game.deck.length,
        detectiveCards: [...game.detectiveCards],
        jackCardCount: game.jackCards.length,
        jackCards: jackSide ? [...game.jackCards] : null,
        hourglasses: game.hourglasses,
        totalHourglasses: jackSide ? game.hourglasses + game.jackCards.reduce((s, k) => s + HOURS[k], 0) : null,
        jack: jackSide ? game.jack : null,
        lastWitness: game.lastWitness ? structuredClone(game.lastWitness) : null,
        standoff: game.standoff,
        winner: game.winner,
        endReason: game.endReason,
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: game.events.map(e => structuredClone(e))
    };
}
