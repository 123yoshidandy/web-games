import Game from '../public/js/game.js';
import { RACES, POWERS, isWater } from '../public/js/data.js';

export const players = (n, cpu = false) => Array.from({ length: n }, (_, i) => ({ name: `P${i}`, isCPU: cpu || i > 0, cpuLevel: 'normal' }));

export function newGame(n = 2, seed = 1) {
    return new Game(players(n), { seed });
}

const blank = () => ({ race: null, count: 0, lair: false, fort: false, camps: 0, hero: false, hole: false, dragon: false });

// 失われた部族を取り除いた、空の地図
export function clearMap(game) {
    game.regions = game.regions.map(() => blank());
    return game;
}

// 席に種族を持たせる。regions：{ 領域: 部隊の数 }。declined なら衰退した種族として持たせる
export function give(game, seat, race, power, { regions = {}, hand = 0, declined = false } = {}) {
    game.bands[race] = { race, power, seat, declined, hand, holes: 0, wealthyPaid: false, amazonBonus: 0 };
    const player = game.players[seat];
    if (declined) player.declined.push(race);
    else player.active = race;
    Object.entries(regions).forEach(([id, count]) => Object.assign(game.regions[Number(id)], { race, count }));
    return game.bands[race];
}

// 席の手番の征服から始める
export function turnOf(game, seat, race = game.players[seat].active) {
    game.current = seat;
    game.turnInfo = { nonEmpty: 0, attacked: [] };
    game.players[seat].lastConquered = [];
    game.startStep(race);
    return game;
}

export function run(game, steps) {
    steps.forEach(([seat, command], i) => {
        if (!game.applyCommand(seat, command)) throw new Error(`${i}: ${JSON.stringify(command)} ${game.lastError}`);
    });
}

export function snapshot(game) {
    const { random, lastError, map, ...rest } = game;
    return JSON.stringify(rest);
}

// 条件に合う領域を探す
export function findRegion(game, test, skip = []) {
    const found = game.map.regions.find(info => !skip.includes(info.id) && test(info));
    if (!found) throw new Error('条件に合う領域がありません');
    return found.id;
}

export const isLand = (info) => !isWater(info.terrain);
export const plainLand = (info) => isLand(info) && info.terrain !== 'mountain';

// 隣り合う陸の2つ（a は縁）
export function adjacentPair(game, testA = plainLand, testB = plainLand) {
    for (const a of game.map.regions) {
        if (!a.border || !testA(a)) continue;
        const b = a.adj.map(id => game.map.regions[id]).find(testB);
        if (b) return [a.id, b.id];
    }
    throw new Error('隣り合う領域がありません');
}

export const startTokens = (race, power) => RACES[race].tokens + POWERS[power].tokens;

// 縁の陸 a と、a に隣り合う陸 b・c
export function adjacentTriple(game) {
    for (const a of game.map.regions) {
        if (!a.border || !plainLand(a)) continue;
        const near = a.adj.filter(id => plainLand(game.map.regions[id]));
        if (near.length >= 2) return [a.id, near[0], near[1]];
    }
    throw new Error('隣り合う領域がありません');
}
