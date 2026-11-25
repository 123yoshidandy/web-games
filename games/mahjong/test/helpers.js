import Game from '../public/js/game.js';
import { parseTiles } from '../public/js/tiles.js';

export const players = (cpu = false) => ['P1', 'P2', 'P3', 'P4'].map(name => ({ name, isCPU: cpu }));
export const makeGame = (seed = 1, length = 'east') => new Game(players(), { seed, length });

/**
 * 局の途中の状態を作る
 * hands: 席ごとの手牌（手番の人は14枚。最後の1枚をツモった牌とする）
 * draws: このあとツモる牌（順に）。dora: ドラ表示牌（既定は北で、ドラは東）。ura: 裏ドラ表示牌。turn: 手番
 * 残りの牌は山の手前（あとでツモる側）と王牌に入れる
 */
export function arrange(game, { hands, draws = '', dora = '4z', ura = null, turn = game.dealer, wallSize = null }) {
    const used = new Set();
    const handIds = hands.map(text => parseTiles(text, used));
    const drawIds = parseTiles(draws, used);
    const doraId = dora ? parseTiles(dora, used)[0] : null;
    const uraId = ura ? parseTiles(ura, used)[0] : null;
    const rest = Array.from({ length: 136 }, (_, i) => i).filter(id => !used.has(id));
    const dead = rest.splice(0, 14);
    if (doraId !== null) dead[4] = doraId;
    if (uraId !== null) dead[5] = uraId;
    let wall = [...rest, ...[...drawIds].reverse()];
    if (wallSize !== null) wall = wall.slice(wall.length - wallSize);
    const h = game.h;
    h.hands = handIds;
    h.wall = wall;
    h.dead = dead;
    h.turn = turn;
    h.drawn = handIds[turn].length % 3 === 2 ? handIds[turn].at(-1) : null;
    h.noCalls = false;
    h.discardCount = [1, 1, 1, 1];
    game.phase = 'turn';
}

export const tile = (text) => parseTiles(text)[0];

// 種類で手牌から1枚選ぶ（赤でないほう）
export function pick(game, seat, text) {
    const kind = Math.floor(tile(text) / 4);
    const ids = game.h.hands[seat].filter(id => id >> 2 === kind);
    return ids.find(id => (id & 3) !== 0) ?? ids[0];
}

export function act(game, seat, command) {
    if (!game.applyCommand(seat, command)) throw new Error(`${seat} ${JSON.stringify(command)}: ${game.lastError}`);
}

// 呼べる人が全員見送る
export function passAll(game) {
    while (game.phase === 'call') act(game, game.actors()[0], { type: 'pass' });
}

export const snapshot = (game) => JSON.stringify({
    players: game.players, round: game.round, h: game.h, phase: game.phase, result: game.result,
    final: game.final, commands: game.commands, logs: game.logs, events: game.events
});
