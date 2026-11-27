import Game from '../public/js/game.js';
import { CELLS } from '../public/js/data.js';

export const players = (n = 2, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = (n = 2, { seed = 1, floors = 1, chars } = {}) => new Game(players(n), { seed, floors, chars });

// 階の部屋を、種類の並びで置き換える（数字は 1〜6 を順に。めくった状態にするかは revealed）
export function setRooms(game, f, types, { revealed = false } = {}) {
    game.floors[f].tiles = types.map((type, i) => ({
        type, num: type === 'safe' ? 0 : (i % 6) + 1, revealed, cracked: false, alarm: false, open: false,
        lav: type === 'lavatory' ? 3 : 0, used: false
    }));
}

// 壁をなくす
export const noWalls = (game, f = 0) => { game.floors[f].walls = []; };

// 見張りの場所・行き先・巡回の山を決める
export function placeGuard(game, f, cell, dest, deck = Array.from({ length: CELLS }, (_, i) => i).filter(c => c !== cell && c !== dest)) {
    const g = game.floors[f].guard;
    g.active = true;
    g.cell = cell;
    g.dest = dest;
    g.deck = [...deck];
    g.discard = [];
}

export const place = (game, seat, f, cell) => { game.players[seat].floor = f; game.players[seat].cell = cell; };

export const snapshot = (game) => JSON.stringify({
    players: game.players, floors: game.floors, hacks: game.hacks, current: game.current, phase: game.phase, actionsLeft: game.actionsLeft,
    turn: game.turn, invisible: game.invisible, spotted: game.spotted, toolDeck: game.toolDeck, lootDeck: game.lootDeck,
    result: game.result, commands: game.commands, logs: game.logs
});
