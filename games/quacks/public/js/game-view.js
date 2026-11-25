/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 袋の中身は数だけ（並びは見せない）。袋に何が入っているかは、実物でも買うところが見えるので全員分を見せる
 * - カラスなどで引いて選んでいる材料と、選択の中身は本人だけ
 * 画面はビューだけを見て描く。オンライン対戦では、このビューをそのまま各端末に送る
 */

import { ROUNDS, fortuneById, chipColor, chipValue } from './data.js';

const countBag = (bag) => bag.reduce((map, chip) => ({ ...map, [chip]: (map[chip] ?? 0) + 1 }), {});

// 次に引いたら爆発する確率
export function explodeRisk(bag, whites, limit) {
    if (bag.length === 0) return 0;
    return bag.filter(chip => chipColor(chip) === 'W' && whites + chipValue(chip) > limit).length / bag.length;
}

// seat：見る人の席（null なら観戦者）。since：このログの数より後だけを送る。events：演出用のイベントを入れるか
export function createGameView(game, seat, { since = 0, events = true } = {}) {
    const limit = game.whiteLimit();
    const me = seat === null ? null : game.players[seat];
    const view = {
        you: seat,
        round: game.round,
        rounds: ROUNDS,
        phase: game.phase,
        fortune: fortuneById(game.fortune),
        whiteLimit: limit,
        actors: game.actors(),
        players: game.players.map(p => ({
            id: p.id,
            name: p.name,
            isCPU: p.isCPU,
            score: p.score,
            rubies: p.rubies,
            droplet: p.droplet,
            flask: p.flask,
            rats: p.rats,
            bagCount: p.bag.length,
            bag: countBag(p.bag),
            pot: p.pot.map(e => ({ ...e })),
            brew: p.brew ? {
                start: p.brew.start, pos: p.brew.pos, whites: p.brew.whites,
                exploded: p.brew.exploded, done: p.brew.done, stopped: p.brew.stopped
            } : null,
            result: p.result ? structuredClone(p.result) : null,
            shopped: p.shopped,
            final: p.final ? { ...p.final } : null,
            waiting: p.prompts.length > 0
        })),
        me: null,
        winners: [...game.winners],
        logs: game.logs.slice(Math.max(0, since)),
        logCount: game.logs.length,
        events: events ? game.events.map(event => structuredClone(event)) : []
    };
    if (me) {
        const b = me.brew;
        const brewing = game.phase === 'brew' && b && !b.done && !b.pending;
        view.me = {
            prompt: me.prompts[0] ? structuredClone(me.prompts[0]) : null,
            pending: b?.pending ? structuredClone(b.pending) : null,
            canDraw: brewing && me.bag.length > 0 && b.pos < 52,
            canStop: brewing,
            canFlask: brewing && b.canFlask && me.flask,
            canBubble: brewing && b.canBubble,
            canMandrake: brewing && b.canMandrake,
            canRestart: game.canRestart(me),
            risk: b ? explodeRisk(me.bag, b.whites, limit) : 0,
            coins: game.phase === 'shop' ? me.result?.coins ?? 0 : 0,
            shopping: game.phase === 'shop' && !me.shopped
        };
    }
    return view;
}
