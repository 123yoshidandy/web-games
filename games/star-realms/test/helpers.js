import Game from '../public/js/game.js';

export const players = (cpu = false) => [
    { name: 'A', isCPU: cpu, cpuLevel: 'normal' },
    { name: 'B', isCPU: true, cpuLevel: 'normal' }
];

// 席0から始まるゲーム
export const newGame = (seed = 1) => new Game(players(), { seed, startPlayer: 0 });

// カードを新しく作る（交易デッキからは取らない。テストで場面を作るため）
export const make = (game, key) => game.cards.push(key) - 1;

// 手札を keys にする（もとの手札は捨て札へ）
export function setHand(game, seat, keys) {
    const p = game.players[seat];
    p.discard.push(...p.hand);
    p.hand = keys.map(k => make(game, k));
    return p.hand;
}

// 基地を場に置く（この手番の効果はまだ使っていない扱い）
export function putBase(game, seat, key) {
    const id = make(game, key);
    game.players[seat].bases.push(id);
    return id;
}

// 交易の列を keys にする
export function setRow(game, keys) {
    game.tradeRow = keys.map(k => make(game, k));
    return [...game.tradeRow];
}

// 山札の上を keys にする
export function stackDeck(game, seat, keys) {
    const ids = keys.map(k => make(game, k));
    game.players[seat].deck.unshift(...ids);
    return ids;
}

export const handKeys = (game, seat) => game.players[seat].hand.map(id => game.keyOf(id));

export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
