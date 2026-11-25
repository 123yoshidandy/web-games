import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

// 席0の手番の初めにそろえたゲーム。hands・fields・deck を指定できる
export function newGame(n = 4, { seed = 1, hands, fields, deck } = {}) {
    const game = new Game(players(n), { seed });
    game.active = 0;
    game.phase = 'plant';
    game.planted = 0;
    game.turn = 1;
    if (hands) hands.forEach((h, i) => { game.players[i].hand = [...h]; });
    if (fields) fields.forEach((f, i) => { game.players[i].fields = f.map(x => (x ? { ...x } : null)); });
    if (deck) game.deck = [...deck];
    return game;
}

export function run(game, steps) {
    steps.forEach(([seat, command], i) => {
        if (!game.applyCommand(seat, command)) throw new Error(`${i}: ${JSON.stringify(command)} ${game.lastError}`);
    });
}

// 全部のカードの枚数（山・捨て札・手札・畑・金・植える前・表）
export function totalCards(game) {
    return game.deck.length + game.discard.length + game.faceUp.length
        + game.players.reduce((s, p) => s + p.hand.length + p.coins.length + p.toPlant.length + p.fields.reduce((t, f) => t + (f ? f.n : 0), 0), 0);
}

export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
