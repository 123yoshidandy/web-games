import { expect } from 'vitest';
import Game from '../public/js/game.js';
import { DEFAULT_TEAM, SPECIES, MOVE_SLOTS, DEFAULT_RULES } from '../public/js/data.js';

export const team = (ids = DEFAULT_TEAM.map(t => t.id), rules = DEFAULT_RULES) => ids.map(id => ({ id, moves: SPECIES[id].pool.slice(0, MOVE_SLOTS), rules: rules.map(r => ({ ...r })) }));
export const TEAM_B = ['garchomp', 'gardevoir', 'scizor', 'lapras', 'arcanine', 'tyranitar'];

// 両方の編成を済ませて、対戦に入った局面（先手は席0、マップは0）
export function makeBattle({ seed = 1, a = team(), b = team(TEAM_B), map = 0, first = 0, cpu = false } = {}) {
    const game = new Game([{ name: 'A', isCPU: cpu }, { name: 'B', isCPU: cpu }], { seed, map, first });
    expect(game.applyCommand(0, { type: 'team', team: a }), game.lastError).toBe(true);
    expect(game.applyCommand(1, { type: 'team', team: b }), game.lastError).toBe(true);
    return game;
}

// ポケモンを置き直す（ほかのポケモンは盤の外の遠くへは動かさない。必要ならたおれた扱いにする）
export function put(game, seat, i, x, y) {
    const u = game.sides[seat].units[i];
    u.x = x;
    u.y = y;
}

export function faintAllBut(game, seat, keep = []) {
    game.sides[seat].units.forEach((u, i) => {
        if (!keep.includes(i)) {
            u.fainted = true;
            u.hp = 0;
        }
    });
}

export const snapshot = (game) => JSON.stringify({
    sides: game.sides, teams: game.teams, current: game.current, round: game.round, phase: game.phase,
    result: game.result, commands: game.commands, logs: game.logs
});
