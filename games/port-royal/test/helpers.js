import Game from '../public/js/game.js';
import { CARDS } from '../public/js/cards.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

// 席0が最初の手番のゲーム
export const newGame = (n = 3, seed = 1) => new Game(players(n), { seed, startPlayer: 0 });

// 条件に合うカードの番号を、使われていないものから順に返す
export function find(where, count = 1, used = new Set()) {
    const out = [];
    for (const c of CARDS) {
        if (out.length >= count) break;
        if (used.has(c.id)) continue;
        if (Object.entries(where).every(([k, v]) => c[k] === v)) {
            out.push(c.id);
            used.add(c.id);
        }
    }
    return out;
}

// 山の上（次にめくる順）を決める。ほかの場所にあるカードは山から抜く
export function stackDeck(game, ids) {
    const rest = game.deck.filter(id => !ids.includes(id));
    game.deck = [...rest, ...[...ids].reverse()];
}

// 人物を持たせる（山から抜いて置く）
export function give(game, seat, ids) {
    game.deck = game.deck.filter(id => !ids.includes(id));
    game.players.forEach(p => { p.coins = p.coins.filter(id => !ids.includes(id)); });
    game.players[seat].display.push(...ids);
}

// コインの枚数を決める（山の下から取る）
export function setCoins(game, seat, n) {
    const p = game.players[seat];
    game.deck.push(...p.coins);
    p.coins = game.deck.splice(0, n);
}

export const coins = (game) => game.players.map(p => p.coins.length);

export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
