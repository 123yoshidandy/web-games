import { expect } from 'vitest';
import Game from '../public/js/game.js';
import { GOODS } from '../public/js/data.js';

export const players = n => Array.from({ length: n }, (_, i) => ({ name: `P${i}` }));

export function newGame(n = 3, options = {}) {
    return new Game(players(n), { seed: 1, ...options });
}

export function ok(game, seat, command) {
    const result = game.applyCommand(seat, command);
    expect(result, game.lastError ?? '').toBe(true);
}

export function ng(game, seat, command) {
    const before = snapshot(game);
    expect(game.applyCommand(seat, command)).toBe(false);
    expect(snapshot(game)).toBe(before);
    return game.lastError;
}

// 役割を名前で選ぶ（いま選ぶ番の人が）
export function pick(game, key) {
    const seat = game.decision.seat;
    const role = game.roles.find(r => r.key === key && r.taken === null);
    ok(game, seat, { type: 'role', role: role.id });
    return seat;
}

// 都市に建物を置く（[key, 入植者]）
export function setCity(game, seat, list) {
    game.players[seat].city = list.map(([key, colonists = 1]) => ({ key, colonists }));
}

export function setIsland(game, seat, list) {
    game.players[seat].island = list.map(([type, occupied = true]) => ({ type, occupied }));
}

export function setGoods(game, seat, goods) {
    game.players[seat].goods = { ...Object.fromEntries(GOODS.map(g => [g, 0])), ...goods };
}

export function snapshot(game) {
    return JSON.stringify({
        players: game.players, roles: game.roles, decision: game.decision, phase: game.phase, ships: game.ships, supply: game.supply,
        trading: game.tradingHouse, colonists: game.colonists, ship: game.shipColonists, chips: game.chips, faceUp: game.faceUp,
        deck: game.deck.length, buildings: game.buildings, round: game.round, commands: game.commands.length
    });
}

// いちばん控えめな合法な手で、ゲームが終わるまで進める（役割は avoid にないものを先に選ぶ）
export function playOut(game, avoid = ['mayor', 'settler']) {
    let steps = 0;
    while (!game.isOver()) {
        if (++steps > 5000) throw new Error('終わらない');
        const d = game.decision;
        const p = game.players[d.seat];
        switch (d.kind) {
            case 'role': {
                const free = game.roles.filter(r => r.taken === null);
                const r = free.find(x => !avoid.includes(x.key)) ?? free[0];
                ok(game, d.seat, { type: 'role', role: r.id });
                break;
            }
            case 'mayor': {
                let left = d.total;
                const island = p.island.map(() => left-- > 0);
                left = Math.max(0, left);
                const city = p.city.map(c => { const k = Math.min(left, c.key === 'coffeeRoaster' ? 2 : ['indigoPlant', 'sugarMill', 'tobaccoStorage'].includes(c.key) ? 3 : 1); left -= k; return k; });
                ok(game, d.seat, { type: 'mayor', island, city });
                break;
            }
            case 'ship': ok(game, d.seat, { type: 'ship', ...d.options[0] }); break;
            case 'store': ok(game, d.seat, { type: 'store', warehouse: d.kinds.slice(0, d.slots), single: null }); break;
            case 'settle': ok(game, d.seat, { type: 'settle', take: null }); break;
            case 'build': ok(game, d.seat, { type: 'build', building: null }); break;
            default: ok(game, d.seat, { type: d.kind, good: null });
        }
    }
}
