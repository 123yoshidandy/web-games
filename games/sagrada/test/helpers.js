import Game from '../public/js/game.js';
import { PATTERNS, CELLS, COLORS } from '../public/js/data.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

export const newGame = (n = 2, seed = 1, options = {}) => new Game(players(n), { seed, ...options });

// 窓を選んで1ラウンド目を始める（names[i] があれば、その名前の窓を配ったことにする）
export function startPlay(n = 2, names = [], seed = 1, options = {}) {
    const game = newGame(n, seed, options);
    game.players.forEach((p, i) => {
        if (names[i]) {
            const id = PATTERNS.findIndex(pt => pt.name === names[i]);
            if (!p.offers.includes(id)) p.offers = [id, ...p.offers.slice(1)];
        }
    });
    game.players.forEach((p, i) => {
        const id = names[i] ? PATTERNS.findIndex(pt => pt.name === names[i]) : p.offers[0];
        if (!game.applyCommand(i, { type: 'choose', pattern: id })) throw new Error(game.lastError);
    });
    return game;
}

// 窓をすべて制約なしにする（決まりの確かめ用）
export const blankPattern = () => ({ id: -1, name: 'blank', difficulty: 3, card: 0, cells: Array(CELLS).fill(null) });

let nextId = 1000;
export const die = (color, value) => ({ id: nextId++, color, value });

// 'R3' のような文字から窓を作る（'..' は空き）
export function windowOf(text) {
    const codes = { R: 'red', Y: 'yellow', G: 'green', B: 'blue', P: 'purple' };
    return text.replace(/\s+/g, '').match(/.{2}/g).map(t => (t === '..' ? null : die(codes[t[0]], Number(t[1]))));
}

// プールを決める
export function setPool(game, dice) {
    game.pool = dice.map(d => ({ ...d }));
    return game.pool;
}

// 全部のダイスの数（袋・プール・ラウンドトラック・窓。1人用で払ったダイスは除かれる）
export function totalDice(game) {
    return COLORS.reduce((s, c) => s + game.bag[c], 0) + game.pool.length + game.roundTrack.flat().length
        + game.players.reduce((s, p) => s + p.window.filter(Boolean).length, 0);
}

export function act(game, seat, command) {
    if (!game.applyCommand(seat, command)) throw new Error(`${JSON.stringify(command)}: ${game.lastError}`);
}

// 比べるための状態の写し（関数の乱数と、断った理由は除く）
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
