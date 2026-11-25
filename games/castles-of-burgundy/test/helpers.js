import Game from '../public/js/game.js';
import { TILES, CELLS } from '../public/js/data.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0 }));

// 席0が最初の手番のゲーム
export const newGame = (n = 2, seed = 1) => new Game(players(n), { seed, start: 0 });

// 条件に合うタイルを、山（なければ区域・黒の区域）から抜き出す
export function pullTile(game, pred) {
    for (const list of Object.values(game.supply)) {
        const i = list.findIndex(id => pred(TILES[id]));
        if (i >= 0) return list.splice(i, 1)[0];
    }
    for (const slots of game.depots) {
        const s = slots.find(x => x.tile !== null && pred(TILES[x.tile]));
        if (s) {
            const id = s.tile;
            s.tile = null;
            return id;
        }
    }
    const i = game.black.findIndex(id => id !== null && pred(TILES[id]));
    if (i >= 0) {
        const id = game.black[i];
        game.black[i] = null;
        return id;
    }
    throw new Error('そのタイルはありません');
}

// 保管場所にタイルを入れる
export function giveStorage(game, seat, pred) {
    const id = pullTile(game, pred);
    game.players[seat].storage.push(id);
    return id;
}

// マスに直接タイルを置く（点や効果はなし）
export function fill(game, seat, cellId, pred = (t) => t.kind === CELLS[cellId].kind && !t.building) {
    const id = pullTile(game, pred);
    game.players[seat].estate[cellId] = id;
    return id;
}

// 区域のマスにタイルを入れる（そのマスの元のタイルは捨てる）
export function putInDepot(game, depot, slot, pred) {
    const id = pullTile(game, pred);
    game.depots[depot][slot].tile = id;
    return id;
}

export const setDice = (game, seat, dice) => {
    game.players[seat].dice = [...dice];
    game.players[seat].used = [false, false];
};

// その色・目のマスで、置いたタイルのとなりのもの
export const cellAt = (row, col) => CELLS.findIndex(c => c.row === row && c.col === col);

// 知識タイルを公国の空いた知識のマスに直接置く
export function giveKnowledge(game, seat, k) {
    const p = game.players[seat];
    const cell = CELLS.find(c => c.kind === 'knowledge' && p.estate[c.id] === null);
    return fill(game, seat, cell.id, t => t.knowledge === k);
}

// 全部のタイル（山・区域・黒・保管場所・公国）の数
export function totalTiles(game) {
    return Object.values(game.supply).reduce((s, l) => s + l.length, 0)
        + game.depots.flat().filter(s => s.tile !== null).length
        + game.black.filter(t => t !== null).length
        + game.players.reduce((s, p) => s + p.storage.length + p.estate.filter(t => t !== null).length, 0);
}

export function snapshot(game) {
    const { random, lastError, ...rest } = game;
    return JSON.stringify(rest);
}
