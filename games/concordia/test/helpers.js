import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

export const newGame = (n = 3, seed = 1) => new Game(players(n), { seed });

// 手札の中の、その種類のカードの id
export const cardOf = (game, seat, type) => game.players[seat].hand.find(id => game.cards[id].type === type);

// 品をそろえる
export function setGoods(game, seat, goods) {
    const p = game.players[seat];
    Object.keys(p.goods).forEach(g => { p.goods[g] = goods[g] ?? 0; });
}

// 都市の品を決める（ほかの都市と入れ替えずに書き換える）
export function setCityGood(game, city, good) {
    game.cityGoods[city] = good;
}

// 比べるための状態の写し（断った理由は除く）
export function snapshot(game) {
    const { lastError, ...rest } = game;
    return JSON.stringify(rest);
}
