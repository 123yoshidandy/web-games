import Game from '../public/js/game.js';
import { CELLS, STORM_START } from '../public/js/data.js';

export const players = (n = 2, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 2, { seed = 1, level = 'normal', roles } = {}) => new Game(players(n), { seed, level, roles });

// 盤面の砂をすべて消し、嵐の目を真ん中に戻す
export function clearSand(game) {
    game.tiles.forEach(t => { t.sand = 0; });
}

// 種類のタイルを、マス pos に置く（そこにあったタイルと入れ替える。駒はマスに残す）
export function placeKind(game, kind, pos, pick = () => true) {
    const tile = game.tiles.find(t => t.kind === kind && pick(t));
    const from = game.posOf(tile.id);
    const old = game.grid[pos];
    game.players.forEach(p => {
        if (p.tile === old && old !== null) p.tile = tile.id;
        else if (p.tile === tile.id) p.tile = old;
    });
    [game.grid[pos], game.grid[from]] = [game.grid[from], game.grid[pos]];
    if (game.storm === pos) game.storm = from;
    return tile;
}

// 席 seat の駒を、マス pos のタイルへ
export const moveTo = (game, seat, pos) => { game.players[seat].tile = game.grid[pos]; };

// 嵐のカードの山の上に、id のカードを並べる
export function stackStorm(game, ids) {
    game.stormDeck = [...ids, ...game.stormDeck.filter(id => !ids.includes(id))];
}

export const snapshot = (game) => JSON.stringify({
    tiles: game.tiles, grid: game.grid, storm: game.storm, parts: game.parts, peeked: game.peeked, shields: game.shields,
    gearDeck: game.gearDeck, stormDeck: game.stormDeck, stormDiscard: game.stormDiscard, meter: game.meter, players: game.players,
    current: game.current, phase: game.phase, actionsLeft: game.actionsLeft, calmed: game.calmed, stormLeft: game.stormLeft,
    result: game.result, commands: game.commands, logs: game.logs, turnNo: game.turnNo
});

export { CELLS, STORM_START };
