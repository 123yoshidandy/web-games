import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

export const newGame = (n = 3, seed = 1) => new Game(players(n), { seed });

// 手札と場を決める（テストでは札の数は保たない）
export function setHand(game, seat, cards) {
    game.players[seat].hand = [...cards];
}

export function setTableau(game, seat, cards) {
    game.players[seat].tableau = cards.map(c => (typeof c === 'string' ? (c === 'wasabi' ? { type: 'wasabi', nigiri: null } : { type: c }) : { ...c }));
}

// 全部の札の数（山・捨て札・手札・場・取っておいたプリン）
export function totalCards(game) {
    const tableau = game.isOver() ? 0 : game.players.reduce((s, p) => s + p.tableau.reduce((t, c) => t + (c.nigiri ? 2 : 1), 0), 0);
    return game.deck.length + game.discards.length + tableau + game.players.reduce((s, p) => s + p.hand.length + p.puddings, 0);
}

// 全員に1枚ずつ選ばせる（cards[seat] が配列なら箸で2枚）
export function pickAll(game, cards) {
    cards.forEach((c, seat) => {
        const command = Array.isArray(c) ? { type: 'pick', card: c[0], second: c[1] } : { type: 'pick', card: c };
        if (!game.applyCommand(seat, command)) throw new Error(`${seat}: ${game.lastError}`);
    });
}

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
