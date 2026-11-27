import Game, { DRY } from '../public/js/game.js';
import { GRID, CELLS, TILES } from '../public/js/data.js';

export const players = (n = 2, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 2, { seed = 1, level = 'normal', roles } = {}) => new Game(players(n), { seed, level, roles });
export const T = (key) => TILES.find(t => t.key === key).id;

// 島の並びを、タイルの番号順に固定する（タイル i をマス CELLS[i] に置く）
// 上から：0 1 / 2 3 4 5 / 6 7 8 9 10 11 / 12 13 14 15 16 17 / 18 19 20 21 / 22 23
// たとえば 8 の上下左右は 3・14・7・9、斜めは 2・4・13・15
export function fixLayout(game) {
    game.cellOf = TILES.map((_, i) => CELLS[i]);
    game.tileAt = Array(GRID * GRID).fill(null);
    CELLS.forEach((cell, i) => { game.tileAt[cell] = i; });
}

// 島を全部乾かし、浸水の捨て札を山に戻す
export function dryAll(game) {
    game.tiles = game.tiles.map(() => DRY);
    game.floodDeck = [...game.floodDeck, ...game.floodDiscard];
    game.floodDiscard = [];
}

export const place = (game, seat, tile) => { game.players[seat].tile = tile; };
export const setHand = (game, seat, cards) => { game.players[seat].hand = [...cards]; };

export const snapshot = (game) => JSON.stringify({
    players: game.players, tiles: game.tiles, captured: game.captured, water: game.water,
    treasureDeck: game.treasureDeck, treasureDiscard: game.treasureDiscard, floodDeck: game.floodDeck, floodDiscard: game.floodDiscard,
    floodRemoved: game.floodRemoved, current: game.current, phase: game.phase, actionsLeft: game.actionsLeft, pilotUsed: game.pilotUsed,
    floodLeft: game.floodLeft, swimQueue: game.swimQueue, resume: game.resume, result: game.result, commands: game.commands, logs: game.logs
});
