import Game from '../public/js/game.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

// 太陽駒の組を決めて、席0から始めるゲーム（組の大きい順に席0から配る）
export function newGame(n = 3, seed = 1) {
    const game = new Game(players(n), { seed });
    return game;
}

// 袋の上に、決めたタイルを積む
export function setBag(game, tiles) {
    game.bag.unshift(...tiles);
}

export function setSuns(game, seat, values, down = []) {
    game.players[seat].suns = [...values.map(value => ({ value, up: true })), ...down.map(value => ({ value, up: false }))];
}

export function setTiles(game, seat, tiles) {
    game.players[seat].tiles = { ...tiles };
}

export function setTurn(game, seat) {
    game.current = seat;
    game.phase = 'play';
}

// 全部のタイルの数（袋・競りのトラック・ラーのトラック・手元）。捨てたタイルは数えない
export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
