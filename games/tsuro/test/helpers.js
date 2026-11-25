import Game from '../public/js/game.js';
import { TILES, partnerOf } from '../public/js/tiles.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

export function newGame(n = 3, seed = 1) {
    return new Game(players(n), { seed });
}

// 駒を置く段階を飛ばして、駒を決めた場所に置き、seat の手番から始める
// positions: [{ cell, p }]（席の順）
export function startPlay(game, positions, current = 0) {
    game.players.forEach((p, i) => {
        p.mark = i;
        p.pos = { ...positions[i] };
    });
    game.phase = 'play';
    game.current = current;
    return game;
}

// want（{ 端点: つながる端点 }）を満たす、タイルと向き
export function findTile(want, { except = [] } = {}) {
    for (let tile = 0; tile < TILES.length; tile++) {
        if (except.includes(tile)) continue;
        for (let rot = 0; rot < 4; rot++) {
            if (Object.entries(want).every(([a, b]) => partnerOf({ tile, rot }, Number(a)) === b)) return { tile, rot };
        }
    }
    throw new Error(`タイルがありません: ${JSON.stringify(want)}`);
}

// 手札を決める（ほかの人の手札・山から取り除いて、数が合うようにする）
export function setHand(game, seat, tiles) {
    const all = new Set(tiles);
    game.pile = game.pile.filter(t => !all.has(t));
    game.players.forEach(p => { p.hand = p.hand.filter(t => !all.has(t)); });
    const back = game.players[seat].hand;
    game.players[seat].hand = [...tiles];
    game.pile.push(...back);
}

export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}

// タイルの総数（盤・手札・山）が35枚のまま
export function tileTotal(game) {
    return game.board.filter(Boolean).length + game.pile.length + game.players.reduce((s, p) => s + p.hand.length, 0);
}
