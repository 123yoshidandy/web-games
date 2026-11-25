import { expect } from 'vitest';
import Game from '../public/js/game.js';

export const players = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));

export function newGame(n = 2, options = {}) {
    return new Game(players(n), { seed: 1, ...options });
}

// カードを、どこにあっても（山札・捨て札・手札・場札）取り出す
export function take(game, id) {
    const remove = list => { const i = list.indexOf(id); if (i >= 0) list.splice(i, 1); };
    remove(game.deck);
    remove(game.discardPile);
    for (const p of game.players) {
        remove(p.hand);
        remove(p.tableau);
        p.goods = p.goods.filter(g => g !== id);
    }
    return id;
}

export function setHand(game, seat, ids) {
    const p = game.players[seat];
    game.discardPile.push(...p.hand);
    p.hand = [];
    ids.forEach(id => p.hand.push(take(game, id)));
}

// 場札を置き換える（goods は商品の載った世界）
export function setTableau(game, seat, ids, goods = []) {
    const p = game.players[seat];
    game.discardPile.push(...p.tableau);
    p.tableau = [];
    p.goods = [];
    ids.forEach(id => p.tableau.push(take(game, id)));
    p.goods = [...goods];
}

// 山札の一番上に置く（先に引かれる順に並べる）
export function stackDeck(game, ids) {
    for (const id of [...ids].reverse()) game.deck.push(take(game, id));
}

export function ok(game, seat, command) {
    const result = game.applyCommand(seat, command);
    expect(result, game.lastError ?? '').toBe(true);
}

export function ng(game, seat, command) {
    const before = snapshot(game);
    expect(game.applyCommand(seat, command)).toBe(false);
    expect(snapshot(game)).toBe(before);
    return game.lastError;
}

// 最初の捨て札を済ませる（手札の先頭 2 枚）
export function skipStart(game) {
    game.players.forEach((p, i) => ok(game, i, { type: 'startDiscard', cards: p.hand.slice(0, 2) }));
}

// 全員が行動を選ぶ（actions[seat] は行動の配列か 1 つの行動）
export function choose(game, actions) {
    actions.forEach((a, i) => ok(game, i, { type: 'action', actions: Array.isArray(a) ? a : [a] }));
}

export function snapshot(game) {
    return JSON.stringify({
        players: game.players, deck: game.deck, discard: game.discardPile, pool: game.pool, phase: game.phase,
        pending: game.pending, chosen: game.chosen, choices: game.choices, round: game.round, commands: game.commands.length
    });
}
