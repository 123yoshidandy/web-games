import Game from '../public/js/game.js';
import { CARDS } from '../public/js/cards.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

// 画家 artist・種類 type の k 枚目のカードの番号
export function card(artist, type, k = 0) {
    const list = CARDS.filter(c => c.artist === artist && c.type === type);
    if (k >= list.length) throw new Error(`${artist} ${type} ${k}`);
    return list[k].id;
}

// 席0が出す番のゲーム。hands で手札を決められる（決めた札は山から抜く）
export function newGame(n = 3, { seed = 1, hands } = {}) {
    const game = new Game(players(n), { seed });
    game.auctioneer = 0;
    if (hands) {
        const used = hands.flat();
        game.players.forEach((p, i) => { p.hand = [...(hands[i] ?? [])]; });
        game.deck = CARDS.map(c => c.id).filter(id => !used.includes(id));
    }
    return game;
}

export function run(game, steps) {
    steps.forEach(([seat, command], i) => {
        if (!game.applyCommand(seat, command)) throw new Error(`${i}: ${JSON.stringify(command)} ${game.lastError}`);
    });
}

export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}

// お金の合計（銀行とのやりとりを除けば変わらない）
export const totalMoney = (game) => game.players.reduce((s, p) => s + p.money, 0);
