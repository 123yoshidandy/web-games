import Game from '../public/js/game.js';
import { GHOSTS } from '../public/js/data.js';

export const players = (n = 4, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i + 1}`, isCPU: cpu }));
export const makeGame = ({ seed = 1, level = 'normal', n = 4, cpu = false } = {}) => new Game(players(n, cpu), { seed, level });

// 名前から幽霊の番号
export const ghost = (name) => {
    const g = GHOSTS.find(x => x.name === name);
    if (!g) throw new Error(`幽霊がない: ${name}`);
    return g.id;
};

// 盤を空にして、seat の陽の段階（動く前）にする
export function yangOf(game, seat = 0) {
    game.slots = game.slots.map(() => null);
    game.buddhaAt = game.buddhaAt.map(() => false);
    game.tiles.forEach(t => { t.haunted = false; });
    game.queue = [];
    game.queueThen = null;
    game.current = seat;
    game.phase = 'yang';
    game.moved = false;
    game.dice = null;
    return game;
}

// 幽霊を置き場に直接置く（来たときの効果は起こさない）
export function put(game, slot, name, haunter = null) {
    const id = typeof name === 'number' ? name : ghost(name);
    game.slots[slot] = { card: id, haunter: haunter ?? (GHOSTS[id].arrive.includes('haunter') ? -1 : null) };
    return id;
}

// タイルの位置（鍵から）
export const tileOf = (game, key) => game.tiles.findIndex(t => t.key === key);

export const snapshot = (game) => JSON.stringify({
    players: game.players, tiles: game.tiles, deck: game.deck, discard: game.discard, slots: game.slots, buddhaAt: game.buddhaAt,
    temple: game.temple, prayer: game.prayer, mantraAt: game.mantraAt, current: game.current, turnNo: game.turnNo, phase: game.phase,
    moved: game.moved, dice: game.dice, queue: game.queue, result: game.result, commands: game.commands, logs: game.logs
});

// 誰かの手番を、最初に選べる手で進める（テストで局面を進めるため）
export function stepSimple(game) {
    const seat = game.actors()[0];
    if (game.phase === 'place') return game.applyCommand(seat, { type: 'place', slot: game.placeOptions(game.queue[0])[0] });
    if (game.phase === 'exorcise') return game.applyCommand(seat, { type: 'assign', targets: [] });
    return game.applyCommand(seat, { type: 'pass' });
}
