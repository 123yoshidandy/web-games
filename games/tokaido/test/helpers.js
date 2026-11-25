import Game from '../public/js/game.js';
import { BOARD } from '../public/js/data.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

export const newGame = (n = 3, seed = 1) => new Game(players(n), { seed });

// 旅人を決めて旅を始める（travelers[i] が null なら、配られた1枚目）
export function startTravel(n = 3, travelers = [], seed = 1) {
    const game = newGame(n, seed);
    game.players.forEach((p, i) => {
        const t = travelers[i];
        if (t) p.offers = [t, p.offers.find(o => o !== t) ?? p.offers[0]];
    });
    game.players.forEach((p, i) => {
        if (!game.applyCommand(i, { type: 'choose', traveler: travelers[i] ?? p.offers[0] })) throw new Error(game.lastError);
    });
    return game;
}

// こまを置く。spots[t] = 位置。同じ位置なら、配列の前の方が先に着いた（前）
export function place(game, spots) {
    spots.forEach((pos, t) => {
        game.tokens[t].pos = pos;
        game.tokens[t].seq = t + 1;
    });
    game.seq = spots.length;
}

// 動かす人が to へ進む
export function moveTo(game, to) {
    const seat = game.moverSeat();
    if (!game.applyCommand(seat, { type: 'move', to })) throw new Error(`${to}: ${game.lastError}`);
    return seat;
}

export function act(game, seat, command) {
    if (!game.applyCommand(seat, command)) throw new Error(`${JSON.stringify(command)}: ${game.lastError}`);
}

// 種類の最初のマス（from より後）
export const firstOf = (type, from = 0) => BOARD.findIndex((s, i) => i > from && s.type === type);

// 全部の札の数（山・場・集めた札・宿場の食事・待っている手の札）
export function totalCards(game) {
    const held = game.players.reduce((s, p) => s + p.souvenirs.length + p.meals.length + p.encounters.length + p.springs.length, 0);
    const decks = Object.values(game.decks).reduce((s, d) => s + d.length, 0);
    const pendingCards = game.pending?.cards?.length ?? 0;
    return held + decks + (game.inn?.meals.length ?? 0) + pendingCards;
}
export const TOTAL_CARDS = 24 + 25 + 14 + 12;

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
