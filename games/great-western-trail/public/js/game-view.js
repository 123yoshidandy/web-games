/**
 * プレイヤーから見てよい情報だけを集めたビュー（JSON にできる形）
 * - 自分の山札は、並びを伏せて中身だけ（並べ替えて渡す）
 * - ほかの人の手札は枚数だけ。山札と手札の牛は、買ったものが見えているので中身を渡す（目標カードは伏せる）
 * - カンザスシティの山・牛の山・目標カードの山は、枚数だけ（中身は 0 で埋める）
 * 画面は、このビューの state にルールの関数を当てて、選べる手を求める
 */

import { card } from './data.js';
import { clone, ranking } from './rules.js';

const sortIds = (ids) => [...ids].sort();

export function createGameView(game, seat, { since = 0 } = {}) {
    const s = game.state;
    const state = clone(s);
    delete state.rng; // 乱数の状態は送らない（あれば山札の並びやこれから引くカードを計算し直せてしまう）
    state.supply = s.supply.map(pile => pile.map(() => 0));
    state.marketStack = s.marketStack.map(() => 0);
    state.objStack = s.objStack.map(() => 0);
    state.players.forEach(p => {
        if (p.seat === seat) {
            p.deck = sortIds(p.deck);
            return;
        }
        const hidden = [...p.deck, ...p.hand];
        p.handCount = p.hand.length;
        p.hiddenObjectives = hidden.filter(id => card(id).kind === 'objective').length;
        p.deck = sortIds(hidden.filter(id => card(id).kind === 'cattle'));
        p.hand = [];
    });
    state.players.forEach(p => { p.handCount ??= p.hand.length; });
    const over = s.phase === 'over';
    return {
        seat,
        state,
        over,
        winners: [...s.winners],
        results: over ? game.results() : null,
        standings: over ? null : ranking(state).map(r => ({ seat: r.seat, total: r.total })),
        logs: game.logs.filter(l => l.seq > since),
        logCount: game.logs.length
    };
}
